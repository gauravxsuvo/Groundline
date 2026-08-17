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


def _tokens(text: str) -> list[str]:
    return _WORD_RE.findall(text.lower())


def _contains_tokens(haystack: list[str], needle: list[str]) -> bool:
    if not needle or len(needle) > len(haystack):
        return False
    first = needle[0]
    for i in range(len(haystack) - len(needle) + 1):
        if haystack[i] == first and haystack[i : i + len(needle)] == needle:
            return True
    return False


# Below this many tokens a span is too short to establish anything: a two word
# quote will occur somewhere in five passages of prose by accident.
_MIN_EVIDENCE_TOKENS = 4


def verify_evidence(evidence: str, context_texts: list[str]) -> bool:
    """Is the model's quoted span really in the retrieved passages?

    Compared as token sequences rather than raw strings, so that case, runs of
    whitespace, and the punctuation and quote characters models normalise on
    their way through a JSON field do not read as a fabrication. The wording
    itself still has to match in order, which is the part that matters.

    Checked against the whole retrieved set rather than only the cited passage.
    Quoting a real passage and misnumbering the citation is a citation bug, not
    a fabricated quote, and the two deserve different treatment: this guard
    exists to catch a span that exists nowhere.

    Spans elided with "..." are checked fragment by fragment.
    """
    fragments = [f for f in re.split(r"\.{3}|…", evidence) if _tokens(f)]
    if not fragments:
        return False
    if sum(len(_tokens(f)) for f in fragments) < _MIN_EVIDENCE_TOKENS:
        return False

    haystacks = [_tokens(text) for text in context_texts]
    return all(
        any(_contains_tokens(haystack, _tokens(fragment)) for haystack in haystacks)
        for fragment in fragments
    )


def check_grounding(
    answer: str,
    context_texts: list[str],
    threshold: float,
    self_reported_grounded: bool = True,
    evidence: str = "",
) -> GuardResult:
    """Grounding check over three independent signals.

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

    The third signal is the evidence span. The model is asked to copy the
    sentence that states the answer (see providers/prompt.py), and this checks
    that the sentence is really there. It is the only one of the three that a
    model cannot satisfy by writing fluently: a quote either occurs in the
    passages or it does not.
    """
    if not self_reported_grounded:
        return GuardResult(
            passed=False,
            category="ungrounded",
            reason="the model reported that the retrieved context does not support an answer",
        )

    # Empty is the extractive fallback, which has no model to quote and whose
    # answer is a retrieved passage verbatim, so there is nothing to verify.
    if evidence and not verify_evidence(evidence, context_texts):
        return GuardResult(
            passed=False,
            category="ungrounded",
            reason="the quoted supporting passage was not found in the retrieved context",
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
