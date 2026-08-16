<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="brand/banner-light.svg">
  <img alt="Groundline" src="brand/banner-light.svg">
</picture>

A voice-enabled retrieval-augmented generation system built for HH Goa 2026, Task 2. You speak a question, it gets transcribed, retrieved against a corpus built from AI4Bharat's MSMARCO-XI dataset, and answered with citations back to the source passages. The name comes from the core guarantee: every answer is grounded in retrieved evidence, or it says so instead of guessing.

## What it does

1. Record a question in the browser.
2. Sarvam transcribes the audio to text.
3. The query goes through an input guardrail (off-topic and unsafe-input checks), then hybrid retrieval: dense search over a FAISS index and sparse BM25 search, fused with weighted reciprocal rank fusion.
4. Groq (with Gemini as a fallback) generates an answer grounded in the retrieved passages, returning structured output with citations and a confidence flag.
5. An output guardrail checks the answer is actually supported by the retrieved context before it's returned. If it isn't, the system says so instead of guessing.

## Why five chunking strategies

A single fixed-size chunker is the easy path and the weak one. This corpus gets chunked five different ways (fixed-size sliding window, sentence-aware semantic splitting, the dataset's native passage boundaries, metadata-filtered chunks, and a hierarchical parent/child split), each one fully indexed, then benchmarked against each other on both accuracy and latency. One serves production, `passage_native`, chosen on those measurements rather than on preference. The other four stay built and reproducible, which is what makes the comparison checkable. `backend/app/retrieval/chunking/` has the detail on each.

## Retrieval quality

The dataset ships MS MARCO's own human relevance judgements (`is_selected`), so retrieval can be scored against real labels instead of eyeballed. `backend/scripts/eval_retrieval.py` does it offline in about 30 seconds, no API keys needed: **recall@5 0.891, MRR@5 0.621** on the production strategy over 1,200 labelled queries.

That measurement paid for itself immediately. Fusing dense and BM25 at equal weight, the textbook default this started with, scored 0.801 against dense retrieval's 0.891, because reciprocal rank fusion credits by rank position alone and BM25 is much weaker on this corpus. Weighting the fusion toward dense recovered the full 9 points. Working, reasonable-looking code was quietly costing a tenth of the system's accuracy, and nothing but a measurement was going to find it. Full write-up, including the weight sweep and why BM25 stays in the pipeline anyway, in `docs/retrieval-quality.md`.

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

Deployed as a single web service from the repo's `Dockerfile`. Link: TBD.

If the first request feels slow, that's a cold start (container boot plus pulling the retrieval index), not the pipeline itself.
