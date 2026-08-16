from __future__ import annotations

from typing import Callable

import numpy as np
import pysbd

from .base import Chunk, SourceRow

STRATEGY = "semantic"

MAX_CHUNK_WORDS = 80
SIMILARITY_DROP_THRESHOLD = 0.5

_segmenter = pysbd.Segmenter(language="en", clean=False)


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def chunk_row(row: SourceRow, embed_fn: Callable[[list[str]], np.ndarray]) -> list[Chunk]:
    """embed_fn takes a list of sentences and returns one embedding vector per sentence.

    Consecutive sentences are merged into a chunk until either the embedding
    similarity between neighbors drops below the threshold, or the word cap
    is hit, whichever comes first.
    """
    chunks: list[Chunk] = []
    for passage_idx, text in enumerate(row.passages):
        if not text.strip():
            continue
        sentences = [s.strip() for s in _segmenter.segment(text) if s.strip()]
        if not sentences:
            continue

        if len(sentences) == 1:
            groups = [sentences]
        else:
            embeddings = embed_fn(sentences)
            groups: list[list[str]] = []
            current = [sentences[0]]
            current_words = len(sentences[0].split())
            for i in range(1, len(sentences)):
                sim = _cosine(embeddings[i - 1], embeddings[i])
                sentence_words = len(sentences[i].split())
                if sim < SIMILARITY_DROP_THRESHOLD or current_words + sentence_words > MAX_CHUNK_WORDS:
                    groups.append(current)
                    current = [sentences[i]]
                    current_words = sentence_words
                else:
                    current.append(sentences[i])
                    current_words += sentence_words
            groups.append(current)

        for group_idx, group in enumerate(groups):
            chunks.append(
                Chunk(
                    chunk_id=f"{STRATEGY}:{row.query_id}:{passage_idx}:{group_idx}",
                    text=" ".join(group),
                    strategy=STRATEGY,
                    source_query_id=row.query_id,
                    passage_idx=passage_idx,
                    metadata={
                        "query_type": row.query_type,
                        "is_selected": row.is_selected[passage_idx],
                        "sentence_count": len(group),
                    },
                )
            )
    return chunks
