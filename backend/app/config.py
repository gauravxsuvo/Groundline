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

    # FAISS search threads. One, not "all of them", and this is worth 24ms.
    #
    # FAISS and ONNX Runtime both default to every core, and this pipeline runs
    # them back to back on one short query. Measured on a 24 core machine: the
    # same search takes 1.7ms in isolation, 24.7ms immediately after an embed
    # call. Forking an OpenMP team of 24 threads to multiply one 384 float
    # vector against 50k rows costs far more in fork/join and cache traffic
    # than the arithmetic itself, and ORT's own threads are still spinning down
    # when FAISS asks for the cores. Timing the pair across both settings:
    #
    #   ORT default, FAISS 24 (the old default)   embed 2.9ms + search 24.7ms
    #   ORT default, FAISS 1                      embed 2.4ms + search  2.6ms
    #
    # This matters more on the deployed 2 CPU instance, not less: there is no
    # spare core there to absorb the oversubscription. Batch workloads would
    # want the threads back, but nothing here searches in batches, every path
    # is one query at a time.
    faiss_threads: int = 1

    # ONNX Runtime threads for the embedding model. Same problem as the FAISS
    # setting above, and the one that actually bit in production.
    #
    # ORT sizes its thread pool from the core count it can see, and a container
    # sees the host's cores, not its own CPU limit: inside a container capped at
    # 2 CPUs on a 24 core host, `os.cpu_count()` still reports 24. So ORT builds
    # a 24 thread pool to run one short query through a 33M parameter model,
    # those threads contend for two cores' worth of quota, and the scheduler
    # throttles the lot. It does not fail, it just gets slow and erratic.
    #
    # Measured against the deployed instance, retrieval ran 126ms to 457ms on
    # identical input, with the giveaway that it scaled with query length:
    # 3 words averaged 257ms, 60 words averaged 704ms. Only the transformer
    # forward pass scales that way, FAISS and BM25 do not care how long the
    # query is. Reproduced locally by running the same image with `--cpus=2`.
    #
    # One, not two, and measured the same way. Running the same image under
    # `--cpus=2`, retrieval for a short query came out:
    #
    #   threads unset (ORT sees 24)   700-918ms
    #   threads=2                      52-104ms
    #   threads=1                       9-20ms
    #
    # Two threads is worse than one for the same reason 24 is worse than two:
    # embedding one short query is a tiny amount of arithmetic, and forking an
    # OpenMP team and synchronising it costs more than the work. Serving is
    # always one short query at a time, so there is nothing to parallelise.
    #
    # Left as an explicit number rather than something derived, because there is
    # no reliable way to read the container's real CPU allowance from inside it:
    # os.cpu_count() reports the host, and process_cpu_count() respects affinity
    # but not the cgroup quota.
    #
    # This is the serving value. Building the index is the opposite workload,
    # 50k chunks in batches, and build_index.py raises it for that reason.
    embed_threads: int = 1

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
