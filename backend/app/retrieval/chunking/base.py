from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class Chunk(BaseModel):
    chunk_id: str
    text: str
    strategy: str
    source_query_id: int
    passage_idx: int
    parent_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SourceRow(BaseModel):
    query_id: int
    query_type: str
    eng_query: str
    eng_answer: str
    passages: list[str]
    is_selected: list[int]
