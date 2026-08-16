from __future__ import annotations

import re

from ..harness.schemas import GuardResult

_WORD_RE = re.compile(r"[a-z0-9]+")

_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "is", "are", "was",
    "were", "for", "with", "as", "by", "at", "it", "this", "that", "be", "has",
    "have", "had", "from", "not", "but", "can", "will", "which", "their", "its",
}


def _content_words(text: str) -> set[str]:
    return {w for w in _WORD_RE.findall(text.lower()) if w not in _STOPWORDS}


def check_grounding(
    answer: str,
    context_texts: list[str],
    threshold: float,
    self_reported_grounded: bool = True,
) -> GuardResult:
    """Grounding check over two independent signals.

    The lexical overlap measures whether the answer is built out of words that
    actually appear in the retrieved passages. It is deliberately dumb: it has
    no model in the loop, so it cannot be talked into agreeing with a model
    that has drifted off the evidence.

    It has one blind spot, though, and `self_reported_grounded` covers it. When
    the model correctly concludes the context does not answer the question, it
    tends to say so in the context's own vocabulary ("the passages describe when
    the Declaration was adopted but do not name an author"), which scores high
    lexical overlap. Taking the model's own `grounded` flag as a veto means that
    answer is refused rather than shown as a confident grounded one. Either
    signal alone is enough to refuse, so a false "grounded" from the model
    cannot override the lexical check either.
    """
    if not self_reported_grounded:
        return GuardResult(
            passed=False,
            category="ungrounded",
            reason="the model reported that the retrieved context does not support an answer",
        )

    answer_words = _content_words(answer)
    if not answer_words:
        return GuardResult(passed=False, category="ungrounded", reason="answer has no content words to check")

    context_words = _content_words(" ".join(context_texts))
    overlap = len(answer_words & context_words) / len(answer_words)

    if overlap < threshold:
        return GuardResult(
            passed=False,
            category="ungrounded",
            reason=f"lexical overlap {overlap:.2f} with retrieved context below threshold {threshold:.2f}",
        )
    return GuardResult(passed=True, reason=f"lexical overlap {overlap:.2f}")
