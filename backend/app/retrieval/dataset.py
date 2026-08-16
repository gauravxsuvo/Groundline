from __future__ import annotations

from collections.abc import Iterator

import pyarrow.parquet as pq

from .chunking.base import SourceRow

SOURCE_PARQUET = "hf://datasets/ai4bharat/MSMARCO-XI/train/urdtrain.parquet"
# Leaf-level dotted paths only, so pyarrow skips the ~1.7GB Translated_passages
# column chunk entirely rather than pulling the whole `passages` struct.
COLUMNS = [
    "query_id",
    "query_type",
    "Eng_Query",
    "Eng_Answer",
    "passages.English_passages",
    "passages.is_selected",
]


def iter_source_rows(limit: int | None = None, batch_size: int = 500) -> Iterator[SourceRow]:
    pf = pq.ParquetFile(SOURCE_PARQUET)
    seen = 0
    for batch in pf.iter_batches(columns=COLUMNS, batch_size=batch_size):
        for record in batch.to_pylist():
            passages = record["passages"]["English_passages"] or []
            is_selected = record["passages"]["is_selected"] or []
            if not passages:
                continue

            yield SourceRow(
                query_id=record["query_id"],
                query_type=record["query_type"] or "UNKNOWN",
                eng_query=record["Eng_Query"] or "",
                eng_answer=record["Eng_Answer"] or "",
                passages=list(passages),
                is_selected=list(is_selected),
            )

            seen += 1
            if limit is not None and seen >= limit:
                return
