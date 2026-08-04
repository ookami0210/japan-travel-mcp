#!/usr/bin/env python3
"""
Freshness audit — detects "the workflow is green but the data stopped moving".

Batch conclusions alone cannot be trusted: a fetcher can crash behind
continue-on-error, a picker can loop on the same slice, or an upload can
ship a zero-byte file, all while every run stays green. The published
dataset itself is the only honest signal, so this audit reads per-file
last-commit dates from the Hugging Face tree API and compares them against
each source's declared cadence (plus a minimum-size floor for truncated /
empty uploads).

Run (read-only, no token needed while the dataset is public):
    python3 scrapers/quality/freshness_audit.py
    python3 scrapers/quality/freshness_audit.py --json   # machine-readable

Exit codes: 0 = all fresh, 1 = violations found, 2 = audit itself failed.
Set SLACK_WEBHOOK_URL to post a summary when violations are found.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

HF_REPO = os.environ.get("HF_DATASET_REPO", "open-travel/japan-travel-mcp-data")
TREE_BASE = f"https://huggingface.co/api/datasets/{HF_REPO}/tree/main"

# Monitored files: glob (relative to dataset root) → (max_age_days, min_bytes).
# max_age_days is the declared cadence plus a grace margin so a single late
# run does not page anyone; min_bytes catches empty/truncated uploads.
# Directories scanned are derived from the globs below.
RULES: list[tuple[str, int, int]] = [
    # R3 weekly rotation (Mon/Tue/Wed/Thu) — a healthy file is ≤7 days old.
    ("r3/maff_gi.json", 10, 10_000),
    ("r3/meti_densan.json", 10, 10_000),
    ("r3/japan_heritage.json", 10, 100_000),
    ("r3/bunka_intangible.json", 10, 10_000),
    ("r3/unesco_japan.json", 10, 5_000),
    # Monthly sources (wd-foundation 1st-of-month / dmo-refresh 1st+15th).
    ("r3/dmo.json", 40, 50_000),
    ("r3/west_goldenroute.json", 40, 50_000),
    ("r3/hito_yu_kai.json", 40, 10_000),
    ("r3/koyasan_shukubo.json", 40, 10_000),
    ("r3/kyoto_sect_shukubo.json", 40, 1_000),
    ("r3/translations/r3_translations.jsonl", 40, 100_000),
    # Municipal scrape — 30-day SLA + grace.
    ("prefectures/*.json", 40, 10_000),
    # Monthly foundation outputs.
    ("hotels/master.json", 40, 1_000_000),
    ("_state/wikidata_attractions.json", 40, 1_000_000),
    ("_state/municipalities.json", 40, 100_000),
    ("_state/wikidata_descriptions.json", 40, 100_000),
    ("_state/wikipedia_ja_summaries.json", 40, 100_000),
    ("_state/wikipedia_en_summaries.json", 40, 100_000),
    # Translations (chained after wd-foundation) + weekly embeddings.
    ("translations/descriptions_complete.jsonl", 40, 1_000_000),
    ("translations/multilingual_complete.jsonl", 40, 1_000_000),
    ("embeddings/spots.f16.bin", 14, 10_000_000),
    ("embeddings/spots.index.json", 14, 10_000_000),
]


def dirs_to_scan() -> list[str]:
    out: set[str] = set()
    for glob, _, _ in RULES:
        out.add(glob.rsplit("/", 1)[0])
    return sorted(out)


def fetch_tree(path: str) -> list[dict]:
    url = f"{TREE_BASE}/{path}?expand=true"
    req = urllib.request.Request(
        url, headers={"User-Agent": "japan-travel-mcp-freshness-audit/1.0"}
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def audit() -> list[dict]:
    now = datetime.now(timezone.utc)
    files: dict[str, tuple[int, str | None]] = {}
    for d in dirs_to_scan():
        try:
            for it in fetch_tree(d):
                if it.get("type") != "file":
                    continue
                date = (it.get("lastCommit") or {}).get("date")
                files[it["path"]] = (it.get("size", 0), date)
        except Exception as exc:  # noqa: BLE001 — record and keep scanning
            files[f"{d}/(scan-error)"] = (0, None)
            print(f"[audit] WARN cannot scan {d}: {exc}", file=sys.stderr)

    violations: list[dict] = []
    for glob, max_age, min_bytes in RULES:
        matched = {p: v for p, v in files.items() if fnmatch.fnmatch(p, glob)}
        if not matched:
            violations.append(
                {"path": glob, "problem": "missing", "detail": "no file matches on HF"}
            )
            continue
        for path, (size, date) in sorted(matched.items()):
            if size < min_bytes:
                violations.append(
                    {
                        "path": path,
                        "problem": "too_small",
                        "detail": f"{size}B < floor {min_bytes}B (empty/truncated upload?)",
                    }
                )
            if date is None:
                violations.append(
                    {"path": path, "problem": "no_date", "detail": "lastCommit missing"}
                )
                continue
            age = (now - datetime.fromisoformat(date.replace("Z", "+00:00"))).days
            if age > max_age:
                violations.append(
                    {
                        "path": path,
                        "problem": "stale",
                        "detail": f"{age}d old (cadence allows {max_age}d)",
                    }
                )
    return violations


def post_slack(violations: list[dict]) -> None:
    webhook = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook:
        return
    stale = [v for v in violations if v["problem"] == "stale"]
    other = [v for v in violations if v["problem"] != "stale"]
    lines = [f"🚨 dataset freshness audit: {len(violations)} violation(s)"]
    # Collapse per-prefecture noise into one line so the alert stays readable.
    stale_prefs = [v for v in stale if v["path"].startswith("prefectures/")]
    for v in stale[:8]:
        if v in stale_prefs and v is not stale_prefs[0]:
            continue
        label = (
            f"prefectures/*: {len(stale_prefs)} files stale (e.g. {stale_prefs[0]['detail']})"
            if v in stale_prefs
            else f"{v['path']}: {v['detail']}"
        )
        lines.append(f"• {label}")
    for v in other[:8]:
        lines.append(f"• {v['path']}: {v['problem']} — {v['detail']}")
    body = json.dumps({"text": "\n".join(lines)}).encode()
    req = urllib.request.Request(
        webhook, data=body, headers={"Content-Type": "application/json"}
    )
    try:
        urllib.request.urlopen(req, timeout=30)
    except Exception as exc:  # noqa: BLE001 — alerting must not fail the audit
        print(f"[audit] WARN slack post failed: {exc}", file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true", help="print JSON report")
    args = ap.parse_args()

    try:
        violations = audit()
    except Exception as exc:  # noqa: BLE001
        print(f"[audit] FATAL: {exc}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps({"repo": HF_REPO, "violations": violations}, indent=2))
    else:
        if not violations:
            print(f"[audit] OK — every monitored file on {HF_REPO} is within cadence")
        for v in violations:
            print(f"[audit] {v['problem'].upper():10s} {v['path']} — {v['detail']}")

    if violations:
        post_slack(violations)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
