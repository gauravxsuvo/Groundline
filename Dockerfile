FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim AS backend
WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/app backend/app
COPY backend/scripts backend/scripts
COPY --from=frontend-build /app/frontend/dist frontend/dist

WORKDIR /app/backend
ENV PYTHONUNBUFFERED=1
# The Hugging Face CDN drops long transfers on a slow link, and the index is
# 111MB. The default read timeout is 10 seconds, which turns an ordinary stall
# into a failed download; pull_index.py retries either way, but fewer stalls
# means fewer restarts before the container comes up.
ENV HF_HUB_DOWNLOAD_TIMEOUT=60

# Bake the index and the embedding model into the image.
#
# Without this, every cold start downloads about 180MB from Hugging Face before
# it can serve anything: 111MB of index plus the ONNX model fastembed fetches on
# first use. That makes booting depend on somebody else's CDN being healthy at
# that moment, and when it is not, the container simply cannot start. Doing it
# here moves that dependency to build time, where a failure is visible to
# whoever is watching the build instead of taking a running deployment down.
#
# Deliberately best effort. If the CDN is slow or down while building, the build
# still succeeds and the container falls back to fetching at startup exactly as
# it used to, which is no worse than before. pull_index.py checks for every file
# it needs by name, so a partially baked index is detected and finished at
# startup rather than mistaken for a complete one.
#
# The timeouts are sized for a bad day on the CDN, not a good one. Measured
# against Hugging Face while it was degraded: 102KB/s, which puts the 111MB
# index at about 19 minutes and the 68MB ONNX model at about 11. Ceilings below
# that would just move the download to the container's first boot, where it is
# slower to notice and counts against whatever startup deadline the host
# applies. These are ceilings, not waits: a healthy CDN finishes in a couple of
# minutes and the build moves on.
ENV EMBED_CACHE_DIR=/app/backend/.fastembed
RUN timeout 2400 python scripts/pull_index.py \
    || echo "WARNING: index not baked into the image, it will be pulled at startup"
RUN timeout 900 python -c "from app.retrieval import embed; embed.warmup()" \
    || echo "WARNING: embedding model not baked into the image, it will download at startup"

EXPOSE 8000

CMD ["sh", "-c", "python scripts/pull_index.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
