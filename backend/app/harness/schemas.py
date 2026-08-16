from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

GuardCategory = Literal["unsafe", "off_topic", "ungrounded"]


class GuardResult(BaseModel):
    passed: bool
    category: GuardCategory | None = None
    reason: str | None = None


class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    score: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalOutput(BaseModel):
    strategy: str
    chunks: list[RetrievedChunk]
    top_score: float
    top_dense_score: float
    top_bm25_score: float


class LLMAnswer(BaseModel):
    """Structured contract every generation provider must fill exactly.

    No `extra="forbid"` here on purpose: that config is what makes pydantic
    emit `additionalProperties: false` in the generated JSON schema, which
    Groq's strict mode requires but Gemini's response_schema dialect (a
    restricted OpenAPI subset, not full JSON Schema) rejects outright. Groq's
    provider module adds that field itself, only to the copy it sends.

    `citation` is a single int, not a list. Tried `citations: list[int]`
    first: on openai/gpt-oss-20b it reliably reasoned through which passages
    it wanted ("citations [1], [2]" in the hidden reasoning trace) but then
    concatenated them into a single malformed int like 12 in the actual JSON,
    every time, across all three reasoning_effort levels. A single required
    int sidesteps the multi-element-array formatting bug entirely and was
    100% reliable in testing.
    """

    citation: int
    answer: str
    grounded: bool
    confidence: float


GenerationMode = Literal["extractive", "llm"]


class GenerationOutput(BaseModel):
    answer: str
    citations: list[str]
    grounded: bool
    confidence: float
    mode: GenerationMode
    provider: str


class StageTiming(BaseModel):
    stage: str
    elapsed_ms: float
    ok: bool


class PipelineResult(BaseModel):
    query: str
    error: str | None = None
    refused: bool = False
    refusal_category: GuardCategory | None = None
    refusal_reason: str | None = None
    retrieval: RetrievalOutput | None = None
    generation: GenerationOutput | None = None
    output_guard: GuardResult | None = None
    timings: list[StageTiming] = Field(default_factory=list)
    total_elapsed_ms: float = 0.0
