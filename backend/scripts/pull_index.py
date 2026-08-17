from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from huggingface_hub import snapshot_download

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "processed"

# Every file a usable bundle needs, matching what `retrieval/loader.py` opens.
#
# Checking these by name rather than asking whether the directory has anything
# in it is the whole point. A download that dies partway through leaves a
# directory that is non-empty and unusable, and "non-empty" was the old
# condition for skipping the pull. One flaky download then became a permanent
# crash loop: the pull skipped, the server could not find chunks.jsonl and
# exited, the container restarted, and the pull skipped again for the same
# reason. Nothing in that loop could ever repair itself.
REQUIRED_ARTIFACTS = (
    "chunks.jsonl",
    "dense.faiss",
    "bm25/data.csc.index.npy",
    "bm25/indices.csc.index.npy",
    "bm25/indptr.csc.index.npy",
    "bm25/params.index.json",
    "bm25/vocab.index.json",
)

# Hugging Face writes each file to a `.incomplete` temporary and only moves it
# into place once it is whole, so a file being present means it is complete.
# Presence is therefore a sufficient check, and a partial file cannot pass it.

# Ten rather than five. Every attempt resumes from the `.incomplete` files the
# previous one left behind, so an extra attempt costs a few seconds of backoff
# and never repeats work. On a link that stalls repeatedly, which is what the
# deploy logs show, more attempts is close to free and is the difference between
# finishing and not.
DOWNLOAD_ATTEMPTS = 10

# Download one file at a time instead of the default eight.
#
# 73MB of the 111MB bundle is a single file, dense.faiss, and it is the one the
# logs keep dying on. Eight parallel workers split a congested link eight ways,
# which makes every individual transfer slower and therefore likelier to trip
# the read timeout, and any one of them failing aborts the whole snapshot. Going
# sequential gives the large file the entire pipe and means a stall costs one
# transfer rather than eight. Nothing here is latency bound, so there is no
# throughput being left on the table.
MAX_WORKERS = 1


def missing_artifacts(strategy_dir: Path) -> list[str]:
    return [name for name in REQUIRED_ARTIFACTS if not (strategy_dir / name).is_file()]


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-id", default=os.environ.get("HF_DATASET_REPO") or settings.hf_dataset_repo)
    parser.add_argument("--strategy", default=settings.default_strategy)
    args = parser.parse_args()

    if not args.repo_id:
        raise SystemExit("Set HF_DATASET_REPO in the environment or pass --repo-id")

    strategy_dir = DATA_DIR / args.strategy
    missing = missing_artifacts(strategy_dir)
    if not missing:
        print(f"Index artifacts for '{args.strategy}' already complete at {strategy_dir}, skipping pull")
        return

    if strategy_dir.exists():
        print(
            f"Index at {strategy_dir} is incomplete, missing: {', '.join(missing)}. Downloading the rest.",
            flush=True,
        )

    token = os.environ.get("HF_TOKEN") or settings.hf_token or None
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    # The CDN times out mid-stream often enough to matter, and a bare
    # snapshot_download gives up on the first one. Partial files are kept
    # between attempts, so each retry resumes rather than starting over.
    for attempt in range(1, DOWNLOAD_ATTEMPTS + 1):
        try:
            snapshot_download(
                repo_id=args.repo_id,
                repo_type="dataset",
                token=token,
                local_dir=str(DATA_DIR),
                allow_patterns=[f"{args.strategy}/*"],
                max_workers=MAX_WORKERS,
            )
            break
        except Exception as exc:
            if attempt == DOWNLOAD_ATTEMPTS:
                raise
            wait = min(30, 2**attempt)
            print(
                f"Download attempt {attempt} of {DOWNLOAD_ATTEMPTS} failed "
                f"({type(exc).__name__}: {exc}). Resuming in {wait}s.",
                flush=True,
            )
            time.sleep(wait)

    # Do not let the server start on a bundle that is still short a file. It
    # would only fail later with a less obvious error, and on a restart loop
    # that error is the one someone has to read.
    still_missing = missing_artifacts(strategy_dir)
    if still_missing:
        raise SystemExit(
            f"Download finished but '{args.strategy}' is still missing: {', '.join(still_missing)}"
        )

    print(f"Pulled '{args.strategy}' artifacts from https://huggingface.co/datasets/{args.repo_id} into {DATA_DIR}")


if __name__ == "__main__":
    main()
