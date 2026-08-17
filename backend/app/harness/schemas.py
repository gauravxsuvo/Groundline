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

    Field order is load-bearing. Both providers emit JSON in schema order, so
    `evidence` is declared before `answer` to make the model copy the
    supporting span out of the passages first and write the answer after it,
    rather than writing an answer and then going looking for something to
    justify it with.
    """

    citation: int
    evidence: str
    answer: str
    grounded: bool
    confidence: float


GenerationMode = Literal["extractive", "llm"]


class GenerationOutput(BaseModel):
    answer: str
    # The span the model copied out of the cited passage as its support. Kept
    # on the output so the UI can show the reader the exact sentence the answer
    # rests on, and so the grounding guard can check it is really there.
    evidence: str = ""
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
