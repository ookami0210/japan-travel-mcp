#!/usr/bin/env python3
"""Upload the dataset card README.md AND the coverage_chart.png it references."""
from __future__ import annotations
import os, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def load_env() -> None:
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s: continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    load_env()
    repo = os.environ.get("HF_DATASET_REPO", "open-travel/japan-travel-mcp-data")
    token = os.environ.get("HF_TOKEN")
    if not token: print("ERR: HF_TOKEN missing", file=sys.stderr); return 2
    from huggingface_hub import HfApi, CommitOperationAdd
    api = HfApi(token=token)
    api.create_commit(
        repo_id=repo, repo_type="dataset",
        commit_message="Dataset card: add per-prefecture coverage chart",
        operations=[
            CommitOperationAdd(path_in_repo="README.md",
                               path_or_fileobj=str(ROOT / "scrapers/hf/dataset_card.md")),
            CommitOperationAdd(path_in_repo="coverage_chart.png",
                               path_or_fileobj=str(ROOT / "data/hf_card_assets/coverage_chart.png")),
        ],
    )
    print(f"Updated → https://huggingface.co/datasets/{repo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
