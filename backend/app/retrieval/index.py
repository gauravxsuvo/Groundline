from __future__ import annotations

from pathlib import Path

import faiss
import numpy as np

from ..config import settings


def build_flat_index(embeddings: np.ndarray) -> faiss.Index:
    embeddings = np.ascontiguousarray(embeddings, dtype="float32")
    faiss.normalize_L2(embeddings)
    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(embeddings)
    return index


def save_index(index: faiss.Index, path: Path) -> None:
    faiss.write_index(index, str(path))


def load_index(path: Path) -> faiss.Index:
    # Thread count is a process-wide OpenMP setting rather than a property of
    # the index, so it is applied here: this is the one point every path that
    # is about to search goes through, and applying it anywhere later means
    # something searches once at the wrong setting first. See the comment on
    # `faiss_threads` in config.py for the measurement behind the value.
    faiss.omp_set_num_threads(settings.faiss_threads)
    return faiss.read_index(str(path))


def search(index: faiss.Index, query_embeddings: np.ndarray, top_k: int) -> tuple[np.ndarray, np.ndarray]:
    queries = np.ascontiguousarray(query_embeddings, dtype="float32")
    if queries.ndim == 1:
        queries = queries.reshape(1, -1)
    faiss.normalize_L2(queries)
    scores, indices = index.search(queries, top_k)
    return scores, indices
