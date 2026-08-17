from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import snapshot_download

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", default=os.environ.get("HF_DATASET_REPO") or settings.hf_dataset_repo)
    parser.add_argument("--strategy", default=settings.default_strategy)
    args = parser.parse_args()

    if not args.repo_id:
        raise SystemExit("Set HF_DATASET_REPO in the environment or pass --repo-id")

    strategy_dir = DATA_DIR / args.strategy
    if strategy_dir.exists() and any(strategy_dir.iterdir()):
        print(f"Index artifacts for '{args.strategy}' already present at {strategy_dir}, skipping pull")
        return

    token = os.environ.get("HF_TOKEN") or settings.hf_token or None
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    snapshot_download(
        repo_id=args.repo_id,
        repo_type="dataset",
        token=token,
        local_dir=str(DATA_DIR),
        allow_patterns=[f"{args.strategy}/*"],
    )
    print(f"Pulled '{args.strategy}' artifacts from https://huggingface.co/datasets/{args.repo_id} into {DATA_DIR}")


if __name__ == "__main__":
    main()
