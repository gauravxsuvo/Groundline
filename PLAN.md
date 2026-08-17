# Groundline: build plan and status

Full architecture rationale is in `AGENT.md`. This file tracks what's done, what's next, phase by phase. Update it at the end of every work session so the next one picks up without re-deriving context.

Deadline: August 22, 2026, 11:59 PM. No resubmissions.

Project name: Groundline. Plain English, no Indic-language name since the demo itself runs English only (the dataset is Indic-sourced, but that's not the same as the demo language, an Indic name would invite an awkward question from judges). Ties to the core guarantee: every answer is grounded in retrieved evidence, or the system says so instead of guessing.

Brand assets are done: `brand/` has the mark, logo, and README banner (light and dark, switches with GitHub's theme via `<picture>`), plus a small brand guide with the color tokens. Hand-written SVG, no build step, no external fonts. Reuse the same tokens for the frontend UI in Phase 5 instead of picking new colors.

## Phase 0 - Foundations
Status: done

- [x] Verified backend dependency stack installs cleanly (faiss-cpu, fastembed, bm25s, onnxruntime all have Python 3.14 / win_amd64 wheels; pandas needed bumping to 3.0.5, pydantic to 2.13.4, and dill force-upgraded to 0.4.1 for prebuilt wheels / Python 3.14 pickle compatibility)
- [x] Git repo initialized
- [x] Directory scaffold (`backend/app/{harness,retrieval/chunking,guardrails,providers}`, `backend/scripts`, `frontend`, `docs`)
- [x] `.gitignore`, `.env.example`
- [x] `backend/requirements.txt` (runtime) and `requirements-dev.txt` (adds dataset-building deps)
- [x] `README.md`, `AGENT.md`, `CLAUDE.md` drafted
- [x] Project venv created (`.venv/`) and dependencies actually installed, all imports verified
- [x] Inspected the dataset directly via parquet metadata and column-pruned reads (no full 55.6GB download). Findings below.
- [x] Sarvam, Groq, and Gemini API keys obtained and dropped into `backend/.env` (2026-08-16, ahead of Phase 3)

### Dataset findings (feeds into Phase 1)

The repo has no separate English file. It's 13 per-language parquet files under `train/` and `validation/` (e.g. `train/hintrain.parquet`), each holding parallel translations of the *same* underlying English MS MARCO source. Every language file carries `Eng_Query`, `Eng_Answer`, and `passages.English_passages` (plus `passages.is_selected` relevance labels and `query_type`) alongside its own translated columns. Since we're English-only, we can source from whichever language file is smallest, no need to touch the translation columns at all.

- Schema (confirmed via parquet footer, no download needed): `query_id`, `query_type`, `Eng_Query`, `Eng_Answer`, `query`/`Answer` (translated), `source_lang`, `target_lang`, `meta` (translation model params), `passages.{English_passages, Translated_passages, is_selected}`.
- Row count: ~700k-780k rows per language file (778,638 confirmed for Hindi). File sizes are all ~3.3-4GB regardless of language (dominated by the shared English content), Urdu's is smallest at 3339 MB.
- Each parquet file is a single row group, so there's no cheap "read just N rows" over HTTP. Column projection (skip the translation columns, keep only the English ones) is the only real lever, still requires pulling full column chunks for `Eng_Query`/`Eng_Answer`/`passages` across all rows.
- Confirmed real content via a live column-pruned fetch, e.g. query `"what direction does phloem flow"` -> `"No Answer Present."`, and `query_type` values like `DESCRIPTION`. This is genuine MS MARCO-format QA data.
- Phase 1 plan: pull `train/urdtrain.parquet` (smallest), project to just `query_id, query_type, Eng_Query, Eng_Answer, passages.English_passages, passages.is_selected`, then sample down to the target corpus size (tens of thousands of chunks, exact number to be decided against Render's free-tier memory budget in Phase 1).

## Phase 1 - Data & retrieval core
Status: done

- [x] Sample and clean the English corpus subset (5,000 rows pulled from `train/urdtrain.parquet`, English-only leaf columns projected to avoid the 1.7GB translation column)
- [x] Implement the 5 chunking strategies (fixed-size sliding window, sentence-aware semantic, passage-native, metadata-aware, hierarchical parent/child) - see `backend/app/retrieval/chunking/`
- [x] Build FAISS dense index (bge-small-en-v1.5 via fastembed) and bm25s sparse index - `backend/scripts/build_index.py`, chunk counts: passage_native/metadata_aware/hierarchical 49,885 each, fixed_window 65,691, semantic 68,938
- [x] Push index artifacts to a Hugging Face Hub dataset repo - `gauravxsuvo/groundline-index` on Hugging Face Hub, 740MB across 25 LFS files, pushed via `backend/scripts/push_to_hf.py`
- [x] Hybrid retrieval with reciprocal rank fusion, sanity-checked on hand-picked queries - `backend/scripts/sanity_check_retrieval.py`, all 5 strategies verified against 6 hand-picked queries, results topically correct across the board

Known follow-up: `hierarchical` strategy stores the full parent context duplicated in every child chunk's metadata (227MB vs ~115MB for the other passage-level strategies), worth deduplicating into a separate parent lookup if `hierarchical` is the strategy chosen for production in a later phase.

## Phase 2 - Guardrails and harness skeleton
Status: done

- [x] Input guardrail (unsafe pattern match: self-harm, violence, illegal activity, prompt injection) - `backend/app/guardrails/input_guard.py`
- [x] Input guardrail (off-topic, gated on raw BM25 top score, see note below) - `backend/app/guardrails/input_guard.py`
- [x] Output guardrail (grounding check via lexical overlap between the answer and retrieved context) - `backend/app/guardrails/output_guard.py`
- [x] Orchestrator: typed Pydantic stages (`backend/app/harness/schemas.py`), retries with backoff via tenacity, structured JSON logging, wired to retrieval with an extractive generation stand-in (real Groq/Gemini call is Phase 3) - `backend/app/harness/pipeline.py`, `stages.py`
- [x] CLI verification tool - `backend/scripts/run_harness.py`, single-query or interactive, prints the full structured `PipelineResult` JSON with per-stage timings

Off-topic guardrail design note: RRF's fused score is rank-only by construction (a great match and a mediocre one both just get "rank 0" credit), so it can't be thresholded for relevance, tried it first and it let pure gibberish through. Raw dense cosine similarity was tried next and rejected too, bge-small-en-v1.5 has a noise floor around 0.65 even for keyboard-mash input against this corpus, no clean separation from genuine matches (0.70-0.92). Settled on raw BM25 top score instead: exactly 0.0 for queries sharing no vocabulary with the corpus, 6.0+ for every genuine query tried. Threshold is 0.5. Known gap: this only catches vocabulary-absent input, not on-topic-vocabulary-but-wrong-intent queries (e.g. "write me a poem about love" still passes, since "poem" and "love" are real words with real corpus overlap). Documented in `input_guard.py`, not silently swept under the rug, in keeping with this project's honest-reporting stance on the 200ms target.

Generation is an extractive stand-in (returns the top retrieved passage verbatim as the answer), not a stub that raises `NotImplementedError`. This was a deliberate choice, not scope creep, it's the exact graceful-degradation fallback the architecture doc already commits to for when both LLM providers fail, so Phase 3 reuses it as-is rather than building it twice, and it lets the output guardrail's grounding check be exercised for real right now instead of against a fake value.

Threshold values (`relevance_threshold=0.5` BM25 floor, `grounding_overlap_threshold=0.6` lexical overlap) are starting points checked against a handful of hand-picked queries during this phase, not a calibrated set. Revisit against the Phase 4 benchmark query set if there's time.

## Phase 3 - STT and generation integration
Status: done

- [x] Sarvam STT wired in as the first stage - `backend/app/providers/sarvam_stt.py`, REST call (`saaras:v3`, `mode=transcribe`), hand-rolled with httpx rather than the official SDK, tenacity retry
- [x] Groq generation wired in with structured JSON output (answer, citation, grounded, confidence), Gemini as automatic fallback, extractive stand-in as final fallback if both fail - `backend/app/providers/groq_llm.py`, `gemini_llm.py`, `harness/stages.py`
- [x] End-to-end CLI test: audio file in, structured grounded answer out - verified with a Windows-TTS-synthesized WAV through `backend/scripts/run_harness.py --audio`

Model picks, checked live against the actual keys rather than trusted from Phase 0 research: Groq uses `openai/gpt-oss-20b`, not the originally planned Llama 3.1 8B, it's both the fastest model on Groq's free tier *and* one of only two models (with 120b) that support strict `json_schema` structured outputs, so correctness and latency point the same direction. Gemini's `gemini-2.5-flash-lite` (the Phase 0 pick) had already been restricted to existing users only by the time Phase 3 was built, one week later, confirmed by listing the actual key's available models; switched to `gemini-flash-lite-latest`, a rolling alias, specifically to reduce the odds of this breaking again before the submission deadline.

Real bugs found and fixed by testing against live APIs instead of trusting the design on paper:
- Groq's `max_tokens=512` truncated longer answers before valid JSON completed; raised to 1024.
- `LLMAnswer` had `model_config = ConfigDict(extra="forbid")` for Groq's strict-mode `additionalProperties: false` requirement, but that same schema reused for Gemini made its API reject the request outright (`response_schema` is a restricted OpenAPI subset, not full JSON Schema). Fixed by generating the strict-mode dict only inside `groq_llm.py`, leaving the shared `LLMAnswer` model plain.
- Citations were originally `citations: list[int]` (passage numbers referencing the numbered context block, not raw chunk_id strings, since the model was separately observed mangling the `strategy:query_id:passage_idx` id format when asked to echo it directly). Even after fixing the id-echoing problem, the list form itself turned out unreliable: `openai/gpt-oss-20b`'s hidden reasoning trace correctly identified multiple relevant passages ("citations [1], [2]") but then concatenated them into a malformed single int like `12` in the actual JSON output, consistently, across all three `reasoning_effort` levels. Switched to a single required `citation: int` field, 100% reliable across repeated trials, the orchestrator maps it back to the real chunk_id.
- The pipeline orchestrator's generic per-stage retry wrapper (from Phase 2, added when no stage did real I/O yet) would have stacked retries on top of each provider's own retry/backoff once Sarvam/Groq/Gemini calls landed, multiplying a real outage into a very slow failure. `_run_stage` now takes a `retries` flag; the `transcribe` and `generation` stages opt out since they own their retry and fallback logic already.
- `_refuse()` was silently dropping the `generation` field on a grounding refusal, so the API response only ever showed "refused: true" with no visibility into what was actually rejected. Now the rejected generation is kept in the response for transparency; `refused=True` remains what callers must gate display on.

All of the above were caught by testing the real query battery from Phase 2 (on-topic, off-topic/gibberish, unsafe) against the live Groq and Gemini APIs with the user's actual keys, not by inspection. One of those runs produced a genuinely correct grounded refusal: "who wrote the declaration of independence" retrieved five passages that describe when/how the Declaration was adopted but never name an author, the model's self-reported `grounded: false` and the independent lexical-overlap guardrail (0.00 overlap) agreed, and the pipeline refused rather than reaching for outside knowledge. That's the core story of this whole project working end to end.

## Phase 4 - Latency benchmarking
Status: done

- [x] `benchmark_latency.py` run across a real query set (not a single best-case run) - 5,000 real `Eng_Query` values pulled from the same source rows the index was built from, cached at `backend/data/benchmark_queries.json`, sampled with a fixed seed
- [x] P50/P70/P100 computed for both the retrieval-only path (all 5 chunking strategies, 150 queries each) and the full path with generation (40 queries, paced) - `docs/latency-report.md`
- [x] Tuning pass to close the gap toward the 200ms target where feasible
- [x] `docs/latency-report.md` written

Real fix found and applied: the relevance guardrail's raw top-score lookup (`raw_top_scores`) was re-querying both the FAISS and BM25 indexes a second time after the fused hybrid search had already computed the same thing, discarding the scores it needed. `search.hybrid_search_with_scores` (`backend/app/retrieval/search.py`) now reads both raw scores off the same dense/BM25 calls used for fusion, roughly halving the retrieval stage's index-query work. `stages.run_retrieval` updated to use it; `hybrid_search` (used by the sanity-check scripts) is untouched.

Retrieval-only latency, all 5 chunking strategies, comfortably under 200ms across the board (P50 28-48ms, P100 all under 105ms even for the two larger-corpus strategies). Latency doesn't meaningfully distinguish the strategies at this corpus scale, so **`passage_native` stays the production strategy** (already the default): `metadata_aware` and `hierarchical` index identical passage text and embeddings, offering no retrieval upside, and `hierarchical` additionally carries the known parent-text duplication bloat (227MB vs ~115MB, see Phase 1 notes) which costs more at container-start artifact pull on Render's free tier for no benefit; `fixed_window` and `semantic` fragment passages into more, smaller chunks with no demonstrated quality upside measured in this phase. This closes the strategy decision Phase 1 deferred to "once latency numbers are in."

Full path (retrieval + Groq generation) can't hit 200ms and was never expected to, per the plan's honest-interpretation framing, no hosted LLM API generates that fast. What Phase 4 did find: Groq's free tier throttles noticeably under sustained back-to-back requests (unpaced 40-query run: P50 8.75s, P100 17.8s, all still successfully served by Groq, never triggering the Gemini fallback since these were slow responses, not failures). Pacing queries 2.5s apart roughly halved that (P50 3.7s, P100 7.0s) without eliminating the variance entirely, individual paced queries still ranged from ~400ms to ~7s. Likely a rolling token-throughput budget rather than a pure per-request limit (this pipeline's prompt carries five full retrieved passages as context), not confirmed against actual rate-limit response headers. A single interactive demo query should land toward the fast end of that range. Full detail and the reasoning behind it: `docs/latency-report.md`.

Guardrail calibration validated against this larger query set rather than changed: Phase 2's provisional `grounding_overlap_threshold=0.6` sits in a clean gap (every refused answer's overlap was <=0.59, every passed answer was >=0.64) across the 40-query sample, and the off-topic guardrail had zero false positives on 40 genuine on-topic queries. One caveat: the refused count shifted from 8/40 to 7/40 between two full-path runs over the identical queries, which is `temperature=0.2` generation stochasticity moving borderline-overlap answers across the line, not guardrail noise.

## Phase 5 - Frontend
Status: done

- [x] React/Vite/Tailwind (v4)/lucide-react scaffold, wide full-bleed layout (max width 1600px, matches the plan). shadcn/ui itself wasn't pulled in via its CLI (that needs an interactive init); instead hand-built the few primitives needed (`Button`, `Badge`, `Card`) in the same style, `class-variance-authority` + `tailwind-merge`, so still zero-runtime-dependency, copy-in components, not a component library import.
- [x] Panels: `RecordPanel` (mic via `MediaRecorder`, plus a text input fallback since a judge's browser might not grant mic permission), `AnswerPanel` (grounded answer, or one of three distinct refusal states: unsafe / off-topic / ungrounded, the ungrounded case shows the withheld answer struck through for transparency, matching how the backend already keeps `generation` on a refusal), `SourcesPanel` (retrieved chunks, cited one highlighted), `LatencyPanel` (per-stage bars plus total, retrieval called out against the 200ms target). No separate transcript panel, folded into "You asked ..." at the top of `AnswerPanel` since `result.query` already covers both the typed and the Sarvam-transcribed case.
- [x] `backend/app/main.py` built (this was still open going into Phase 5, `POST /api/query`, `POST /api/audio`, `GET /api/health`, serves `frontend/dist` when built). Vite dev proxy (`/api` to `127.0.0.1:8000`) means no CORS handling needed in either dev or prod, same-origin either way.
- [x] Wired to the backend: verified through the actual dev-server proxy path with curl, not just direct backend calls, real grounded answer, real off-topic refusal, both round-tripped correctly. `npm run build` (`tsc -b && vite build`) passes clean.
- [x] Visual check: user opened the live dev server and confirmed the rendered UI looks right (spacing, colors, brand tokens, latency bars all matched). Layout is implemented with responsive intent (single column below 1024px, three-column `360px / 1fr / 360px` sidebar layout at 1024px+, the record and latency panels pair up side by side starting at 640px so the 768px tablet view isn't a single starved column), but the check wasn't a formal pass through every one of 360/768/1024/1440/1920px individually, only a normal-width desktop view was actually confirmed. Worth a quick resize-and-look before the demo video if there's time.

## Phase 6 - Deployment
Status: in progress

- [x] `Dockerfile` at repo root (multi-stage: `node:22-slim` builds `frontend/dist`, `python:3.14-slim` runs the backend and serves it), `.dockerignore` to keep `backend/data/` (741MB locally) and other local-only content out of the build context
- [x] `backend/scripts/pull_index.py` - pulls only the `default_strategy` subfolder from the `gauravxsuvo/groundline-index` HF Hub dataset repo at container start (not the full 740MB across all 5 strategies), idempotent if the target dir is already populated
- [x] Verified locally with Docker Desktop: `docker build` succeeds cleanly on `python:3.14-slim`, every runtime dependency (including `pydantic-core`, a compiled Rust extension) resolved to a prebuilt `cp314` manylinux wheel, no compiler toolchain needed. A `--memory=512m` capped run (matching Render free tier's ceiling, used as a proxy before an actual hosting decision was settled) pulled the index (37s for ~115MB), served `/api/health`, the built frontend, and a real `/api/query` correctly, including a genuinely correct grounded refusal for "what is the capital of France" (corpus never states it directly).
- [ ] Env vars set in the hosting dashboard
- [ ] Live URL verified end to end, including a cold-start run

Memory finding from the local test: idle memory is 298MB, but the first query (which lazy-loads the embedding model) pushes it to ~503MB, plateauing there over repeated queries rather than leaking. That was measured against a 512MB cap chosen to match Render's free tier before the hosting decision was final. Resolved: Portway's default instance is 1GB RAM / 2 CPU, roughly double the observed peak, comfortable headroom. No mitigation needed.

Hosting platform: pivoted from the original Render free-tier plan to Portway (see `portway-hosting-guide.md` at repo root, gitignored alongside `CLAUDE.md`/`AGENT.md` since it's agent-facing operational guidance, not part of the submission). The existing `Dockerfile` already matches Portway's contract as-is (`EXPOSE 8000`, `CMD` binds to `${PORT:-8000}`), so no changes were needed there. `render.yaml` (Render Blueprint) was already written before the pivot and is left in place, unused by Portway's build detection, in case Render is revisited.

## Phase 6.5 - Correctness and quality pass
Status: done

Triggered by the voice input misbehaving on English speech. That turned out to be real, and looking for its cause surfaced several other things worth fixing.

### The voice bug

- [x] **Root cause: the browser was sending the wrong audio format.** `RecordPanel` used `MediaRecorder`, which yields WebM/Opus on Chrome and Firefox and MP4/AAC on Safari. Its WebM header declares an unknown duration, because a live recorder does not know the length until it stops and never goes back to patch the header, and decoders differ on how much of such a file they will read. Sarvam documents WAV 16-bit PCM at 16kHz mono as its best-accuracy input, and verified directly against the live API, English audio in that format transcribes perfectly (`saaras:v3`, `mode=transcribe`, `language_code=en-IN`, all correct as configured, the backend call was never the problem).
- [x] New `frontend/src/lib/recorder.ts` captures raw PCM through the Web Audio API and writes the WAV container itself. Every browser now posts byte-identical 16kHz mono 16-bit audio. Falls back to `ScriptProcessorNode` on pre-AudioWorklet Safari, and box-filters rather than decimates when a browser refuses to open the capture context at 16kHz, since plain decimation would alias.
- [x] **A second, compounding bug: transcription failures were invisible.** A failed transcribe returns HTTP 200 with `error` set and no answer. `AnswerPanel` had no branch for that, so it fell through to the success layout and rendered an empty answer under a green "Grounded" badge. Anyone hitting a voice problem saw the system confidently answering nothing rather than an error. Fixed, and the Sarvam errors are now phrased for the person who recorded the clip ("no speech was detected in the recording").
- [x] Recording UX: live input level meter, 30s countdown against Sarvam's sync ceiling with auto-stop, silent and mis-tap clips rejected before upload, microphone released on unmount instead of staying open.

### Retrieval quality, measured for the first time

The project had latency numbers but no accuracy numbers, on a retrieval task. `backend/scripts/eval_retrieval.py` now scores recall@k and MRR@k against MS MARCO's own `is_selected` relevance labels, which were already sitting in chunk metadata unused. Offline, no API keys, about 30 seconds for all five strategies. Write-up in `docs/retrieval-quality.md`.

- [x] **Equal-weight RRF was the single largest quality problem in the pipeline**: recall@5 0.801 against dense-only's 0.891, the same ~9 point gap on all five strategies. BM25 is much weaker on this corpus (0.634) and RRF credits by rank alone, so its rank-1 hit counted as much as dense's regardless of quality. Swept the weights on a dev half and confirmed on a held-out half: `rrf_dense_weight=12`, `rrf_sparse_weight=1`, `rrf_k=10`, which recovers dense-level accuracy (test half 0.887 / 0.624 against dense-only's 0.887 / 0.625).
- [x] Sparse retrieval stays, for two reasons that survive the measurement: it is the only signal the off-topic guardrail can use (BM25 hits exactly 0.0 for out-of-vocabulary input, dense cosine has a 0.65 noise floor) and it still breaks ties on exact rare terms where dense has no strong opinion. A BM25 backstop arrangement was also tested and is worse than just taking 5 from dense; numbers in the report.
- [x] `retrieval_top_k` stays at 5 after checking the recall@k curve. 8 would buy 6 points of recall for 60% more prompt tokens, and tokens are the binding constraint on generation.

### Grounding, which is the whole claim of this project

- [x] **The model's own `grounded: false` was being discarded.** The pipeline only ever consulted the lexical overlap check. Caught live: "who wrote the declaration of independence" returned "The provided context passages do not state who wrote the Declaration of Independence" with `grounded=false`, and because that sentence is built almost entirely from words lifted out of the context, it scored high overlap and would have been presented as a confident grounded answer. Both signals are now consulted and either one refuses.
- [x] **A real hallucination leak, found and closed.** "what is the capital of France" was being answered "The capital of France is Paris" with `grounded=true` and confidence 1.0. Verified by inspecting the retrieved set that no passage states it; the closest reads "Paris in France lies on the Seine River". Both lexical checks pass that answer, because every content word in it does appear somewhere across the five passages, just never in one passage making the claim.
  - Tried and rejected: scoring overlap against the best single passage instead of the concatenation, and cosine similarity between the answer and each passage. Measured on grounded and hallucinated examples, neither separates. The hallucinated "everest" case scored 0.820 cosine against a genuinely grounded answer's 0.808. This class of error is a *relational* claim whose components are all present in the evidence, and word or vector overlap cannot verify a relation.
  - What worked, or looked like it did: since the self-report is now load-bearing, make it accurate. The system prompt now defines `grounded` explicitly, that the passages mentioning the same entities is not enough, and that a correct refusal beats a fact that is right for the wrong reason. The France query now refuses with "The context mentions Paris in France, but it does not state that Paris is the capital of France." 7 of 7 on the answer/refuse battery, including one case ("what causes the northern lights") that refused correctly against expectation, since the corpus turns out to have nothing on aurora.
  - **This did not hold. See Phase 6.6.** The same query answered "Paris" with `grounded: true` again on a later check, three runs out of three. The prompt wording moved the behaviour without pinning it, and because the battery was run by hand and never written down as a script, the regression went unnoticed between phases.

### Latency and robustness

- [x] **Phase 4's throttling hypothesis confirmed against the actual headers.** The binding Groq free-tier limit is 8,000 tokens per minute, not requests (request budget was 96% unspent while tokens were at 1,089 remaining). There is a 200,000 token daily ceiling under it that returns a hard 429. `docs/latency-report.md` updated with the headers.
- [x] `reasoning_effort="low"` on the Groq call: median generation 738ms to 473ms, median completion tokens 214 to 69. Measured with configs interleaved round-robin so throttle drift hit each equally, the naive sequential measurement is badly confounded by it.
- [x] The response schema was shipping `LLMAnswer`'s docstring to the API on every request, several paragraphs of internal notes about why `citation` is an int, roughly 230 tokens against an 8,000 token budget. Stripped.
- [x] Rate-limit errors are no longer retried locally; the reset window is ~50s and the retry ceiling was 2s, so retrying could only delay the handoff. A 429 now falls straight to Gemini, which answers in 1 to 1.6s. This got exercised hard and unintentionally while producing these numbers, after the daily ceiling was hit: every query kept being answered correctly.
- [x] **`POST /api/audio` was blocking the event loop.** An `async def` handler calling the fully blocking `run_audio` (Sarvam, FAISS, then an LLM) held the loop for the whole multi-second request, stalling everything else including `/api/health` and the static frontend. Now hands off via `run_in_threadpool`. `/api/query` never had it, being a plain `def` that FastAPI already offloads.
- [x] Embedding model warms up at startup instead of lazy-loading inside the first query, which on a cold container put a multi-second load and ~200MB allocation on whoever asked first. Runs on a worker thread so it cannot stall the health check a host is polling.
- [x] Upload size cap on `/api/audio` (413 rather than reading unbounded bytes into memory on a 1GB instance), explicit content type on the Sarvam multipart part (mimetypes resolves `.webm` to `video/webm`, which is not an audio type), and retries narrowed to the errors that can actually succeed on a second attempt.
- [x] Removed the generic per-stage retry wrapper. It only ever wrapped deterministic in-memory stages (guardrails, retrieval), where retrying triples the time to a failure that was never going to succeed. Retries live next to the I/O that can transiently fail, which is where they already were.

Known gap, recorded rather than hidden: the grounding fix rests on the model's self-assessment, which is a model behaviour and not a guarantee. The lexical check remains as an independent floor underneath it, but the France class of error is caught by prompt quality, not by a mechanism that cannot fail. Catching it structurally needs an entailment model, which is out of scope for this build.

## Phase 6.6 - Grounding regression, UI clarity, tests
Status: done

Started as the frontend work for making the 200ms claim legible to a reviewer. Picking demo queries meant running them, and running them surfaced the regression below.

### The grounding regression, and why it could happen

- [x] **The France hallucination was back.** "what is the capital of france" answered "Paris", `grounded: true`, confidence 0.95, three runs out of three, against a retrieved set whose closest passage is "Paris in France lies on the Seine River" and which never states the capital. Both lexical signals pass it: a one word answer overlaps its context perfectly, and the model's self-report was wrong.
- [x] **Fixed structurally rather than by wording this time.** `LLMAnswer` gained an `evidence` field, declared before `answer` since both providers emit JSON in schema order, and the prompt requires it to be copied character for character out of the cited passage. `output_guard.verify_evidence` then checks the span really occurs in the retrieved text, comparing word sequences so that casing, curly quotes and whitespace drift do not read as fabrication. It changes what the model is asked from a judgement it can rationalise into a retrieval it either can or cannot perform, and it gives the guardrail something it can check without trusting the model. The France query now copies the Seine River sentence and refuses.
- [x] **The real root cause was that nothing tested it.** `backend/scripts/eval_grounding.py` runs the battery as a script now, nine cases with known outcomes, four answerable (which is where a stricter grounding rule would show up as false refusals) and five that must be refused, one per guardrail plus the two adversarial ones. 9/9. Write-up: `docs/grounding.md`.
- [x] Measured what the extra field costs, interleaved round-robin so throttle drift hits both configs equally: median completion tokens 66 to 100, median generation 479ms to 586ms with the latency difference inside the noise at n=5. Noted in `docs/latency-report.md`.
- [x] `backend/tests/` exists now, 16 pytest cases over both guardrails, no index or keys needed, each one a failure that actually happened during this build rather than an invented input.

### Making the 200ms claim legible

The number was in `docs/latency-report.md` and nowhere a reviewer would see it without opening the repo, and the UI reported a single blended total that invited exactly the misreading the report was written to avoid.

- [x] `GET /api/meta` serves the live config (strategy, chunk count, top_k, model names) plus the measured benchmark figures and the local/network stage split, so the UI states what the backend is running rather than carrying its own copy of it.
- [x] `TargetStrip` at the top of the page: the measured retrieval P50 against the 200ms target, in a sentence, plus what that figure covers and the explicit statement that generation is a hosted call, timed separately and never counted against it.
- [x] `LatencyPanel` rewritten: in-process total drawn against a fixed 0 to 200ms scale (a fixed scale so a fast query looks fast), stages tagged in-process or network, network calls totalled separately, end to end last.
- [x] `PipelineFooter`: the six stages with each one marked in-process or network, so the boundary the target is measured on is visible without reading prose.
- [x] Demo queries in the UI, three the corpus answers and three it refuses, one per guardrail. The corpus is a 5,000 row sample, so questions a visitor invents mostly come back refused, which reads as broken rather than careful. These have verified outcomes and are kept in sync with `eval_grounding.py`.
- [x] The answer now shows the quoted supporting span, and the sources panel highlights that span inside the passage it was taken from, matched the same way the backend verifies it.
- [x] Layout reworked to a flat grid with explicit placement, so reading order can differ per width: phone gets ask, answer, sources, latency; 640px pairs ask and latency; 1024px is the three column layout. Checked at 390, 768, 1440 and 1920 with screenshots at each, in the empty, answered, refused and off-topic states.

## Phase 6.7 - Thread oversubscription
Status: done

Came out of a question about whether a bigger corpus would fit, which meant profiling retrieval per component, which turned up FAISS search costing 31.7ms inside the pipeline and 1.7ms alone. Flat search is a matrix multiply whose cost is data independent, so that gap was environmental.

- [x] **FAISS and ONNX Runtime were both taking every core, back to back, on one short query.** Forking a 24 thread OpenMP team for a 384 float vector against 50k rows costs more than the arithmetic saves, and ORT's threads are still spinning down when FAISS asks for the cores. `faiss.omp_set_num_threads(1)` in `retrieval/index.load_index`, exposed as `faiss_threads` in config.
- [x] Single threaded wins at every thread count tested, including 2, which is what the deployed instance has, so this is a portable default rather than a tweak for a 24 core desktop. Nothing here searches in batches, which is the case where the threads would pay for themselves.
- [x] Retrieval-only P50 35.0ms to 5.9ms, P100 72.2ms to 12.1ms. Retrieval stage inside the full path 66.2ms to 5.8ms, measured through a different code path and agreeing.
- [x] Quality re-checked rather than assumed: `eval_retrieval.py` gives recall@5 0.891 / MRR@5 0.621, identical to before. Thread count changes scheduling, not arithmetic.
- [x] Found a reporting trap while merging the numbers: the five-strategy sweep holds all five bundles in one process, around 400MB of vectors, and now reads two to three times higher than a single resident index because a single-threaded scan is sensitive to that memory pressure. The comparison between strategies is still fair; the sweep figure is not the one to quote for a deployed index. Both are in `docs/latency-report.md`, labelled.
- [x] `docs/latency-report.md` regenerated to a scratch path and merged by hand, since that file is generator output plus sections added since. Noted in AGENT.md so the next run does not overwrite the analysis.

Also settled, since it was the question that started this: nothing in this system is trained, so there is nothing to train further. The embedding model is frozen and pre-trained, FAISS and BM25 are indexes rather than models, and generation is a hosted API. A GPU only speeds up the offline embedding pass when rebuilding the index, and would go in `requirements-dev.txt` alone, never `requirements.txt`, since the deployed container has no GPU and embeds one short query per request. Corpus size is the lever that would change answer coverage, and measured component memory (chunk objects 147MB, FAISS 77MB, BM25 23MB at 49,885 chunks, against a fixed 190MB for Python and the embedding model) puts the ceiling near 110,000 chunks in Portway's 1GB, roughly 2x. Not done: doubling coverage does not change the demo experience, since a visitor's invented questions mostly miss a 5,000 row sample either way, and the risk of touching every reported number days before the deadline is not worth it.

## Phase 7 - Polish and submission
Status: in progress

- [x] Repo cleanup pass against style rules (no em dash, no emoji, no AI-sounding text, no Claude trailers)
- [x] README, AGENT.md, CLAUDE.md, `docs/` finalized
- [ ] Submission checklist: repo link, live link, both videos, #RAGInGoa posts on Instagram/X/LinkedIn by every member, form submitted with buffer before the deadline

## Open blockers

Phase 6 needs the user to actually create the Portway project (repo URL, env vars from the Env tab) since that's a dashboard action, not something scriptable from here. Once live, confirm the URL end to end including a cold start.
