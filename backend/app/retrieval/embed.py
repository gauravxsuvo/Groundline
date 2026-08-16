from __future__ import annotations

from functools import lru_cache

import numpy as np
from fastembed import TextEmbedding

MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def get_embedder() -> TextEmbedding:
    return TextEmbedding(model_name=MODEL_NAME)


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
