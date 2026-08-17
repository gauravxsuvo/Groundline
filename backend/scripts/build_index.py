from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.retrieval import dataset, embed
from app.retrieval import index as index_module
from app.retrieval import search as search_module
from app.retrieval.chunking import fixed_window, hierarchical, metadata_aware, passage_native, semantic
from app.retrieval.chunking.base import Chunk

DEFAULT_SAMPLE_ROWS = 4000
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def embed_in_batches(texts: list[str], batch_size: int = 256) -> np.ndarray:
    if not texts:
        return np.empty((0, 384), dtype="float32")

    # `embed_threads` defaults to 1, which is right for serving one short query
    # and badly wrong here: this embeds tens of thousands of chunks and is the
    # one genuine batch workload in the project, so it wants every core it can
    # get. Set before the first embed call, since the embedder is built lazily
    # and cached on first use. See the comment on `embed_threads` in config.py.
    settings.embed_threads = os.cpu_count() or 1

    vectors = [embed.embed_texts(texts[i : i + batch_size]) for i in range(0, len(texts), batch_size)]
    return np.vstack(vectors)


def write_artifacts(strategy: str, chunks: list[Chunk], embeddings: np.ndarray, out_dir: Path) -> None:
    strategy_dir = out_dir / strategy
    strategy_dir.mkdir(parents=True, exist_ok=True)

    with (strategy_dir / "chunks.jsonl").open("w", encoding="utf-8") as f:
        for chunk in chunks:
            f.write(chunk.model_dump_json() + "\n")

    faiss_index = index_module.build_flat_index(embeddings)
    index_module.save_index(faiss_index, strategy_dir / "dense.faiss")

    bm25_index = search_module.build_bm25_index([c.text for c in chunks])
    search_module.save_bm25_index(bm25_index, strategy_dir / "bm25")

    print(f"  {strategy}: {len(chunks)} chunks, embeddings {embeddings.shape}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-rows", type=int, default=DEFAULT_SAMPLE_ROWS)
    parser.add_argument("--out-dir", type=Path, default=OUT_DIR)
    args = parser.parse_args()

    t0 = time.time()
    print(f"Sampling up to {args.sample_rows} rows from source parquet...", flush=True)
    rows = list(dataset.iter_source_rows(limit=args.sample_rows))
    print(f"Loaded {len(rows)} rows in {time.time() - t0:.1f}s", flush=True)

    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("Building passage-level chunks (shared by passage_native, metadata_aware, hierarchical)...", flush=True)
    passage_native_chunks: list[Chunk] = []
    metadata_aware_chunks: list[Chunk] = []
    hierarchical_chunks: list[Chunk] = []
    for row in rows:
        passage_native_chunks.extend(passage_native.chunk_row(row))
        metadata_aware_chunks.extend(metadata_aware.chunk_row(row))
        hierarchical_chunks.extend(hierarchical.chunk_row(row))

    assert len(passage_native_chunks) == len(metadata_aware_chunks) == len(hierarchical_chunks)

    print(f"Embedding {len(passage_native_chunks)} passage-level chunks...", flush=True)
    passage_embeddings = embed_in_batches([c.text for c in passage_native_chunks])

    write_artifacts("passage_native", passage_native_chunks, passage_embeddings.copy(), args.out_dir)
    write_artifacts("metadata_aware", metadata_aware_chunks, passage_embeddings.copy(), args.out_dir)
    write_artifacts("hierarchical", hierarchical_chunks, passage_embeddings.copy(), args.out_dir)

    print("Building fixed-window chunks...", flush=True)
    fixed_chunks: list[Chunk] = []
    for row in rows:
        fixed_chunks.extend(fixed_window.chunk_row(row))
    print(f"Embedding {len(fixed_chunks)} fixed-window chunks...", flush=True)
    fixed_embeddings = embed_in_batches([c.text for c in fixed_chunks])
    write_artifacts("fixed_window", fixed_chunks, fixed_embeddings, args.out_dir)

    print("Building semantic chunks...", flush=True)
    semantic_chunks: list[Chunk] = []
    for row in rows:
        semantic_chunks.extend(semantic.chunk_row(row, embed_fn=embed.embed_texts))
    print(f"Embedding {len(semantic_chunks)} semantic chunks...", flush=True)
    semantic_embeddings = embed_in_batches([c.text for c in semantic_chunks])
    write_artifacts("semantic", semantic_chunks, semantic_embeddings, args.out_dir)

    print(f"Done in {time.time() - t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
