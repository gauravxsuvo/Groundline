from __future__ import annotations

from ..config import settings
from ..providers import gemini_llm, groq_llm
from ..retrieval import embed
from ..retrieval import search as search_module
from ..retrieval.loader import StrategyBundle
from .logging_utils import get_logger
from .schemas import GenerationOutput, RetrievalOutput, RetrievedChunk

logger = get_logger("harness.stages")


def run_retrieval(
    query: str,
    bundle: StrategyBundle,
    top_k: int,
    candidate_k: int,
    dense_weight: float | None = None,
    sparse_weight: float | None = None,
    rrf_k: int | None = None,
) -> RetrievalOutput:
    query_embedding = embed.embed_texts([query])[0]
    result = search_module.hybrid_search_with_scores(
        query_embedding,
        query,
        bundle.faiss_index,
        bundle.bm25_index,
        top_k=top_k,
        candidate_k=candidate_k,
        dense_weight=settings.rrf_dense_weight if dense_weight is None else dense_weight,
        sparse_weight=settings.rrf_sparse_weight if sparse_weight is None else sparse_weight,
        rrf_k=settings.rrf_k if rrf_k is None else rrf_k,
    )
    chunks = [
        RetrievedChunk(
            chunk_id=bundle.chunks[idx].chunk_id,
            text=bundle.chunks[idx].text,
            score=score,
            metadata=bundle.chunks[idx].metadata,
        )
        for idx, score in result.fused
    ]
    top_score = chunks[0].score if chunks else 0.0
    return RetrievalOutput(
        strategy=bundle.strategy,
        chunks=chunks,
        top_score=top_score,
        top_dense_score=result.top_dense_score,
        top_bm25_score=result.top_bm25_score,
    )


def _extractive_fallback(retrieval: RetrievalOutput) -> GenerationOutput:
    """Returns the top retrieved passage verbatim as the answer. Used when no
    generation provider has a key configured, and as the last resort when
    both Groq and Gemini fail, so the pipeline degrades instead of erroring."""
    if not retrieval.chunks:
        return GenerationOutput(
            answer="", citations=[], grounded=False, confidence=0.0, mode="extractive", provider="extractive"
        )

    top = retrieval.chunks[0]
    return GenerationOutput(
        answer=top.text,
        citations=[c.chunk_id for c in retrieval.chunks[:3]],
        grounded=True,
        confidence=top.score,
        mode="extractive",
        provider="extractive",
    )


def run_generation(query: str, retrieval: RetrievalOutput) -> GenerationOutput:
    if not retrieval.chunks:
        return _extractive_fallback(retrieval)

    context = [(c.chunk_id, c.text) for c in retrieval.chunks]
    providers = [
        ("groq", settings.groq_api_key, groq_llm.generate),
        ("gemini", settings.gemini_api_key, gemini_llm.generate),
    ]

    for name, api_key, provider_fn in providers:
        if not api_key:
            continue
        try:
            llm_answer = provider_fn(query, context)
        except Exception as exc:
            logger.warning("generation provider failed", extra={"fields": {"provider": name, "error": str(exc)}})
            continue
        cited_chunk_ids = [context[llm_answer.citation - 1][0]] if 1 <= llm_answer.citation <= len(context) else []
        return GenerationOutput(
            answer=llm_answer.answer,
            citations=cited_chunk_ids,
            grounded=llm_answer.grounded,
            confidence=llm_answer.confidence,
            mode="llm",
            provider=name,
        )

    return _extractive_fallback(retrieval)
