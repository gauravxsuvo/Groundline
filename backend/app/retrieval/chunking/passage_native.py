from __future__ import annotations

from .base import Chunk, SourceRow

STRATEGY = "passage_native"


def chunk_row(row: SourceRow) -> list[Chunk]:
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
                metadata={
                    "query_type": row.query_type,
                    "is_selected": row.is_selected[passage_idx],
                },
            )
        )
    return chunks
