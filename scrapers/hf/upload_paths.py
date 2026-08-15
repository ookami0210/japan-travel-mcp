#!/usr/bin/env python3
"""
Targeted Hugging Face dataset upload — specific paths only.

upload_dataset.py syncs the whole data/ tree, which is only safe on a runner
whose entire tree is current. On an operator machine where some directories
are stale, pushing the full tree would regress fresher HF data. This helper
uploads ONLY the given data/-relative paths in one commit.

Usage:
    python3 scrapers/hf/upload_paths.py --commit-message "repair" \
        prefectures/osaka.json prefectures/kyoto.json
    python3 scrapers/hf/upload_paths.py --glob "prefectures/*.json" \
        --commit-message "prefecture corpus repair"

Env: HF_TOKEN (required), HF_DATASET_REPO (default open-travel/japan-travel-mcp-data)
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA = REPO_ROOT / "data"


def load_env() -> None:
    env = REPO_ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="*", help="data/-relative file paths")
    ap.add_argument("--glob", action="append", default=[], help="data/-relative glob(s)")
    ap.add_argument("--commit-message", required=True)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    load_env()
    token = os.environ.get("HF_TOKEN")
    repo = os.environ.get("HF_DATASET_REPO", "open-travel/japan-travel-mcp-data")
    if not token:
        print("[upload_paths] HF_TOKEN not set", file=sys.stderr)
        return 1

    rels: list[Path] = []
    for p in args.paths:
        rels.append(Path(p))
    for g in args.glob:
        rels.extend(sorted(q.relative_to(DATA) for q in DATA.glob(g)))
    rels = sorted(set(rels))
    missing = [r for r in rels if not (DATA / r).is_file()]
    if missing:
        print(f"[upload_paths] missing local files: {missing}", file=sys.stderr)
        return 1
    if not rels:
        print("[upload_paths] nothing to upload", file=sys.stderr)
        return 1

    total = sum((DATA / r).stat().st_size for r in rels)
    print(f"[upload_paths] {len(rels)} files, {total / 1e6:.1f} MB → {repo}")
    for r in rels:
        print(f"  {r}")
    if args.dry_run:
        print("[upload_paths] dry-run — no upload")
        return 0

    from huggingface_hub import CommitOperationAdd, HfApi

    api = HfApi(token=token)
    ops = [
        CommitOperationAdd(path_in_repo=str(r), path_or_fileobj=str(DATA / r))
        for r in rels
    ]
    api.create_commit(
        repo_id=repo,
        repo_type="dataset",
        operations=ops,
        commit_message=args.commit_message,
    )
    print("[upload_paths] done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
