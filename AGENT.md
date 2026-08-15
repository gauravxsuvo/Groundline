# Agent context

Groundline: voice RAG system for HH Goa 2026 Task 2. Speech in, transcribed, retrieved against a subset of AI4Bharat MSMARCO-XI (English only), answered with citations and a grounding check. Deadline: Aug 22, 2026, 11:59 PM.

## Pipeline

```
mic -> Sarvam STT -> harness:
  input guardrail (off-topic / unsafe)
  -> hybrid retrieval (FAISS dense + bm25s sparse, 5 chunking strategies, RRF fusion)
  -> generation (Groq, fallback Gemini) with structured JSON output (answer, citations, grounded)
  -> output guardrail (refuse if not grounded)
-> response -> React UI (answer, sources, confidence, per-stage latency)
```

## Layout

- `backend/app/harness/` - pipeline orchestration, typed stages, retries
- `backend/app/retrieval/chunking/` - the 5 chunking strategies
- `backend/app/retrieval/{index,search}.py` - FAISS + bm25s, hybrid fusion
- `backend/app/guardrails/` - input and output guardrails
- `backend/app/providers/` - Sarvam / Groq / Gemini clients
- `backend/scripts/build_index.py` - offline: sample dataset, chunk, embed, write index artifacts
- `backend/scripts/benchmark_latency.py` - runs N queries, writes P50/P70/P100 to `docs/latency-report.md`
- `frontend/` - React + Vite + TS + Tailwind + shadcn/ui + lucide-react icons
- `backend/app/main.py` serves the built frontend and the API from one process

## Run locally

Backend: `cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload`
Building the index (needed once before the backend can serve retrieval): `pip install -r requirements-dev.txt && python scripts/build_index.py`
Frontend: `cd frontend && npm install && npm run dev`

## Deployment

One Render.com free web service, built from the Dockerfile at repo root. Index artifacts live in a Hugging Face Hub dataset repo and are pulled at container start (see `HF_DATASET_REPO` in `.env.example`), not committed to git. Free tier sleeps after 15 min idle - hit the URL once before a live demo.

## Conventions

- No em dashes in any committed text (code, docs, commit messages, UI copy). Commas or periods instead.
- No emoji anywhere. Icons only (lucide-react in the UI).
- Write plainly, like an engineer, not like AI-generated marketing copy.
- Commits and pushes: never add a Claude/Anthropic co-author trailer, never mention Claude/AI assistance in a commit message, PR, or anywhere else in this repo. Plain human-style messages only, every time, no exceptions.
- English only for this build (dataset itself covers 13 languages, out of scope here).
- The 200ms latency target is reported two ways: retrieval-only path (targeted to actually meet it) and full path including generation (reported honestly, not gamed). See `docs/latency-report.md` once Phase 4 is done.

## Status

See `PLAN.md` for phase-by-phase progress and what's next. Update it at the end of every session.
