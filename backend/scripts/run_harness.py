from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from app.harness.pipeline import Pipeline


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a query through the Groundline harness")
    parser.add_argument("query", nargs="?", help="query text; omit to enter interactive text mode")
    parser.add_argument("--audio", type=Path, default=None, help="path to an audio file to transcribe and run")
    parser.add_argument("--strategy", default=None, help="chunking strategy to retrieve against")
    args = parser.parse_args()

    pipeline = Pipeline.from_strategy(args.strategy)

    def run_text(query: str) -> None:
        result = pipeline.run(query)
        print(json.dumps(result.model_dump(), indent=2))

    if args.audio:
        audio_bytes = args.audio.read_bytes()
        result = pipeline.run_audio(audio_bytes, args.audio.name)
        print(json.dumps(result.model_dump(), indent=2))
        return

    if args.query:
        run_text(args.query)
        return

    print(f"Ready, strategy '{pipeline.bundle.strategy}'. Type a question, or 'quit' to exit.\n")
    while True:
        try:
            query = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not query or query.lower() in {"quit", "exit"}:
            break
        run_text(query)


if __name__ == "__main__":
    main()
