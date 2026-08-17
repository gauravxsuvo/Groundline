from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import bm25s
import faiss
import numpy as np

from . import index as index_module

# Fallback only, for callers that do not pass fusion parameters explicitly.
# Production values live in config.Settings (rrf_k, rrf_dense_weight,
# rrf_sparse_weight) and are dense-dominant for the reason documented there.
RRF_K = 60


def build_bm25_index(corpus_texts: list[str]) -> bm25s.BM25:
    corpus_tokens = bm25s.tokenize(corpus_texts, stopwords="en", show_progress=False)
    retriever = bm25s.BM25()
    retriever.index(corpus_tokens, show_progress=False)
    return retriever


def save_bm25_index(retriever: bm25s.BM25, path: Path) -> None:
    retriever.save(str(path))


def load_bm25_index(path: Path) -> bm25s.BM25:
    return bm25s.BM25.load(str(path), load_corpus=False)


def bm25_search(retriever: bm25s.BM25, query: str, top_k: int) -> list[int]:
    query_tokens = bm25s.tokenize(query, stopwords="en", show_progress=False)
    results, _scores = retriever.retrieve(query_tokens, k=top_k, show_progress=False)
    return results[0].tolist()


def reciprocal_rank_fusion(
    rankings: list[list[int]],
    weights: list[float] | None = None,
    k: int = RRF_K,
) -> list[tuple[int, float]]:
    if weights is None:
        weights = [1.0] * len(rankings)

    fused: dict[int, float] = {}
    for ranking, weight in zip(rankings, weights):
        for rank, doc_id in enumerate(ranking):
            fused[doc_id] = fused.get(doc_id, 0.0) + weight / (k + rank + 1)

    return sorted(fused.items(), key=lambda item: item[1], reverse=True)


def _dense_search(faiss_index: faiss.Index, query_embedding: np.ndarray, k: int) -> tuple[list[int], float]:
    scores, indices = index_module.search(faiss_index, query_embedding, k)
    ranking = [int(i) for i in indices[0].tolist() if i != -1]
    top_score = float(scores[0][0]) if scores.size else 0.0
    return ranking, top_score


def _sparse_search(bm25_retriever: bm25s.BM25, query_text: str, k: int) -> tuple[list[int], float]:
    query_tokens = bm25s.tokenize(query_text, stopwords="en", show_progress=False)
    results, scores = bm25_retriever.retrieve(query_tokens, k=k, show_progress=False)
    ranking = results[0].tolist()
    top_score = float(scores[0][0]) if scores.size else 0.0
    return ranking, top_score


def hybrid_search(
    query_embedding: np.ndarray,
    query_text: str,
    faiss_index: faiss.Index,
    bm25_retriever: bm25s.BM25,
    top_k: int = 10,
    candidate_k: int = 50,
    dense_weight: float = 1.0,
    sparse_weight: float = 1.0,
    rrf_k: int = RRF_K,
) -> list[tuple[int, float]]:
    dense_ranking, _ = _dense_search(faiss_index, query_embedding, candidate_k)
    sparse_ranking, _ = _sparse_search(bm25_retriever, query_text, candidate_k)
    fused = reciprocal_rank_fusion(
        [dense_ranking, sparse_ranking], [dense_weight, sparse_weight], k=rrf_k
    )
    return fused[:top_k]


@dataclass
class HybridSearchResult:
    fused: list[tuple[int, float]]
    top_dense_score: float
    top_bm25_score: float


def hybrid_search_with_scores(
    query_embedding: np.ndarray,
    query_text: str,
    faiss_index: faiss.Index,
    bm25_retriever: bm25s.BM25,
    top_k: int = 10,
    candidate_k: int = 50,
    dense_weight: float = 1.0,
    sparse_weight: float = 1.0,
    rrf_k: int = RRF_K,
) -> HybridSearchResult:
    """Same fused ranking as `hybrid_search`, plus each retriever's raw top-1
    score, needed by the off-topic guardrail (see input_guard.check_relevance).

    RRF only ever sees rank, so its fused score can't tell a great match from
    a mediocre one, it always credits whatever lands in rank 0, hence the raw
    scores. Computed from the same dense/sparse search calls used for fusion
    instead of querying both indexes a second time.

    The weights default to 1:1 here but production passes the dense-dominant
    values from config; see the note on `rrf_dense_weight` for the measurement
    behind that.
    """
    dense_ranking, top_dense_score = _dense_search(faiss_index, query_embedding, candidate_k)
    sparse_ranking, top_bm25_score = _sparse_search(bm25_retriever, query_text, candidate_k)
    fused = reciprocal_rank_fusion(
        [dense_ranking, sparse_ranking], [dense_weight, sparse_weight], k=rrf_k
    )
    return HybridSearchResult(
        fused=fused[:top_k], top_dense_score=top_dense_score, top_bm25_score=top_bm25_score
    )
