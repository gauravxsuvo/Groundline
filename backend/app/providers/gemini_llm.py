from __future__ import annotations

from functools import lru_cache

from google import genai
from google.genai import types
from tenacity import retry, stop_after_attempt, wait_exponential

from ..config import settings
from ..harness.schemas import LLMAnswer
from .prompt import SYSTEM_PROMPT, build_prompt


@lru_cache(maxsize=1)
def _get_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


@retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=0.2, max=2.0), reraise=True)
def generate(query: str, context: list[tuple[str, str]]) -> LLMAnswer:
    response = _get_client().models.generate_content(
        model=settings.gemini_model,
        contents=build_prompt(query, context),
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=LLMAnswer,
            temperature=0.2,
            # Passing a pydantic model as response_schema makes the SDK light
            # up its automatic-function-calling path and log a warning on every
            # call. Nothing here calls tools, so turn it off and keep the logs
            # readable.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        ),
    )
    return LLMAnswer.model_validate_json(response.text)
