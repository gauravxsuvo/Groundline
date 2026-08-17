from __future__ import annotations

from functools import lru_cache

import numpy as np
from fastembed import TextEmbedding

from ..config import settings

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def get_embedder() -> TextEmbedding:
    # `threads` is not optional in a container. Left unset, ONNX Runtime sizes
    # its pool from the host's core count, which a container can see even when
    # it is capped well below that, and the resulting oversubscription is the
    # difference between a few milliseconds and a few hundred. See the comment
    # on `embed_threads` in config.py for the measurement.
    return TextEmbedding(
        model_name=MODEL_NAME,
        threads=settings.embed_threads,
        cache_dir=settings.embed_cache_dir or None,
    )


def embed_texts(texts: list[str]) -> np.ndarray:
    if not texts:
        return np.empty((0, 384), dtype="float32")
    model = get_embedder()
    return np.array(list(model.embed(texts)), dtype="float32")


def warmup() -> None:
    """Loads the ONNX model and runs one embedding through it.

    Without this the model loads lazily inside the first query, which puts a
    one-off multi-second hit and a ~200MB allocation on whoever asks first.
    On a cold container that is the person doing the demo. Constructing the
    embedder is not enough on its own, the first actual `embed` call is what
    forces the ONNX session to initialise.
    """
    embed_texts(["warmup"])
