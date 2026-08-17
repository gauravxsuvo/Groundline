from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import bm25s
import faiss

from . import index as index_module
from . import search as search_module
from .chunking.base import Chunk


@dataclass
class StrategyBundle:
    strategy: str
    chunks: list[Chunk]
    faiss_index: faiss.Index
    bm25_index: bm25s.BM25


def load_chunks(strategy_dir: Path) -> list[Chunk]:
    chunks = []
    with (strategy_dir / "chunks.jsonl").open("r", encoding="utf-8") as f:
        for line in f:
            chunks.append(Chunk.model_validate_json(line))
    return chunks


def load_strategy_bundle(strategy: str, data_dir: Path) -> StrategyBundle:
    strategy_dir = data_dir / strategy
    if not strategy_dir.exists():
        raise FileNotFoundError(
            f"No index artifacts for strategy '{strategy}' at {strategy_dir}, run build_index.py first"
        )
    chunks = load_chunks(strategy_dir)
    faiss_index = index_module.load_index(strategy_dir / "dense.faiss")
    bm25_index = search_module.load_bm25_index(strategy_dir / "bm25")
    return StrategyBundle(strategy=strategy, chunks=chunks, faiss_index=faiss_index, bm25_index=bm25_index)
