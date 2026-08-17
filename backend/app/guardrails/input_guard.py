from __future__ import annotations

import re

from ..harness.schemas import GuardResult

_UNSAFE_PATTERNS: dict[str, list[re.Pattern[str]]] = {
    "self_harm": [
        re.compile(p, re.IGNORECASE)
        for p in [
            r"\bhow (to|do i) (kill|end) (myself|yourself)\b",
            r"\bsuicide method\b",
            r"\bways to self[- ]harm\b",
        ]
    ],
    "violence": [
        re.compile(p, re.IGNORECASE)
        for p in [
            r"\bhow (to|do i) (make|build) an? (bomb|explosive|pipe bomb)\b",
            r"\bhow (to|do i) (kill|murder) (someone|a person)\b",
        ]
    ],
    "illegal_activity": [
        re.compile(p, re.IGNORECASE)
        for p in [
            r"\bhow (to|do i) hack (into|a|an)\b",
            r"\bhow (to|do i) (synthesize|cook) (meth|heroin|fentanyl)\b",
            r"\bhow (to|do i) steal (a|an|someone)\b",
        ]
    ],
    "prompt_injection": [
        re.compile(p, re.IGNORECASE)
        for p in [
            r"\bignore (all|the|your|any) (previous|prior|above) instructions\b",
            r"\breveal your system prompt\b",
            r"\bdisregard (all|the) (rules|guardrails|instructions)\b",
            r"\byou are now (in )?(dan|developer mode|unrestricted)\b",
        ]
    ],
}


def check_unsafe(query: str) -> GuardResult:
    for category, patterns in _UNSAFE_PATTERNS.items():
        for pattern in patterns:
            if pattern.search(query):
                return GuardResult(passed=False, category="unsafe", reason=f"matched unsafe pattern ({category})")
    return GuardResult(passed=True)


def check_relevance(top_bm25_score: float, threshold: float) -> GuardResult:
    """Off-topic gate on raw BM25 vocabulary overlap.

    Dense cosine similarity was tried first and rejected: on bge-small-en-v1.5
    even pure keyboard-mash queries score 0.65+ against this corpus (a known
    anisotropy issue with BERT-family sentence embeddings), so there's no
    usable separation from genuine matches (0.70-0.92). RRF's fused score is
    rank-only by construction, so it can't be thresholded at all. Raw BM25
    score is a real term-overlap measure that goes to exactly zero when the
    query shares no vocabulary with the corpus, which is what actually
    happens for gibberish or genuinely out-of-domain input.

    This still won't catch a query that uses on-corpus vocabulary for an
    off-topic *intent* (e.g. "write me a poem about love"), since real words
    always have some BM25 overlap. Catching that class of input needs a
    proper intent classifier, out of scope for this lightweight guardrail.
    """
    if top_bm25_score < threshold:
        return GuardResult(
            passed=False,
            category="off_topic",
            reason=f"top bm25 score {top_bm25_score:.4f} below relevance threshold {threshold:.4f}",
        )
    return GuardResult(passed=True)
