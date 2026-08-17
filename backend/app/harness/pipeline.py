from __future__ import annotations

import time
from typing import Callable, TypeVar

from ..config import Settings
from ..config import settings as default_settings
from ..guardrails import input_guard, output_guard
from ..providers import sarvam_stt
from ..retrieval.loader import StrategyBundle, load_strategy_bundle
from . import stages
from .logging_utils import get_logger
from .schemas import GenerationOutput, GuardResult, PipelineResult, RetrievalOutput, StageTiming

T = TypeVar("T")

logger = get_logger("harness.pipeline")


class Pipeline:
    """Orchestrates one query through guardrails, retrieval and generation.

    Loads its strategy's index artifacts once at construction and reuses them
    across calls to `run`, since reloading FAISS/bm25 per request would blow
    the latency budget.
    """

    def __init__(self, bundle: StrategyBundle, settings: Settings | None = None) -> None:
        self.bundle = bundle
        self.settings = settings or default_settings

    @classmethod
    def from_strategy(cls, strategy: str | None = None, settings: Settings | None = None) -> "Pipeline":
        settings = settings or default_settings
        bundle = load_strategy_bundle(strategy or settings.default_strategy, settings.data_dir)
        return cls(bundle, settings)

    def _run_stage(self, name: str, timings: list[StageTiming], fn: Callable[[], T]) -> T:
        # No generic retry wrapper here on purpose. Retries belong next to the
        # I/O that can transiently fail, and that is where they live: Sarvam,
        # Groq and Gemini each own a tenacity policy, and generation has a
        # whole provider-fallback chain on top. Every other stage (guardrails,
        # retrieval) is a deterministic in-memory function, so retrying it just
        # triples the time to a failure that was never going to succeed.
        t0 = time.perf_counter()
        ok = True
        try:
            return fn()
        except Exception:
            ok = False
            raise
        finally:
            elapsed_ms = (time.perf_counter() - t0) * 1000
            timings.append(StageTiming(stage=name, elapsed_ms=elapsed_ms, ok=ok))
            logger.info(
                "stage completed",
                extra={"fields": {"stage": name, "elapsed_ms": round(elapsed_ms, 2), "ok": ok}},
            )

    def run(self, query: str) -> PipelineResult:
        return self._run_query(query, [], time.perf_counter())

    def run_audio(self, audio_bytes: bytes, filename: str) -> PipelineResult:
        timings: list[StageTiming] = []
        t_start = time.perf_counter()
        try:
            transcript = self._run_stage(
                "transcribe",
                timings,
                lambda: sarvam_stt.transcribe(audio_bytes, filename),
            )
        except sarvam_stt.SarvamSTTError as exc:
            # Already phrased for the person who recorded the clip, pass it
            # through rather than burying it under another wrapper.
            return PipelineResult(
                query="",
                error=str(exc),
                timings=timings,
                total_elapsed_ms=(time.perf_counter() - t_start) * 1000,
            )
        except Exception as exc:
            logger.warning(
                "transcription failed",
                extra={"fields": {"error": str(exc), "type": type(exc).__name__}},
            )
            return PipelineResult(
                query="",
                error=f"Speech to text failed: {exc}",
                timings=timings,
                total_elapsed_ms=(time.perf_counter() - t_start) * 1000,
            )
        return self._run_query(transcript, timings, t_start)

    def _run_query(self, query: str, timings: list[StageTiming], t_start: float) -> PipelineResult:
        unsafe_result = self._run_stage("input_guard", timings, lambda: input_guard.check_unsafe(query))
        if not unsafe_result.passed:
            return self._refuse(query, unsafe_result, timings, t_start)

        retrieval = self._run_stage(
            "retrieval",
            timings,
            lambda: stages.run_retrieval(
                query,
                self.bundle,
                self.settings.retrieval_top_k,
                self.settings.retrieval_candidate_k,
                dense_weight=self.settings.rrf_dense_weight,
                sparse_weight=self.settings.rrf_sparse_weight,
                rrf_k=self.settings.rrf_k,
            ),
        )

        relevance_result = self._run_stage(
            "relevance_guard",
            timings,
            lambda: input_guard.check_relevance(retrieval.top_bm25_score, self.settings.relevance_threshold),
        )
        if not relevance_result.passed:
            return self._refuse(query, relevance_result, timings, t_start, retrieval=retrieval)

        generation = self._run_stage(
            "generation", timings, lambda: stages.run_generation(query, retrieval)
        )

        # Three independent grounding signals, and any one of them is enough to
        # refuse. The model's own `grounded` flag catches the case the lexical
        # check is blind to: a fluent "the context does not say" answer, written
        # almost entirely out of words lifted from the context, scores high
        # overlap and would otherwise be presented as a confident grounded
        # answer. The evidence span catches the opposite case, an answer the
        # model is confident about and whose words all appear in the retrieved
        # set, but which no single passage actually states.
        grounding_result = self._run_stage(
            "output_guard",
            timings,
            lambda: output_guard.check_grounding(
                generation.answer,
                [c.text for c in retrieval.chunks],
                self.settings.grounding_overlap_threshold,
                self_reported_grounded=generation.grounded,
                evidence=generation.evidence,
            ),
        )
        if not grounding_result.passed:
            return self._refuse(
                query,
                grounding_result,
                timings,
                t_start,
                retrieval=retrieval,
                generation=generation,
                output_guard=grounding_result,
            )

        total_elapsed_ms = (time.perf_counter() - t_start) * 1000
        return PipelineResult(
            query=query,
            refused=False,
            retrieval=retrieval,
            generation=generation,
            output_guard=grounding_result,
            timings=timings,
            total_elapsed_ms=total_elapsed_ms,
        )

    def _refuse(
        self,
        query: str,
        guard: GuardResult,
        timings: list[StageTiming],
        t_start: float,
        retrieval: RetrievalOutput | None = None,
        generation: GenerationOutput | None = None,
        output_guard: GuardResult | None = None,
    ) -> PipelineResult:
        # `generation` is kept here even on refusal, it's the rejected answer
        # for debugging/demo transparency, not something to show as the final
        # answer. `refused=True` is what callers must gate display on.
        total_elapsed_ms = (time.perf_counter() - t_start) * 1000
        return PipelineResult(
            query=query,
            refused=True,
            refusal_category=guard.category,
            refusal_reason=guard.reason,
            retrieval=retrieval,
            generation=generation,
            output_guard=output_guard,
            timings=timings,
            total_elapsed_ms=total_elapsed_ms,
        )
