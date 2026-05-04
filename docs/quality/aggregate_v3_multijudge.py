#!/usr/bin/env python3
"""
Aggregate v3 scored batches across MULTIPLE JUDGE RUNS, taking the median
per (case, dimension) to halve the ±10pp judge variance observed in iter1-19.

Why:
  Judge variance on the fixed 100-case test (Sonnet subagent scoring) was
  measured at ±5pp Sat / ±10pp Min in byte-identical re-runs (iter15→16
  comparison). Single-run iter deltas of ±5pp are therefore indistinguishable
  from noise. Two parallel judge runs with median merge halve that variance,
  surfacing the real signal at ~±3pp Sat / ±5pp Min.

Layout:
  Each judge run gets its own batch_<N>_judge<J>_scored.jsonl filename.
  Default: J=1 and J=2.
  This script reads ALL batch_*_judge*_scored.jsonl files in the label dir
  and merges by (case_id, dimension).

Caller responsibility (main loop):
  After build_v3_prompts.py creates batch_1..N.txt, spawn 2× the subagents
  (one per batch per judge) and have them each write
  batch_<N>_judge<J>_scored.jsonl.

  E.g. for label=iter54-baseline with 4 batches and 2 judges:
    judge_v3_batches/iter54-baseline_100case/
      batch_1.txt       (prompt)
      batch_1_judge1_scored.jsonl
      batch_1_judge2_scored.jsonl
      batch_2.txt       (prompt)
      batch_2_judge1_scored.jsonl
      batch_2_judge2_scored.jsonl
      ...

Usage:
  python3 docs/quality/aggregate_v3_multijudge.py --label iter54-baseline
"""
from __future__ import annotations

import argparse
import json
import re
import statistics
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

NUMERIC_DIMS = [
    "intent_understanding",
    "groundedness",
    "factual_accuracy",
    "practical_usefulness",
    "constraint_handling",
    "travel_feasibility",
    "specificity",
    "expression_quality",
]

WEIGHTS = {
    "intent_understanding": 0.25,
    "factual_accuracy": 0.25,
    "practical_usefulness": 0.25,
    "specificity": 0.10,
    "groundedness": 0.10,
    "expression_quality": 0.05,
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


def median_or_first(values: list) -> object:
    """For numeric values: median. For booleans: AND. For strings: first."""
    if not values:
        return None
    if all(isinstance(v, bool) for v in values):
        return all(values)  # be conservative on safety/hallucination passes
    if all(isinstance(v, (int, float)) for v in values):
        return statistics.median(values)
    # Strings / categorical: pick first non-empty
    for v in values:
        if v:
            return v
    return values[0]


def kpis(rows: list[dict]) -> tuple[int, int, int]:
    sat = sum(1 for r in rows if sum(WEIGHTS.get(d, 0) * r.get(d, 0) for d in WEIGHTS) >= 4.0)
    avg = lambda r: sum(r.get(d, 0) for d in NUMERIC_DIMS) / len(NUMERIC_DIMS)
    mn = sum(1 for r in rows if r.get("safety_pass") and r.get("hallucination_pass") and avg(r) >= 3.0)
    cat = sum(1 for r in rows if not r.get("safety_pass") or not r.get("hallucination_pass"))
    return sat, mn, cat


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument(
        "--include-single",
        action="store_true",
        help="Include cases scored by only one judge (default: drop them)",
    )
    args = parser.parse_args()

    batch_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}_100case"
    if not batch_dir.exists():
        sys.exit(f"missing batch dir: {batch_dir}")

    judge_files: dict[int, list[Path]] = {}
    for f in batch_dir.glob("batch_*_judge*_scored.jsonl"):
        m = re.match(r"batch_\d+_judge(\d+)_scored\.jsonl", f.name)
        if not m:
            continue
        j = int(m.group(1))
        judge_files.setdefault(j, []).append(f)

    if not judge_files:
        sys.exit(
            f"no batch_*_judge*_scored.jsonl files in {batch_dir}. "
            f"This script expects multi-judge naming. For single-judge, use aggregate_v3.py."
        )

    print(f"  found {len(judge_files)} judges: {sorted(judge_files.keys())}")

    # Load each judge's rows
    judges: dict[int, dict[str, dict]] = {}
    for j, files in judge_files.items():
        by_id = {}
        for f in sorted(files):
            text = f.read_text()
            for r in parse_jsonl_block(text):
                if "id" in r:
                    by_id[r["id"]] = r
        judges[j] = by_id
        print(f"  judge {j}: {len(by_id)} rows from {len(files)} batches")

    all_ids = set()
    for by_id in judges.values():
        all_ids.update(by_id.keys())

    merged: list[dict] = []
    for case_id in sorted(all_ids):
        votes = [judges[j][case_id] for j in judges if case_id in judges[j]]
        if not args.include_single and len(votes) < len(judges):
            continue
        merged_row = {"id": case_id, "_judges_voted": len(votes)}
        # Numeric dims: median
        for d in NUMERIC_DIMS:
            vals = [v.get(d) for v in votes if isinstance(v.get(d), (int, float))]
            if vals:
                merged_row[d] = statistics.median(vals)
        # Pass/fail: AND (conservative)
        for d in ("safety_pass", "hallucination_pass"):
            vals = [v.get(d) for v in votes if isinstance(v.get(d), bool)]
            if vals:
                merged_row[d] = all(vals)
        # Categorical / strings: most common, fall back to first
        for d in ("failure_category", "_tool"):
            vals = [v.get(d) for v in votes if v.get(d)]
            if vals:
                from collections import Counter
                merged_row[d] = Counter(vals).most_common(1)[0][0]
        merged.append(merged_row)

    out_path = REPO / "docs" / "quality" / f"test_results_scored.{args.label}.v3.multijudge.jsonl"
    out_path.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in merged) + "\n")
    print(f"\n  wrote {out_path} ({len(merged)} rows)")

    sat, mn, cat = kpis(merged)
    n = len(merged)
    print(f"\n  KPI (multi-judge median): Sat={sat}/{n} ({sat / max(1, n) * 100:.0f}%) | Min={mn}/{n} ({mn / max(1, n) * 100:.0f}%) | Cat={cat}/{n} ({cat / max(1, n) * 100:.0f}%)")
    # Compare each judge's solo KPIs
    for j, by_id in sorted(judges.items()):
        rows = list(by_id.values())
        s, m, c = kpis(rows)
        print(f"  KPI (judge {j} solo, {len(rows)} rows):  Sat={s}/{len(rows)} ({s / max(1, len(rows)) * 100:.0f}%) | Min={m}/{len(rows)} ({m / max(1, len(rows)) * 100:.0f}%) | Cat={c}")


if __name__ == "__main__":
    main()
