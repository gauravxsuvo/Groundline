# Groundline

A voice-enabled retrieval-augmented generation system built for HH Goa 2026, Task 2. You speak a question, it gets transcribed, retrieved against a corpus built from AI4Bharat's MSMARCO-XI dataset, and answered with citations back to the source passages. The name comes from the core guarantee: every answer is grounded in retrieved evidence, or it says so instead of guessing.

## What it does

1. Record a question in the browser.
2. Sarvam transcribes the audio to text.
3. The query goes through an input guardrail (off-topic and unsafe-input checks), then hybrid retrieval: dense search over a FAISS index and sparse BM25 search, fused and pulled from five different chunking strategies over the corpus.
4. Groq (with Gemini as a fallback) generates an answer grounded in the retrieved passages, returning structured output with citations and a confidence flag.
5. An output guardrail checks the answer is actually supported by the retrieved context before it's returned. If it isn't, the system says so instead of guessing.

## Why five chunking strategies

A single fixed-size chunker is the easy path and the weak one. This corpus gets chunked five different ways (fixed-size sliding window, sentence-aware semantic splitting, the dataset's native passage boundaries, metadata-filtered chunks, and a hierarchical parent/child split), searched together, and fused with reciprocal rank fusion. `backend/app/retrieval/chunking/` has the detail on each.

## Latency

The task asks for the full pipeline, chunking through final output, under 200ms. That's realistic for retrieval alone, not for a network round trip to an LLM. We report both numbers honestly rather than picking whichever one looks better: a retrieval-only path (targeted to land under 200ms) and the full path including generation. Numbers across a real query set, not a cherry-picked run, are in `docs/latency-report.md`.

## Running it locally

```
cd backend
pip install -r requirements.txt
python scripts/build_index.py   # needs requirements-dev.txt first, builds the retrieval index once
uvicorn app.main:app --reload
```

```
cd frontend
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in `SARVAM_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, and `HF_TOKEN`.

## Stack

FastAPI backend, React and Vite frontend, FAISS and BM25 for retrieval, Sarvam for speech-to-text, Groq and Gemini for generation. See `AGENT.md` for the full architecture map.

## Live demo

Deployed as a single free Render web service. Link: TBD.

Free tier sleeps after 15 minutes idle. If the first request feels slow, that's a cold start, not the pipeline.
