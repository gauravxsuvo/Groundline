from __future__ import annotations

from .base import Chunk, SourceRow

STRATEGY = "hierarchical"

MAX_PARENT_WORDS = 400


def chunk_row(row: SourceRow) -> list[Chunk]:
    parent_id = f"parent:{row.query_id}"
    parent_text = " ".join([row.eng_query, *row.passages])
    parent_words = parent_text.split()
    if len(parent_words) > MAX_PARENT_WORDS:
        parent_text = " ".join(parent_words[:MAX_PARENT_WORDS])

    chunks: list[Chunk] = []
    for passage_idx, text in enumerate(row.passages):
        if not text.strip():
            continue
        chunks.append(
            Chunk(
                chunk_id=f"{STRATEGY}:{row.query_id}:{passage_idx}",
                text=text,
                strategy=STRATEGY,
                source_query_id=row.query_id,
                passage_idx=passage_idx,
                parent_id=parent_id,
                metadata={
                    "query_type": row.query_type,
                    "is_selected": row.is_selected[passage_idx],
                    "parent_text": parent_text,
                },
            )
        )
    return chunks
