#!/usr/bin/env python3
"""
Upload data/ to the open-travel/japan-travel-mcp-data dataset on Hugging Face.

What gets uploaded:
  - data/translations/         (descriptions, names, jp_en, wikipedia)
  - data/hotels/master.json
  - data/prefectures/*.json
  - data/r3/                   (5 source files + r3/translations/)
  - data/glossary/             (build-time glossaries)
  - data/_state/wikidata_attractions.json
  - data/_state/municipalities.json
  - data/_state/municipality_centroids.json
  - data/_state/official_urls.json

What does NOT go to HF (kept in git, or excluded entirely):
  - data/knowledge/taxonomies/  (lightweight reference, kept in git)
  - data/metadata.json          (lightweight, kept in git)
  - data/_logs/                 (run logs, never published)
  - data/_state/scrape_state.json
  - data/_state/r3_translation_batch.json
  - data/_state/r3_parse_failures_*.jsonl
  - data/_state/translation_batch*.json
  - data/hotels/raw/, data/hotels/review/    (intermediates)
  - .DS_Store, .gitkeep

Run:
    python3.11 scrapers/hf/upload_dataset.py            # uploads
    python3.11 scrapers/hf/upload_dataset.py --dry-run  # lists files only

Env (loaded from .env):
    HF_TOKEN          (required, write scope)
    HF_DATASET_REPO   (default: open-travel/japan-travel-mcp-data)
"""
from __future__ import annotations
import argparse
import os
import sys
from pathlib import Path
from typing import Iterable

REPO_DEFAULT = "open-travel/japan-travel-mcp-data"
ROOT = Path(__file__).resolve().parents[2]  # project root
DATA = ROOT / "data"
CARD = ROOT / "scrapers" / "hf" / "dataset_card.md"


def load_env() -> None:
    """Load KEY=VALUE lines from the project .env, ignoring comments."""
    env_file = ROOT / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


# Patterns to skip when walking data/. Glob-style relative to DATA.
#
# Boundary policy (decided 2026-04-27):
#   HF  = bulk runtime + bulk build-time data (anything heavy)
#   git = code + lightweight metadata + operational state + activity logs +
#         contributor-facing review queue (anything readers / contributors
#         actually look at on GitHub)
#
# So:
#   - hotels/raw/        → HF  (29MB, build-only intermediate, no human reads it)
#   - hotels/review/     → git (824KB, "PRs welcome" public review queue)
#   - _logs/             → git (kilobytes, public transparency for scrape runs)
#   - _state/scrape_state.json → git (live operational state, Actions updates it)
#   - _state/translation_batch*.json → git (tiny historical batch IDs)
#   - _state/*.log       → git (bootstrap activity logs, kept for transparency)
IGNORE_GLOBS = [
    "knowledge/**",
    # The git copy of metadata.json keeps built_at=null; a stamped temp copy
    # (built_at + source_commit) is uploaded explicitly in main() instead.
    "metadata.json",
    "_logs/**",
    "_state/scrape_state.json",
    "_state/r3_translation_batch.json",
    "_state/r3_parse_failures_*.jsonl",
    "_state/translation_batch*.json",
    "_state/translation_batch_descriptions.json",
    "_state/translation_batch_multilingual.json",
    "_state/*.log",
    "hotels/review/**",  # public review queue stays in git for contributors
    ".DS_Store",
    "**/.DS_Store",
    "**/.gitkeep",
    ".gitkeep",
]


def is_ignored(path_rel_to_data: Path) -> bool:
    s = path_rel_to_data.as_posix()
    for pat in IGNORE_GLOBS:
        if path_rel_to_data.match(pat) or _glob_match(s, pat):
            return True
    return False


def _glob_match(s: str, pat: str) -> bool:
    """A small fnmatch wrapper that supports `**`."""
    import fnmatch
    # Convert ** to * recursively-ish; fnmatch alone doesn't grok **.
    if "**" in pat:
        # Replace **/ with arbitrary depth; simpler: drop the **/ prefix and
        # match against suffix on every segment.
        suffix = pat.replace("**/", "").replace("**", "*")
        # match if any tail of the path matches
        parts = s.split("/")
        for i in range(len(parts)):
            tail = "/".join(parts[i:])
            if fnmatch.fnmatch(tail, suffix):
                return True
        return False
    return fnmatch.fnmatch(s, pat)


def collect_files() -> list[Path]:
    """Walk data/ and return every file that is NOT ignored."""
    out: list[Path] = []
    for p in sorted(DATA.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(DATA)
        if is_ignored(rel):
            continue
        out.append(p)
    return out


def human_size(n: int) -> str:
    for unit in ["B", "KB", "MB", "GB"]:
        if n < 1024:
            return f"{n:6.1f}{unit}"
        n /= 1024
    return f"{n:6.1f}TB"


def stamp_metadata() -> str | None:
    """Write a stamped copy of metadata.json (built_at + source_commit) to a
    temp file and return its path for upload as `metadata.json` in the repo.
    The git working copy is never touched — it keeps built_at=null so the
    repository never carries a misleading static timestamp. Errors are
    isolated — a stamping failure must not block the data upload."""
    import json
    import subprocess
    import tempfile
    from datetime import datetime, timezone

    meta_path = DATA / "metadata.json"
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        meta["built_at"] = datetime.now(timezone.utc).isoformat()
        try:
            sha = subprocess.check_output(
                ["git", "rev-parse", "--short", "HEAD"], cwd=str(ROOT), text=True
            ).strip()
            if sha:
                meta["source_commit"] = sha
        except Exception:
            pass
        tmp = tempfile.NamedTemporaryFile(
            mode="w", suffix=".metadata.json", delete=False, encoding="utf-8"
        )
        with tmp:
            tmp.write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
        print(f"[upload] stamped metadata.json built_at={meta['built_at']}")
        return tmp.name
    except Exception as e:
        print(f"[upload] WARN could not stamp metadata.json: {e}", file=sys.stderr)
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="list files only, no upload")
    ap.add_argument("--repo", default=None, help="override HF_DATASET_REPO")
    ap.add_argument("--commit-message", default="Initial dataset upload (Phase A2)")
    ap.add_argument("--no-card", action="store_true", help="skip uploading dataset_card.md as README.md")
    args = ap.parse_args()

    load_env()
    repo = args.repo or os.environ.get("HF_DATASET_REPO") or REPO_DEFAULT
    token = os.environ.get("HF_TOKEN")
    if not token and not args.dry_run:
        print("ERROR: HF_TOKEN missing in .env", file=sys.stderr)
        return 2

    files = collect_files()
    total_bytes = sum(p.stat().st_size for p in files)
    print(f"[upload] repo: {repo}")
    print(f"[upload] candidates: {len(files)} files, {human_size(total_bytes)}")

    # Top-level directory breakdown for quick sanity check
    by_top: dict[str, tuple[int, int]] = {}
    for p in files:
        top = p.relative_to(DATA).parts[0]
        n, sz = by_top.get(top, (0, 0))
        by_top[top] = (n + 1, sz + p.stat().st_size)
    print("[upload] breakdown:")
    for top in sorted(by_top):
        n, sz = by_top[top]
        print(f"  {top:20s} {n:4d} files  {human_size(sz)}")

    if args.dry_run:
        print("[upload] DRY RUN — first 30 files:")
        for p in files[:30]:
            print(f"  {p.relative_to(DATA).as_posix():60s} {human_size(p.stat().st_size)}")
        if len(files) > 30:
            print(f"  ... and {len(files) - 30} more")
        return 0

    from huggingface_hub import HfApi, CommitOperationAdd

    api = HfApi(token=token)

    # Make sure the repo exists (it should — we created it via UI)
    try:
        api.repo_info(repo_id=repo, repo_type="dataset")
    except Exception as e:
        print(f"ERROR: dataset repo {repo} not accessible: {e}", file=sys.stderr)
        return 3

    # Stamp the distributed metadata with an honest build timestamp. The git
    # copy is in IGNORE_GLOBS (kept built_at=null); the stamped temp copy is
    # what ships on the dataset so consumers can read the snapshot version
    # without visiting the code repository.
    stamped_metadata = stamp_metadata()

    # Build operations: each data/<path> → <path> in repo, plus README.md
    ops = []
    if stamped_metadata:
        ops.append(
            CommitOperationAdd(
                path_in_repo="metadata.json",
                path_or_fileobj=stamped_metadata,
            )
        )
    for p in files:
        rel = p.relative_to(DATA).as_posix()
        ops.append(
            CommitOperationAdd(
                path_in_repo=rel,
                path_or_fileobj=str(p),
            )
        )
    if not args.no_card and CARD.exists():
        ops.append(
            CommitOperationAdd(
                path_in_repo="README.md",
                path_or_fileobj=str(CARD),
            )
        )
        print(f"[upload] including dataset card: {CARD.relative_to(ROOT)}")

    print(f"[upload] uploading {len(ops)} files...")
    api.create_commit(
        repo_id=repo,
        repo_type="dataset",
        operations=ops,
        commit_message=args.commit_message,
    )
    print(f"[upload] done — see https://huggingface.co/datasets/{repo}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
