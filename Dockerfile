FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.14-slim AS backend

# Run as a non-root user rather than root, which is the default and a bad one.
# Create it up front and use --chown on the way in rather than chowning
# afterwards: a recursive chown over the baked index would copy all 111MB of it
# into a second layer just to change its metadata.
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1
WORKDIR /home/user/app

COPY --chown=user backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir --user -r backend/requirements.txt

COPY --chown=user backend/app backend/app
COPY --chown=user backend/scripts backend/scripts
COPY --from=frontend-build --chown=user /app/frontend/dist frontend/dist

WORKDIR /home/user/app/backend

# The Hugging Face CDN drops long transfers on a slow link, and the index is
# 111MB. The default read timeout is 10 seconds, which turns an ordinary stall
# into a failed download; pull_index.py retries either way, but fewer stalls
# means fewer restarts before the container comes up.
ENV HF_HUB_DOWNLOAD_TIMEOUT=60

# Keep downloads on the plain HTTP path rather than the Xet client.
#
# Currently a no-op: huggingface_hub is pinned at 0.28.1, which predates Xet
# support entirely and has no constant to read this, and hf_xet is not installed
# either, so `file_download.http_get` is already the only path available. The
# `xet-bridge-us` host that shows up in download URLs is just where the Hub
# redirects every client, including ones with no Xet support at all, so it is
# not evidence that the Xet client is in play. Set here so that bumping the pin
# later cannot quietly change how 111MB gets fetched on a link that is already
# marginal, which is a thing that should be an explicit decision.
ENV HF_HUB_DISABLE_XET=1

# Bake the index and the embedding model into the image.
#
# Without this, every cold start downloads about 180MB from Hugging Face before
# it can serve anything: 111MB of index plus the ONNX model fastembed fetches on
# first use. That makes booting depend on somebody else's CDN being healthy at
# that moment, and when it is not, the container simply cannot start. Doing it
# here moves that dependency to build time, where a failure is visible to
# whoever is watching the build instead of leaving a container unable to start.
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
ENV EMBED_CACHE_DIR=/home/user/app/backend/.fastembed
RUN timeout 2400 python scripts/pull_index.py \
    || echo "WARNING: index not baked into the image, it will be pulled at startup"
RUN timeout 900 python -c "from app.retrieval import embed; embed.warmup()" \
    || echo "WARNING: embedding model not baked into the image, it will download at startup"

EXPOSE 8000

CMD ["sh", "-c", "python scripts/pull_index.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
