from __future__ import annotations

from functools import lru_cache

from groq import APIConnectionError, APITimeoutError, Groq, InternalServerError
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from ..config import settings
from ..harness.schemas import LLMAnswer
from .prompt import SYSTEM_PROMPT, build_prompt


@lru_cache(maxsize=1)
def _get_client() -> Groq:
    return Groq(api_key=settings.groq_api_key)


@lru_cache(maxsize=1)
def _strict_schema() -> dict:
    # Groq's strict json_schema mode requires additionalProperties: false on
    # every object. Injected only here, not on the model itself, since
    # Gemini's response_schema dialect rejects that field outright.
    #
    # The docstring-derived `description` is dropped: pydantic puts the whole
    # LLMAnswer docstring in there, which is several paragraphs of notes about
    # why `citation` is an int. That is context for whoever reads the code, not
    # for the model, and it was being billed against the 8,000 tokens-per-minute
    # free-tier budget on every single request.
    schema = LLMAnswer.model_json_schema()
    schema.pop("description", None)
    for prop in schema.get("properties", {}).values():
        prop.pop("description", None)
    schema["additionalProperties"] = False
    return schema


# Deliberately not retrying RateLimitError. The binding Groq free-tier limit is
# 8,000 tokens per minute and its reset window is around 50 seconds, so a local
# retry with a 2 second ceiling cannot outwait it, it only delays the handoff.
# Falling straight through to the Gemini fallback answers the query instead.
@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.2, max=2.0),
    retry=retry_if_exception_type((APIConnectionError, APITimeoutError, InternalServerError)),
    reraise=True,
)
def generate(query: str, context: list[tuple[str, str]]) -> LLMAnswer:
    response = _get_client().chat.completions.create(
        model=settings.groq_model,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": build_prompt(query, context)},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {"name": "llm_answer", "strict": True, "schema": _strict_schema()},
        },
        temperature=0.2,
        max_tokens=1024,
        reasoning_effort=settings.groq_reasoning_effort,
    )
    content = response.choices[0].message.content or "{}"
    return LLMAnswer.model_validate_json(content)
