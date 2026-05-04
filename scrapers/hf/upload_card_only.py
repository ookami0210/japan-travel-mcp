#!/usr/bin/env python3
"""Upload ONLY the dataset card (README.md) to HF — used after card edits."""
from __future__ import annotations
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / "scrapers" / "hf" / "dataset_card.md"


def load_env() -> None:
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_env()
    repo = os.environ.get("HF_DATASET_REPO", "open-travel/japan-travel-mcp-data")
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("ERROR: HF_TOKEN missing", file=sys.stderr)
        return 2
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    api.upload_file(
        path_or_fileobj=str(CARD),
        path_in_repo="README.md",
        repo_id=repo,
        repo_type="dataset",
        commit_message="Dataset card: English-first authority names",
    )
    print(f"Updated dataset card → https://huggingface.co/datasets/{repo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
