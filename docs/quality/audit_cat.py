#!/usr/bin/env python3
"""
Scan all v3.multijudge.jsonl scored result files for any case that hit
Cat (safety_pass=false OR hallucination_pass=false). Lists each Cat-hit
case with the iter label, the query, and the per-judge reasoning so we
can engineer a CLI-side guard rather than relying on judge interpretation.

Usage:
  python3.11 docs/quality/audit_cat.py
  python3.11 docs/quality/audit_cat.py --include-420
"""
from __future__ import annotations

import argparse
import glob
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
CALLS_PATH = REPO / "docs" / "quality" / "test_calls.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--include-420", action="store_true",
                        help="also scan 420q (random launch judgment) files")
    args = parser.parse_args()

    calls = {c["id"]: c for c in json.loads(CALLS_PATH.read_text())}

    scored_dir = REPO / "docs" / "quality"
    cat_hits: list[tuple[str, str, dict]] = []  # (label, case_id, scored_row)
    for fp in sorted(scored_dir.glob("test_results_scored.*.v3.multijudge.jsonl")):
        if "r2random-420" in fp.name and not args.include_420:
            continue
        label = fp.name.replace("test_results_scored.", "").replace(".v3.multijudge.jsonl", "")
        for line in fp.read_text().splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            safe = bool(r.get("safety_pass"))
            hall = bool(r.get("hallucination_pass"))
            if not (safe and hall):
                cat_hits.append((label, r["id"], r))

    print(f"Total Cat hits across {len(list(scored_dir.glob('test_results_scored.*.v3.multijudge.jsonl')))} iter results: {len(cat_hits)}")
    print()

    # Group by case_id to see persistent failures
    by_case: dict[str, list[tuple[str, dict]]] = {}
    for label, cid, r in cat_hits:
        by_case.setdefault(cid, []).append((label, r))

    print(f"Cases with Cat hits ({len(by_case)} unique):")
    for cid in sorted(by_case, key=lambda x: -len(by_case[x])):
        hits = by_case[cid]
        cd = calls.get(cid, {})
        print(f"\n  {cid}: {len(hits)} hit(s)  topic={cd.get('topic', '')[:35]}")
        print(f"    query: {cd.get('query', '')[:120]}")
        print(f"    tool: {cd.get('tool')} args={cd.get('args')}")
        for label, r in hits:
            safe = r.get("safety_pass")
            hall = r.get("hallucination_pass")
            print(f"      {label[:40]:40s}  safety={safe} halluc={hall}")

    # Also dump per-judge reasoning for the most recent hit per case
    print("\n\nPer-judge reasoning for most recent Cat hit per case:\n")
    for cid in sorted(by_case, key=lambda x: -len(by_case[x])):
        latest = by_case[cid][-1]
        label = latest[0]
        # find raw judge files
        for jdir_glob in [
            f"{label}_100case/batch_*_judge*_scored.jsonl",
            f"{label}_100case_j2/batch_*_scored.jsonl",
            f"{label}_100case_j3/batch_*_scored.jsonl",
        ]:
            for fp in sorted((REPO / "docs" / "quality" / "judge_v3_batches").glob(jdir_glob)):
                jname = "j1" if "judge1" in fp.name else (
                    "j2" if ("judge2" in fp.name or "_j2" in str(fp)) else (
                    "j3" if ("judge3" in fp.name or "_j3" in str(fp)) else "?"
                    )
                )
                for line in fp.read_text().splitlines():
                    if not line.strip():
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if r.get("id") == cid:
                        safe = r.get("safety_pass")
                        hall = r.get("hallucination_pass")
                        if not (safe and hall):
                            print(f"  [{cid}] {label[:35]:35s} {jname}: safe={safe} hall={hall}")
                            print(f"     reasoning: {(r.get('reasoning') or '')[:300]}")
                            print(f"     wrong_data: {(r.get('wrong_data') or '')[:200]}")
                            print()
                        break


if __name__ == "__main__":
    main()
