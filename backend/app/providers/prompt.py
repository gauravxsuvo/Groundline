from __future__ import annotations

# `grounded` is spelled out at this length on purpose. The pipeline treats a
# false value as a veto that refuses the answer outright, so the accuracy of
# this one flag is load-bearing, and the failure it has to catch is subtle:
# the model reaching for something it already knows when the passages merely
# mention the same entities. Observed live before this wording existed, the
# retrieved passages for "what is the capital of France" included one reading
# "Paris in France lies on the Seine River" and none stating what the capital
# is, and the model answered "The capital of France is Paris" with
# grounded=true and confidence 1.0. Both independent lexical checks pass that
# answer, because every content word in it does appear somewhere in the
# retrieved set, just never in one passage making the claim.
SYSTEM_PROMPT = (
    "You are a grounded question-answering assistant. Answer only from the "
    "numbered context passages below. Never use knowledge you have from "
    "outside them, even when you are certain it is correct.\n\n"
    "Set `grounded` to true only if one of the passages explicitly states what "
    "you claim. It is not enough that the passages mention the same people, "
    "places or terms as the question. If the passages talk around the question "
    "without answering it, or if answering would mean filling in a fact the "
    "passages never state, set `grounded` to false and say plainly in `answer` "
    "what the context does not cover. A refusal that is correct is a better "
    "answer than a fact that is right for the wrong reason.\n\n"
    "Set `citation` to the single passage number that most directly supports "
    "your answer. `confidence` is your own 0-1 estimate of how well the "
    "passages support it. Keep `answer` to one or two sentences."
)


def build_prompt(query: str, context: list[tuple[str, str]]) -> str:
    # Passages are numbered rather than labeled with their real chunk_id: small
    # models reliably echo back a plain integer but were observed mangling the
    # "strategy:query_id:passage_idx" id strings (dropping the strategy prefix
    # on some responses), which would silently break citation lookups. The
    # caller maps these numbers back to real chunk_ids itself.
    passages = "\n\n".join(f"[{i}] {text}" for i, (_chunk_id, text) in enumerate(context, start=1))
    return f"Question: {query}\n\nContext passages:\n{passages}"
