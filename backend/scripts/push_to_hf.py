from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import HfApi, create_repo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", default=os.environ.get("HF_DATASET_REPO"))
    args = parser.parse_args()

    if not args.repo_id:
        raise SystemExit("Set HF_DATASET_REPO in .env or pass --repo-id")

    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Set HF_TOKEN in .env")

    if not DATA_DIR.exists():
        raise SystemExit(f"No artifacts found at {DATA_DIR}, run build_index.py first")

    api = HfApi(token=token)
    create_repo(repo_id=args.repo_id, repo_type="dataset", token=token, exist_ok=True)

    api.upload_folder(
        folder_path=str(DATA_DIR),
        repo_id=args.repo_id,
        repo_type="dataset",
        commit_message="Update index artifacts",
    )
    print(f"Pushed {DATA_DIR} to https://huggingface.co/datasets/{args.repo_id}")


if __name__ == "__main__":
    main()
