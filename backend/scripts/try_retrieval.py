from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.config import settings
from app.retrieval import embed
from app.retrieval import index as index_module
from app.retrieval import search as search_module
from app.retrieval.loader import load_chunks

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy", default="passage_native")
    parser.add_argument("--top-k", type=int, default=3)
    args = parser.parse_args()

    strategy_dir = DATA_DIR / args.strategy
    if not strategy_dir.exists():
        raise SystemExit(f"No index found at {strategy_dir}, run build_index.py first")

    print(f"Loading '{args.strategy}' index...")
    chunks = load_chunks(strategy_dir)
    faiss_index = index_module.load_index(strategy_dir / "dense.faiss")
    bm25_index = search_module.load_bm25_index(strategy_dir / "bm25")
    print(f"Ready, {len(chunks)} chunks loaded. Type a question, or 'quit' to exit.\n")

    while True:
        try:
            query = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not query or query.lower() in {"quit", "exit"}:
            break

        t0 = time.time()
        query_embedding = embed.embed_texts([query])[0]
        # Production fusion weights, so this reflects what the pipeline
        # actually ranks with rather than the 1:1 library default.
        results = search_module.hybrid_search(
            query_embedding,
            query,
            faiss_index,
            bm25_index,
            top_k=args.top_k,
            dense_weight=settings.rrf_dense_weight,
            sparse_weight=settings.rrf_sparse_weight,
            rrf_k=settings.rrf_k,
        )
        elapsed_ms = (time.time() - t0) * 1000

        for rank, (chunk_idx, score) in enumerate(results, start=1):
            chunk = chunks[chunk_idx]
            print(f"  {rank}. [{score:.4f}] {chunk.text[:220]}")
        print(f"  ({elapsed_ms:.0f}ms)\n")


if __name__ == "__main__":
    main()
