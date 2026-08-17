<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/banner-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="brand/banner-light.svg">
  <img alt="Groundline" src="brand/banner-light.svg">
</picture>

A voice-enabled retrieval-augmented generation system. You speak a question, it gets transcribed, retrieved against a corpus built from AI4Bharat's MSMARCO-XI dataset, and answered with citations back to the source passages. The name comes from the core guarantee: every answer is grounded in retrieved evidence, or it says so instead of guessing.

## What it does

1. Record a question in the browser.
2. Sarvam transcribes the audio to text.
3. The query goes through an input guardrail (off-topic and unsafe-input checks), then hybrid retrieval: dense search over a FAISS index and sparse BM25 search, fused with weighted reciprocal rank fusion.
4. Groq (with Gemini as a fallback) generates an answer grounded in the retrieved passages, returning structured output: the answer, the passage it cites, a span copied verbatim out of that passage as its support, and a confidence estimate.
5. An output guardrail checks the answer holds up against the retrieved context before it's returned. If it doesn't, the system says so instead of guessing.

## Why five chunking strategies

A single fixed-size chunker is the easy path and the weak one. This corpus gets chunked five different ways (fixed-size sliding window, sentence-aware semantic splitting, the dataset's native passage boundaries, metadata-filtered chunks, and a hierarchical parent/child split), each one fully indexed, then benchmarked against each other on both accuracy and latency. One serves production, `passage_native`, chosen on those measurements rather than on preference. The other four stay built and reproducible, which is what makes the comparison checkable. `backend/app/retrieval/chunking/` has the detail on each.

## Retrieval quality

The dataset ships MS MARCO's own human relevance judgements (`is_selected`), so retrieval can be scored against real labels instead of eyeballed. `backend/scripts/eval_retrieval.py` does it offline in about 30 seconds, no API keys needed: **recall@5 0.891, MRR@5 0.621** on the production strategy over 1,200 labelled queries.

That measurement paid for itself immediately. Fusing dense and BM25 at equal weight, the textbook default this started with, scored 0.801 against dense retrieval's 0.891, because reciprocal rank fusion credits by rank position alone and BM25 is much weaker on this corpus. Weighting the fusion toward dense recovered the full 9 points. Working, reasonable-looking code was quietly costing a tenth of the system's accuracy, and nothing but a measurement was going to find it. Full write-up, including the weight sweep and why BM25 stays in the pipeline anyway, in `docs/retrieval-quality.md`.

## Grounding

An answer is shown only if it survives three independent checks, any one of which refuses: the model's own grounded flag, a lexical overlap check between the answer and the retrieved text, and an evidence span the model must copy verbatim out of the passage it cites, which is then verified in code against the retrieved text.

The third check exists because the first two both passed a real hallucination. Asked for the capital of France, against a corpus whose closest passage says "Paris in France lies on the Seine River" and which never states the capital, the pipeline answered "Paris" and marked it grounded. A one word answer trivially overlaps its context, and the model was sure. Making it copy the sentence that states the claim, rather than assert that one exists, fixes that case: it copies the Seine River sentence and refuses. `backend/scripts/eval_grounding.py` runs the nine case answer-or-refuse battery, currently 9/9, so this cannot regress silently again. Full write-up in `docs/grounding.md`.

## Latency

The design target is the full pipeline, chunking through final output, under 200ms. That's realistic for retrieval alone, not for a network round trip to an LLM. Both numbers are reported honestly rather than picking whichever one looks better: the in-process path (retrieval, fusion and every guardrail, targeted to land under 200ms and measured at **5.9ms P50, 12.1ms P100**) and the network calls to speech-to-text and generation, timed separately on every query and never folded into that figure. The live UI makes the same split, per query. Numbers across a real query set, not a cherry-picked run, are in `docs/latency-report.md`.

## Running it locally

```
cd backend
pip install -r requirements.txt
python scripts/pull_index.py    # downloads the prebuilt retrieval index, about 111MB
uvicorn app.main:app --reload
```

To build the index from the source dataset yourself instead of downloading it, install `requirements-dev.txt` and run `python scripts/build_index.py`. That reproduces all five chunking strategies and takes considerably longer than the pull.

```
cd frontend
npm install
npm run dev
```

Copy `.env.example` to `.env` and fill in `SARVAM_API_KEY`, `GROQ_API_KEY`, and `GEMINI_API_KEY`. `HF_TOKEN` is optional: the index lives in a public dataset repo, so pulling it needs no credentials.

## Checking it

```
cd backend
python -m pytest                      # guardrail tests, no keys, no index
python scripts/eval_retrieval.py      # recall@5 and MRR@5 against MS MARCO labels, no keys
python scripts/eval_grounding.py      # answer-or-refuse battery, needs a generation key
python scripts/benchmark_latency.py   # P50/P70/P100, retrieval-only and full path
```

The first two need no API keys and the first needs no index either.

## Stack

FastAPI backend, React and Vite frontend, FAISS and BM25 for retrieval, Sarvam for speech-to-text, Groq and Gemini for generation. See `AGENT.md` for the full architecture map.

## Running it with Docker

The `Dockerfile` builds the frontend and backend into one image that serves both:

```
docker build -t groundline .
docker run -p 8000:8000 --env-file backend/.env groundline
```

The build bakes the retrieval index and the embedding model into the image, so the container starts without needing to fetch anything. If that download fails while building, the build still succeeds and the container fetches what it is missing on first boot instead.
