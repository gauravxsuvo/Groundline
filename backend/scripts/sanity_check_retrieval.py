from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.retrieval import embed
from app.retrieval import index as index_module
from app.retrieval import search as search_module
from app.retrieval.chunking.base import Chunk

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

TEST_QUERIES = [
    "what direction does phloem flow",
    "how many calories in a banana",
    "symptoms of type 2 diabetes",
    "distance from earth to the moon",
    "how to boil an egg",
    "who wrote the declaration of independence",
]


def load_chunks(strategy_dir: Path) -> list[Chunk]:
    chunks = []
    with (strategy_dir / "chunks.jsonl").open("r", encoding="utf-8") as f:
        for line in f:
            chunks.append(Chunk.model_validate_json(line))
    return chunks


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strategy", default="passage_native")
    parser.add_argument("--top-k", type=int, default=5)
    args = parser.parse_args()

    strategy_dir = DATA_DIR / args.strategy
    chunks = load_chunks(strategy_dir)
    faiss_index = index_module.load_index(strategy_dir / "dense.faiss")
    bm25_index = search_module.load_bm25_index(strategy_dir / "bm25")

    print(f"Loaded {len(chunks)} chunks for strategy '{args.strategy}'\n")

    for query in TEST_QUERIES:
        query_embedding = embed.embed_texts([query])[0]
        results = search_module.hybrid_search(query_embedding, query, faiss_index, bm25_index, top_k=args.top_k)

        print(f"Query: {query}")
        for rank, (chunk_idx, score) in enumerate(results, start=1):
            chunk = chunks[chunk_idx]
            snippet = chunk.text[:160].replace("\n", " ")
            print(f"  {rank}. [{score:.4f}] {snippet}")
        print()


if __name__ == "__main__":
    main()
