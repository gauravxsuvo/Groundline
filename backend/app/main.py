from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import settings
from .harness.logging_utils import get_logger
from .harness.pipeline import Pipeline
from .harness.schemas import PipelineResult
from .retrieval import embed

logger = get_logger("api")

FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

_pipeline: Pipeline | None = None


def get_pipeline() -> Pipeline:
    if _pipeline is None:
        raise HTTPException(status_code=503, detail="pipeline not ready")
    return _pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pipeline
    _pipeline = Pipeline.from_strategy(settings.default_strategy)
    if settings.warm_start:
        # Pay the embedding model's lazy load here rather than inside whoever
        # sends the first query. Off the event loop so a slow cold start does
        # not stall the health endpoint that a host is polling to decide the
        # container is up.
        await run_in_threadpool(embed.warmup)
        logger.info("embedding model warmed up")
    yield


app = FastAPI(title="Groundline", lifespan=lifespan)


class QueryRequest(BaseModel):
    query: str


@app.get("/api/health")
def health() -> dict:
    pipeline = get_pipeline()
    return {"status": "ok", "strategy": pipeline.bundle.strategy, "chunks": len(pipeline.bundle.chunks)}


@app.post("/api/query", response_model=PipelineResult)
def run_query(body: QueryRequest) -> PipelineResult:
    if not body.query.strip():
        raise HTTPException(status_code=400, detail="query is empty")
    return get_pipeline().run(body.query)


@app.post("/api/audio", response_model=PipelineResult)
async def run_audio(file: UploadFile) -> PipelineResult:
    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="empty audio upload")
    if len(audio_bytes) > settings.max_audio_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"audio upload is larger than the {settings.max_audio_bytes // (1024 * 1024)}MB limit",
        )
    # run_audio is fully blocking (Sarvam, FAISS, then Groq or Gemini), several
    # seconds of it. Calling it directly from this async handler would hold the
    # event loop for that whole window, stalling every other request including
    # the health check and the static frontend. `run_query` below is a plain
    # `def`, which FastAPI already offloads for exactly this reason; an async
    # handler has to do it explicitly.
    return await run_in_threadpool(
        get_pipeline().run_audio, audio_bytes, file.filename or "recording.wav"
    )


# Mounted last so /api/* above always takes precedence. Only present once the
# frontend has actually been built (`npm run build`); in local dev the Vite
# dev server serves the frontend instead and proxies /api to this process.
if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
