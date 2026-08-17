"""Measured figures the API reports to the frontend.

These are not computed per request. They come out of the two offline scripts,
`scripts/benchmark_latency.py` and `scripts/eval_retrieval.py`, both run
against a fixed query sample, and they are written up in `docs/latency-report.md`
and `docs/retrieval-quality.md`. They live here so the UI can state the 200ms
result and the retrieval accuracy next to the live per-query numbers, instead of
a reviewer having to open the repo to find out whether the target was met.

When retrieval changes, re-run both scripts and update the docs and these
constants together. Everything here is a measurement, so nothing in this file
should ever be adjusted to look better than what the scripts printed.
"""

from __future__ import annotations

from pydantic import BaseModel

# The task's stated target for the pipeline. Retrieval is the part of the path
# that is measured against it; generation is a hosted LLM round trip and is
# reported separately rather than folded in. See docs/latency-report.md.
LATENCY_TARGET_MS = 200


class RetrievalLatency(BaseModel):
    p50_ms: float
    p70_ms: float
    p100_ms: float
    queries: int


class RetrievalQuality(BaseModel):
    recall_at_5: float
    mrr_at_5: float
    queries: int


class Benchmarks(BaseModel):
    target_ms: int
    latency: RetrievalLatency
    quality: RetrievalQuality


# passage_native, 150 queries, retrieval only (embed, hybrid search, fusion),
# with one strategy bundle resident, which is what a deployed container runs.
# The five-strategy comparison sweep in the latency report holds all five at
# once and reads higher for that reason; see the note there.
RETRIEVAL_LATENCY = RetrievalLatency(p50_ms=5.9, p70_ms=6.3, p100_ms=12.1, queries=150)

# passage_native, 1200 labelled queries, scored against MS MARCO is_selected.
RETRIEVAL_QUALITY = RetrievalQuality(recall_at_5=0.891, mrr_at_5=0.621, queries=1200)

BENCHMARKS = Benchmarks(
    target_ms=LATENCY_TARGET_MS,
    latency=RETRIEVAL_LATENCY,
    quality=RETRIEVAL_QUALITY,
)
