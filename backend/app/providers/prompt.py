from __future__ import annotations

# The `evidence` field is the load-bearing part of this prompt, and it exists
# because describing the failure in prose did not stop it happening.
#
# The failure: the model reaches for something it already knows when the
# passages merely mention the same entities. For "what is the capital of
# France" the retrieved set contains "Paris in France lies on the Seine River"
# and nothing stating what the capital is, and the model answered "Paris" with
# grounded=true and confidence 0.95. Both lexical checks in output_guard pass
# that answer, because every content word in it does appear in the retrieved
# set, just never in one passage making the claim. A paragraph of instruction
# defining `grounded` did not fix it: this same prompt carried that paragraph
# and the answer came back grounded anyway, repeatedly.
#
# Making the model copy the supporting span before it writes the answer does
# fix it, on both of the known cases and without false-refusing the queries
# that are genuinely answerable. It changes the question the model is asked
# from a judgement it can rationalise ("is this grounded?") into a retrieval it
# either can or cannot perform ("copy the sentence that says so"). It also
# gives the guardrail something checkable: output_guard verifies the copied
# span really occurs in the retrieved passages, so a fabricated quote is caught
# in code rather than trusted.
SYSTEM_PROMPT = (
    "You are a grounded question-answering assistant. Answer only from the "
    "numbered context passages below. Never use knowledge you have from "
    "outside them, even when you are certain it is correct.\n\n"
    "`evidence` must be a span copied character for character out of the "
    "passage you cite, and it must be the span that states the answer. Do not "
    "paraphrase it, do not stitch together words from different places, do not "
    "write it from memory. Copy it.\n\n"
    "Set `grounded` to true only if the span you copied into `evidence` "
    "actually states what you claim. It is not enough that the passages "
    "mention the same people, places or terms as the question. If no passage "
    "contains a span that states the answer, set `grounded` to false, put the "
    "closest span you found in `evidence`, and say plainly in `answer` what "
    "the context does not cover. A refusal that is correct is a better answer "
    "than a fact that is right for the wrong reason.\n\n"
    "Set `citation` to the passage number `evidence` was copied from. "
    "`confidence` is your own 0-1 estimate of how well the passages support "
    "the answer. Keep `answer` to one or two sentences."
)


def build_prompt(query: str, context: list[tuple[str, str]]) -> str:
    # Passages are numbered rather than labeled with their real chunk_id: small
    # models reliably echo back a plain integer but were observed mangling the
    # "strategy:query_id:passage_idx" id strings (dropping the strategy prefix
    # on some responses), which would silently break citation lookups. The
    # caller maps these numbers back to real chunk_ids itself.
    passages = "\n\n".join(f"[{i}] {text}" for i, (_chunk_id, text) in enumerate(context, start=1))
    return f"Question: {query}\n\nContext passages:\n{passages}"
