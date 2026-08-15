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
- [ ] Sarvam and Groq API keys obtained and dropped into a local `.env` (user-provided, not something I can create; not a blocker until Phase 3)

### Dataset findings (feeds into Phase 1)

The repo has no separate English file. It's 13 per-language parquet files under `train/` and `validation/` (e.g. `train/hintrain.parquet`), each holding parallel translations of the *same* underlying English MS MARCO source. Every language file carries `Eng_Query`, `Eng_Answer`, and `passages.English_passages` (plus `passages.is_selected` relevance labels and `query_type`) alongside its own translated columns. Since we're English-only, we can source from whichever language file is smallest, no need to touch the translation columns at all.

- Schema (confirmed via parquet footer, no download needed): `query_id`, `query_type`, `Eng_Query`, `Eng_Answer`, `query`/`Answer` (translated), `source_lang`, `target_lang`, `meta` (translation model params), `passages.{English_passages, Translated_passages, is_selected}`.
- Row count: ~700k-780k rows per language file (778,638 confirmed for Hindi). File sizes are all ~3.3-4GB regardless of language (dominated by the shared English content), Urdu's is smallest at 3339 MB.
- Each parquet file is a single row group, so there's no cheap "read just N rows" over HTTP. Column projection (skip the translation columns, keep only the English ones) is the only real lever, still requires pulling full column chunks for `Eng_Query`/`Eng_Answer`/`passages` across all rows.
- Confirmed real content via a live column-pruned fetch, e.g. query `"what direction does phloem flow"` -> `"No Answer Present."`, and `query_type` values like `DESCRIPTION`. This is genuine MS MARCO-format QA data.
- Phase 1 plan: pull `train/urdtrain.parquet` (smallest), project to just `query_id, query_type, Eng_Query, Eng_Answer, passages.English_passages, passages.is_selected`, then sample down to the target corpus size (tens of thousands of chunks, exact number to be decided against Render's free-tier memory budget in Phase 1).

## Phase 1 - Data & retrieval core
Status: not started

- [ ] Sample and clean the English corpus subset
- [ ] Implement the 5 chunking strategies (fixed-size sliding window, sentence-aware semantic, passage-native, metadata-aware, hierarchical parent/child)
- [ ] Build FAISS dense index (bge-small-en-v1.5 via fastembed) and bm25s sparse index
- [ ] Push index artifacts to a Hugging Face Hub dataset repo
- [ ] Hybrid retrieval with reciprocal rank fusion, sanity-checked on hand-picked queries

## Phase 2 - Guardrails and harness skeleton
Status: not started

- [ ] Input guardrail (off-topic, unsafe input)
- [ ] Output guardrail (grounding / hallucination check)
- [ ] Orchestrator: typed Pydantic stages, retries with backoff, structured logging, wired to retrieval (generation stubbed)

## Phase 3 - STT and generation integration
Status: not started

- [ ] Sarvam STT wired in as the first stage
- [ ] Groq generation wired in with structured JSON output (answer, citations, grounded), Gemini as automatic fallback
- [ ] End-to-end CLI test: audio file in, structured grounded answer out

## Phase 4 - Latency benchmarking
Status: not started

- [ ] `benchmark_latency.py` run across a real query set (not a single best-case run)
- [ ] P50/P70/P100 computed for both the retrieval-only path and the full path with generation
- [ ] Tuning pass to close the gap toward the 200ms target where feasible
- [ ] `docs/latency-report.md` written

## Phase 5 - Frontend
Status: not started

- [ ] React/Vite/Tailwind/shadcn scaffold, wide full-bleed responsive layout
- [ ] Record / transcript / answer / sources / live latency panels
- [ ] Wired to the backend API, tested at 360/768/1024/1440/1920px

## Phase 6 - Deployment
Status: not started

- [ ] Dockerfile, Render free web service configured
- [ ] Env vars set in Render dashboard
- [ ] Live URL verified end to end, including a cold-start run

## Phase 7 - Polish and submission
Status: not started

- [ ] Repo cleanup pass against style rules (no em dash, no emoji, no AI-sounding text, no Claude trailers)
- [ ] README, AGENT.md, CLAUDE.md, `docs/latency-report.md` finalized
- [ ] Submission checklist: repo link, live link, both videos, #RAGInGoa posts on Instagram/X/LinkedIn by every member, form submitted with buffer before the deadline

## Open blockers

- Need `SARVAM_API_KEY` and `GROQ_API_KEY` (and optionally `GEMINI_API_KEY`) from the user before Phase 3 can be built and tested end to end. Not needed yet for Phase 0/1.
