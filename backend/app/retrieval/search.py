from __future__ import annotations

from pathlib import Path

import bm25s
import faiss
import numpy as np

from . import index as index_module

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


def hybrid_search(
    query_embedding: np.ndarray,
    query_text: str,
    faiss_index: faiss.Index,
    bm25_retriever: bm25s.BM25,
    top_k: int = 10,
    candidate_k: int = 50,
) -> list[tuple[int, float]]:
    _scores, dense_indices = index_module.search(faiss_index, query_embedding, candidate_k)
    dense_ranking = [int(i) for i in dense_indices[0].tolist() if i != -1]

    sparse_ranking = bm25_search(bm25_retriever, query_text, candidate_k)

    fused = reciprocal_rank_fusion([dense_ranking, sparse_ranking])
    return fused[:top_k]
