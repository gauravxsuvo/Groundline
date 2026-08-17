"""Retrieval quality evaluation against the MS MARCO relevance labels.

The dataset ships `passages.is_selected`, MS MARCO's own human relevance
judgement: for a given query, the passage(s) marked 1 are the ones annotators
said actually answer it. `build_index.py` carries that label through onto every
chunk's metadata, so we can score retrieval without hand-labelling anything.

For each query we ask: did the passage the annotators picked come back in the
top k, and how high (recall@k and MRR@k). Queries whose source row has no
selected passage are skipped, since there is nothing to be right about.

    python scripts/eval_retrieval.py                  # production config, all strategies
    python scripts/eval_retrieval.py --sweep          # fusion weight sweep, dev/test split
    python scripts/eval_retrieval.py --strategy semantic --n 1000

The sweep is what set `rrf_dense_weight` in config.py. Results and the reasoning
are written up in docs/retrieval-quality.md.
"""

from __future__ import annotations

import argparse
import json
import random
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bm25s

from app.config import settings
from app.retrieval import embed
from app.retrieval import index as index_module
from app.retrieval import search as search_module
from app.retrieval.loader import StrategyBundle, load_strategy_bundle

STRATEGIES = ["passage_native", "metadata_aware", "hierarchical", "fixed_window", "semantic"]
QUERIES_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmark_queries.json"


def load_queries() -> list[dict]:
    if not QUERIES_PATH.exists():
        raise SystemExit(
            f"{QUERIES_PATH} not found. Run scripts/benchmark_latency.py once to cache the query set."
        )
    return json.loads(QUERIES_PATH.read_text(encoding="utf-8"))


def gold_by_query(bundle: StrategyBundle) -> dict[int, set[int]]:
    """Chunk positions annotators marked as answering each source query."""
    gold: dict[int, set[int]] = {}
    for position, chunk in enumerate(bundle.chunks):
        if chunk.metadata.get("is_selected") == 1:
            gold.setdefault(chunk.source_query_id, set()).add(position)
    return gold


def rankings(bundle: StrategyBundle, queries: list[dict], candidate_k: int) -> list[tuple]:
    """Runs both retrievers once per query and caches the raw rankings.

    Fusion is pure arithmetic over these, so a sweep can try dozens of weight
    settings without re-embedding or re-querying the indexes each time.
    """
    vectors = embed.embed_texts([q["query"] for q in queries])
    out = []
    for query, vector in zip(queries, vectors):
        _, dense_idx = index_module.search(bundle.faiss_index, vector, candidate_k)
        dense = [int(i) for i in dense_idx[0].tolist() if i != -1]
        tokens = bm25s.tokenize(query["query"], stopwords="en", show_progress=False)
        sparse_res, _ = bundle.bm25_index.retrieve(tokens, k=candidate_k, show_progress=False)
        out.append((query["query_id"], dense, sparse_res[0].tolist()))
    return out


def score(ranked: list[int], relevant: set[int], top_k: int) -> tuple[float, float]:
    hits = ranked[:top_k]
    recall = 1.0 if any(i in relevant for i in hits) else 0.0
    for rank, position in enumerate(hits, start=1):
        if position in relevant:
            return recall, 1.0 / rank
    return recall, 0.0


def fuse(dense: list[int], sparse: list[int], dense_w: float, sparse_w: float, k: int) -> list[int]:
    fused = search_module.reciprocal_rank_fusion([dense, sparse], [dense_w, sparse_w], k=k)
    return [position for position, _ in fused]


def evaluate(
    cached: list[tuple],
    gold: dict[int, set[int]],
    top_k: int,
    mode: str = "hybrid",
    dense_w: float = 1.0,
    sparse_w: float = 1.0,
    rrf_k: int = 60,
) -> tuple[float, float]:
    recalls, rrs = [], []
    for query_id, dense, sparse in cached:
        relevant = gold[query_id]
        if mode == "dense":
            ranked = dense
        elif mode == "sparse":
            ranked = sparse
        else:
            ranked = fuse(dense, sparse, dense_w, sparse_w, rrf_k)
        recall, rr = score(ranked, relevant, top_k)
        recalls.append(recall)
        rrs.append(rr)
    return statistics.fmean(recalls), statistics.fmean(rrs)


def prepare(strategy: str, n: int, candidate_k: int, seed: int):
    bundle = load_strategy_bundle(strategy, settings.data_dir)
    gold = gold_by_query(bundle)
    pool = [q for q in load_queries() if q["query_id"] in gold]
    sample = random.Random(seed).sample(pool, min(n, len(pool)))
    cached = rankings(bundle, sample, candidate_k)
    return bundle, gold, cached


def run_production(args) -> None:
    print(
        f"Production config: top_k={args.top_k} candidate_k={args.candidate_k} "
        f"rrf_k={settings.rrf_k} weights dense={settings.rrf_dense_weight} "
        f"sparse={settings.rrf_sparse_weight}\n"
    )
    header = f"{'strategy':<16} {'chunks':>7} {'recall@k':>9} {'mrr@k':>7} {'dense':>9} {'sparse':>9} {'1:1 rrf':>9}"
    print(header)
    print("-" * len(header))

    strategies = [args.strategy] if args.strategy else STRATEGIES
    for strategy in strategies:
        try:
            bundle, gold, cached = prepare(strategy, args.n, args.candidate_k, args.seed)
        except FileNotFoundError:
            print(f"{strategy:<16} {'(no index artifacts, skipped)':>50}")
            continue
        tuned = evaluate(
            cached, gold, args.top_k, "hybrid",
            settings.rrf_dense_weight, settings.rrf_sparse_weight, settings.rrf_k,
        )
        dense = evaluate(cached, gold, args.top_k, "dense")
        sparse = evaluate(cached, gold, args.top_k, "sparse")
        equal = evaluate(cached, gold, args.top_k, "hybrid", 1.0, 1.0, 60)
        print(
            f"{strategy:<16} {len(bundle.chunks):>7} {tuned[0]:>9.3f} {tuned[1]:>7.3f} "
            f"{dense[0]:>9.3f} {sparse[0]:>9.3f} {equal[0]:>9.3f}"
        )
    print("\nColumns after mrr@k are recall@k under single-retriever and equal-weight-fusion")
    print("baselines, for comparison against the tuned hybrid.")


def run_sweep(args) -> None:
    strategy = args.strategy or settings.default_strategy
    print(f"Fusion sweep on {strategy}, {args.n} queries, dev/test split\n")
    _, gold, cached = prepare(strategy, args.n, args.candidate_k, args.seed)
    half = len(cached) // 2
    dev, test = cached[:half], cached[half:]

    for label, rows in (("dev", dev), ("test", test)):
        recall, mrr = evaluate(rows, gold, args.top_k, "dense")
        print(f"[{label}] dense only            recall@{args.top_k}={recall:.3f} mrr@{args.top_k}={mrr:.3f}")
        recall, mrr = evaluate(rows, gold, args.top_k, "sparse")
        print(f"[{label}] sparse only           recall@{args.top_k}={recall:.3f} mrr@{args.top_k}={mrr:.3f}")
    print()

    best = None
    for rrf_k in (10, 20, 30, 60):
        for dense_w in (1, 2, 3, 4, 6, 8, 12, 20):
            recall, mrr = evaluate(dev, gold, args.top_k, "hybrid", dense_w, 1.0, rrf_k)
            print(f"[dev] rrf dense={dense_w:>2} sparse=1 k={rrf_k:<3} recall={recall:.3f} mrr={mrr:.3f}")
            if best is None or mrr > best[0]:
                best = (mrr, dense_w, rrf_k)
        print()

    _, dense_w, rrf_k = best
    print(f"best on dev by mrr: dense={dense_w} sparse=1 k={rrf_k}")
    for label, rows in (("dev", dev), ("test", test)):
        recall, mrr = evaluate(rows, gold, args.top_k, "hybrid", dense_w, 1.0, rrf_k)
        print(f"[{label}] held-out check        recall@{args.top_k}={recall:.3f} mrr@{args.top_k}={mrr:.3f}")


def run_depth(args) -> None:
    """recall@k curve, the trade-off behind how many passages generation gets."""
    strategy = args.strategy or settings.default_strategy
    _, gold, cached = prepare(strategy, args.n, max(args.candidate_k, 20), args.seed)
    print(f"recall@k curve on {strategy}, {len(cached)} queries\n")
    for k in (1, 3, 5, 8, 10, 20):
        tuned = evaluate(
            cached, gold, k, "hybrid",
            settings.rrf_dense_weight, settings.rrf_sparse_weight, settings.rrf_k,
        )
        print(f"  k={k:<3} recall={tuned[0]:.3f} mrr={tuned[1]:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--strategy", help="single strategy, default is all five (or the production one for --sweep)")
    parser.add_argument("--n", type=int, default=1200, help="queries to evaluate")
    parser.add_argument("--top-k", type=int, default=settings.retrieval_top_k)
    parser.add_argument("--candidate-k", type=int, default=settings.retrieval_candidate_k)
    parser.add_argument("--seed", type=int, default=17)
    parser.add_argument("--sweep", action="store_true", help="fusion weight sweep with a held-out split")
    parser.add_argument("--depth", action="store_true", help="recall@k curve across retrieval depth")
    args = parser.parse_args()

    started = time.perf_counter()
    if args.sweep:
        run_sweep(args)
    elif args.depth:
        run_depth(args)
    else:
        run_production(args)
    print(f"\ndone in {time.perf_counter() - started:.1f}s")


if __name__ == "__main__":
    main()
