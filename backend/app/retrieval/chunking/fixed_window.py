from __future__ import annotations

from .base import Chunk, SourceRow

STRATEGY = "fixed_window"

WINDOW_SIZE = 60
OVERLAP = 15


def chunk_row(row: SourceRow) -> list[Chunk]:
    chunks: list[Chunk] = []
    for passage_idx, text in enumerate(row.passages):
        words = text.split()
        if not words:
            continue

        start = 0
        window_idx = 0
        while start < len(words):
            end = min(start + WINDOW_SIZE, len(words))
            window_text = " ".join(words[start:end])
            chunks.append(
                Chunk(
                    chunk_id=f"{STRATEGY}:{row.query_id}:{passage_idx}:{window_idx}",
                    text=window_text,
                    strategy=STRATEGY,
                    source_query_id=row.query_id,
                    passage_idx=passage_idx,
                    metadata={
                        "query_type": row.query_type,
                        "is_selected": row.is_selected[passage_idx],
                        "window_start": start,
                        "window_end": end,
                    },
                )
            )
            if end == len(words):
                break
            start += WINDOW_SIZE - OVERLAP
            window_idx += 1

    return chunks
