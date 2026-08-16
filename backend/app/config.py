from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Retrieval
    data_dir: Path = BACKEND_DIR / "data" / "processed"
    default_strategy: str = "passage_native"
    retrieval_top_k: int = 5
    retrieval_candidate_k: int = 50

    # Reciprocal rank fusion. The weights are not 1:1 on purpose. Measured
    # against the MS MARCO is_selected labels (scripts/eval_retrieval.py,
    # docs/retrieval-quality.md), equal-weight fusion scored recall@5 0.804 /
    # MRR@5 0.517 against dense-alone's 0.891 / 0.621: BM25 is much weaker on
    # this corpus (0.646 / 0.370) and at equal weight it reshuffles a stronger
    # dense ranking with noise. Sparse retrieval still earns its place, it is
    # the only signal that goes to exactly 0.0 for out-of-vocabulary input,
    # which is what the off-topic guardrail keys off, and it breaks ties on
    # exact rare terms. These weights let it do that without overriding dense.
    rrf_k: int = 10
    rrf_dense_weight: float = 12.0
    rrf_sparse_weight: float = 1.0

    # Load the embedding model at startup instead of on the first query. It is
    # a ~200MB lazy load that otherwise lands entirely on whoever asks first.
    warm_start: bool = True

    # Guardrails
    # Off-topic gate on raw BM25 top score (see guardrails/input_guard.py for
    # why: RRF's fused score can't be thresholded, and dense cosine similarity
    # has too high a noise floor on bge-small-en-v1.5 for this corpus). BM25
    # scores were 0.0 for gibberish/no-vocabulary-overlap queries and 6.0+ for
    # every genuine query tried during Phase 2, so 0.5 leaves wide margin.
    relevance_threshold: float = 0.5
    grounding_overlap_threshold: float = 0.6

    # Speech-to-text and generation providers
    sarvam_api_key: str = ""
    stt_language_code: str = "en-IN"
    stt_model: str = "saaras:v3"
    # transcribe keeps the spoken language as-is. translate would force English
    # output from Indic speech, which this English-only build does not need and
    # which risks paraphrasing English input rather than transcribing it.
    stt_mode: str = "transcribe"
    # Sarvam's sync REST endpoint accepts up to 30 seconds of audio. The
    # frontend already caps recording at that, this is the server-side backstop
    # for anything posted directly. 16kHz mono 16-bit PCM is ~32KB/s, so 30s of
    # the format the frontend sends is ~1MB; 8MB leaves room for other formats.
    max_audio_bytes: int = 8 * 1024 * 1024

    groq_api_key: str = ""
    # Only openai/gpt-oss-20b and 120b support strict json_schema structured
    # outputs on Groq today; 20b is also their fastest model, so it wins on
    # both correctness (schema-guaranteed) and latency.
    groq_model: str = "openai/gpt-oss-20b"
    # gpt-oss-20b is a reasoning model and spends hidden reasoning tokens before
    # it answers. Measured on this pipeline: "low" cuts median generation from
    # 738ms to 473ms and completion tokens from 214 to 69. Those tokens matter
    # twice over, because the binding Groq free-tier limit is 8,000 tokens per
    # minute (x-ratelimit-limit-tokens), not requests, so spending fewer of them
    # is also what keeps the demo off the throttle. See docs/latency-report.md.
    groq_reasoning_effort: str = "low"

    gemini_api_key: str = ""
    # Rolling alias, not a pinned version: gemini-2.5-flash-lite (the Phase 0
    # pick) got restricted to existing users only sometime between Phase 0 and
    # Phase 3 of this same build. Pointing at Google's "latest lite" alias
    # instead of a fixed version is the more durable choice for a fallback
    # provider we need to keep working through the submission deadline.
    gemini_model: str = "gemini-flash-lite-latest"

    # Hugging Face Hub, index artifact pull at container startup
    hf_token: str = ""
    hf_dataset_repo: str = ""

    port: int = 8000


settings = Settings()
