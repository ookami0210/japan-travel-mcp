#!/usr/bin/env python3
"""Multi-judge median for v4-data scoring (mirrors aggregate_v3_multijudge.py)."""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

DIMS = [
    "data_completeness",
    "data_accuracy",
    "schema_conformance",
    "recall_of_known",
    "prominence_ranking",
    "traceability",
    "structured_metadata",
]

WEIGHTS = {
    "data_completeness": 0.25,
    "data_accuracy": 0.25,
    "recall_of_known": 0.20,
    "prominence_ranking": 0.10,
    "schema_conformance": 0.10,
    "traceability": 0.05,
    "structured_metadata": 0.05,
}


def parse_jsonl_block(text: str) -> list[dict]:
    m = re.search(r"```(?:jsonl)?\s*\n(.*?)\n```", text, re.S)
    body = m.group(1) if m else text
    out = []
    for line in body.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            pass
    return out


def kpis(rows):
    sat = sum(1 for r in rows if sum(WEIGHTS.get(d, 0) * r.get(d, 0) for d in WEIGHTS) >= 4.0)
    avg = lambda r: sum(r.get(d, 0) for d in DIMS) / len(DIMS)
    mn = sum(1 for r in rows if r.get("safety_pass") and r.get("hallucination_pass") and avg(r) >= 3.0)
    cat = sum(1 for r in rows if not r.get("safety_pass") or not r.get("hallucination_pass"))
    return sat, mn, cat


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    args = parser.parse_args()

    batch_dir = REPO / "docs" / "quality" / "judge_v4data_batches" / f"{args.label}_100case"
    if not batch_dir.exists():
        sys.exit(f"missing {batch_dir}")

    judge_files = {}
    for f in batch_dir.glob("batch_*_judge*_scored.jsonl"):
        m = re.match(r"batch_\d+_judge(\d+)_scored\.jsonl", f.name)
        if m:
            judge_files.setdefault(int(m.group(1)), []).append(f)
    if not judge_files:
        sys.exit("no judge files found")

    judges = {}
    for j, files in judge_files.items():
        by_id = {}
        for f in sorted(files):
            for r in parse_jsonl_block(f.read_text()):
                if "id" in r:
                    by_id[r["id"]] = r
        judges[j] = by_id
        print(f"  judge {j}: {len(by_id)} rows")

    all_ids = set()
    for by_id in judges.values():
        all_ids.update(by_id.keys())

    merged = []
    for case_id in sorted(all_ids):
        votes = [judges[j][case_id] for j in judges if case_id in judges[j]]
        if len(votes) < len(judges):
            continue
        row = {"id": case_id, "_judges_voted": len(votes)}
        for d in DIMS:
            vals = [v.get(d) for v in votes if isinstance(v.get(d), (int, float))]
            if vals:
                row[d] = statistics.median(vals)
        for d in ("safety_pass", "hallucination_pass"):
            vals = [v.get(d) for v in votes if isinstance(v.get(d), bool)]
            if vals:
                row[d] = all(vals)
        merged.append(row)

    out = REPO / "docs" / "quality" / f"test_results_scored.{args.label}.v4data.multijudge.jsonl"
    out.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in merged) + "\n")
    print(f"  wrote {out}")

    sat, mn, cat = kpis(merged)
    n = len(merged)
    print(f"\n  KPI (v4-data median): Sat={sat}/{n} ({sat / max(1, n) * 100:.0f}%) | Min={mn}/{n} ({mn / max(1, n) * 100:.0f}%) | Cat={cat}/{n} ({cat / max(1, n) * 100:.0f}%)")
    for j, by_id in sorted(judges.items()):
        s, m, c = kpis(list(by_id.values()))
        print(f"  KPI (judge {j} solo): Sat={s} | Min={m} | Cat={c}")


if __name__ == "__main__":
    main()
