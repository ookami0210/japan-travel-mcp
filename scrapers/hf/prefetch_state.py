#!/usr/bin/env python3
"""
Pull operational state files from the Hugging Face dataset before a scrape.

Why this exists:
    The data/_state/*.json + data/r3/*.json + data/prefectures/*.json files
    are gitignored (they are bulk runtime data, canonically stored on the
    HF dataset). A fresh CI runner does not have them. Every scrape workflow
    that consumes these files MUST call this helper before running its
    orchestrator, otherwise the orchestrator crashes at startup.

Behaviour:
    Each requested path is downloaded from the configured HF dataset repo
    and copied into the local data/ tree. A missing file logs a warning
    and continues — the scraper is responsible for graceful handling of
    absent inputs (e.g. loadState() returns a fresh state when scrape_state.json
    does not exist).

Env:
    HF_TOKEN         (optional, only required for private datasets)
    HF_DATASET_REPO  (default: open-travel/japan-travel-mcp-data)

CLI:
    python3 scrapers/hf/prefetch_state.py \
        --files _state/municipalities.json _state/official_urls.json

    python3 scrapers/hf/prefetch_state.py --preset steady
    python3 scrapers/hf/prefetch_state.py --preset wd-foundation
    python3 scrapers/hf/prefetch_state.py --preset embeddings
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

# Presets group the prefetch lists per workflow so each yml stays terse.
PRESETS: dict[str, list[str]] = {
    # steady-scrape.yml (MUNI + chained R3). Picker reads municipalities +
    # official URLs + centroids; daily.ts state is rebuilt from per-muni
    # records but loadState() prefers an existing scrape_state.json so
    # the picker reflects yesterday's progress.
    "steady": [
        "_state/municipalities.json",
        "_state/official_urls.json",
        "_state/municipality_centroids.json",
        "_state/tourism_org_urls.json",
        "_state/wikidata_attractions.json",
        "_state/scrape_state.json",
    ],
    # dmo-refresh.yml — DMO discover + scrape inputs.
    "dmo": [
        "_state/municipalities.json",
        "_state/official_urls.json",
        "_state/dmo_seed_urls.json",
        "_state/dmo_website_overrides.json",
    ],
    # wd-foundation.yml — all upstream Wikidata/OSM/Wikipedia legs read
    # municipalities + the master Wikidata attractions corpus.
    "wd-foundation": [
        "_state/municipalities.json",
        "_state/municipality_centroids.json",
        "_state/official_urls.json",
        "_state/wikidata_attractions.json",
    ],
    # embeddings-rebuild.yml — full corpus rebuild needs the entire
    # per-prefecture set + R3 sources to compose the embedding source.
    "embeddings": [
        "_state/municipalities.json",
        "_state/wikidata_attractions.json",
        "_state/scrape_state.json",
        "r3/maff_gi.json",
        "r3/meti_densan.json",
        "r3/japan_heritage.json",
        "r3/bunka_intangible.json",
        "r3/unesco_japan.json",
    ],
    # burst-scrape.yml — same as steady, kept here for shared invocation.
    "burst": [
        "_state/municipalities.json",
        "_state/official_urls.json",
        "_state/municipality_centroids.json",
        "_state/tourism_org_urls.json",
        "_state/wikidata_attractions.json",
        "_state/scrape_state.json",
    ],
}

# The 47 prefecture file slugs. Embeddings-rebuild and burst with
# `--prefectures` pull these too.
PREFECTURE_SLUGS: list[str] = [
    "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima",
    "ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa",
    "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano", "gifu",
    "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara",
    "wakayama", "tottori", "shimane", "okayama", "hiroshima", "yamaguchi",
    "tokushima", "kagawa", "ehime", "kochi", "fukuoka", "saga", "nagasaki",
    "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
]


def prefetch(files: list[str], repo: str, token: str | None, dest_root: Path) -> tuple[int, int]:
    """Download each `files` entry from the HF dataset into `dest_root/<file>`.

    Returns (ok, miss).
    """
    from huggingface_hub import hf_hub_download

    ok, miss = 0, 0
    for rel in files:
        try:
            src = hf_hub_download(
                repo_id=repo,
                filename=rel,
                repo_type="dataset",
                token=token,
            )
        except Exception as exc:
            print(f"[prefetch] miss {rel}: {exc}", file=sys.stderr)
            miss += 1
            continue
        dst = dest_root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dst)
        print(f"[prefetch] OK   {rel}")
        ok += 1
    return ok, miss


def main() -> int:
    parser = argparse.ArgumentParser(description="Prefetch HF dataset files into data/")
    parser.add_argument(
        "--preset",
        choices=sorted(PRESETS.keys()),
        help="Named bundle of files to fetch.",
    )
    parser.add_argument(
        "--files",
        nargs="+",
        default=[],
        help="Additional explicit file paths (relative to dataset root, e.g. r3/maff_gi.json).",
    )
    parser.add_argument(
        "--prefectures",
        action="store_true",
        help="Also pull all 47 prefectures/<slug>.json files.",
    )
    args = parser.parse_args()

    repo = os.environ.get("HF_DATASET_REPO", "open-travel/japan-travel-mcp-data")
    token = os.environ.get("HF_TOKEN") or None
    root = Path(__file__).resolve().parents[2] / "data"

    files: list[str] = []
    if args.preset:
        files.extend(PRESETS[args.preset])
    files.extend(args.files)
    if args.prefectures:
        files.extend(f"prefectures/{slug}.json" for slug in PREFECTURE_SLUGS)

    if not files:
        print("[prefetch] no files requested — pass --preset or --files", file=sys.stderr)
        return 2

    # Deduplicate while preserving order.
    seen: set[str] = set()
    dedup: list[str] = []
    for rel in files:
        if rel in seen:
            continue
        seen.add(rel)
        dedup.append(rel)

    print(f"[prefetch] repo={repo} files={len(dedup)} dest={root}")
    ok, miss = prefetch(dedup, repo, token, root)
    print(f"[prefetch] done — {ok} OK, {miss} miss")
    # Missing files are non-fatal: scrapers handle absent inputs at runtime.
    return 0


if __name__ == "__main__":
    sys.exit(main())
