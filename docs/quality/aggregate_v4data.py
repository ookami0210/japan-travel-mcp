#!/usr/bin/env python3
"""
Aggregate v4-data scored batches into a single JSONL + summary report.

Pipeline (mirrors aggregate_v3.py):
  1. Read judge_v4data_batches/<label>_100case/batch_*_scored.jsonl
  2. Concat into test_results_scored.<label>.v4data.jsonl
  3. Compute v4-data KPIs (data-Sat, data-Min, data-Cat) + dimension averages
  4. Write SCORING_REPORT.<label>.v4data.md

Run:
  python3 docs/quality/aggregate_v4data.py --label iter54-baseline
"""
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
    """Subagents wrap output in ```jsonl ... ```. Tolerant parser."""
    m = re.search(r"```(?:jsonl)?\s*\n(.*?)\n```", text, re.S)
    if m:
        body = m.group(1)
    else:
        body = text
    out = []
    for line in body.splitlines():
        line = line.strip()
        if not line or not line.startswith("{"):
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError as e:
            print(f"  WARN: skipped malformed line: {e}: {line[:120]}")
    return out


def kpis(rows: list[dict]) -> tuple[int, int, int]:
    sat = 0
    mn = 0
    cat = 0
    for r in rows:
        weighted = sum(WEIGHTS.get(d, 0) * r.get(d, 0) for d in WEIGHTS)
        avg = sum(r.get(d, 0) for d in DIMS) / len(DIMS)
        safe = bool(r.get("safety_pass", False))
        halluc = bool(r.get("hallucination_pass", False))
        if not safe or not halluc:
            cat += 1
        if weighted >= 4.0:
            sat += 1
        if safe and halluc and avg >= 3.0:
            mn += 1
    return sat, mn, cat


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    args = parser.parse_args()

    batch_dir = REPO / "docs" / "quality" / "judge_v4data_batches" / f"{args.label}_100case"
    if not batch_dir.exists():
        sys.exit(f"missing batch dir: {batch_dir}")

    batches = sorted(batch_dir.glob("batch_*_scored.jsonl"))
    if not batches:
        sys.exit(f"no scored batches in {batch_dir}")

    rows: list[dict] = []
    for b in batches:
        text = b.read_text()
        parsed = parse_jsonl_block(text)
        rows.extend(parsed)
        print(f"  {b.name}: {len(parsed)} rows")

    out_jsonl = REPO / "docs" / "quality" / f"test_results_scored.{args.label}.v4data.jsonl"
    out_jsonl.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
    print(f"wrote {out_jsonl} ({len(rows)} rows)")

    sat, mn, cat = kpis(rows)
    n = len(rows)

    # Dimension averages
    dim_means = {d: statistics.mean(r.get(d, 0) for r in rows) for d in DIMS}

    # Top failures
    by_fail = sorted(rows, key=lambda r: sum(WEIGHTS.get(d, 0) * r.get(d, 0) for d in WEIGHTS))[:15]
    fail_lines = []
    for r in by_fail:
        weighted = sum(WEIGHTS.get(d, 0) * r.get(d, 0) for d in WEIGHTS)
        miss = r.get("missing_entities", "")
        wrong = r.get("wrong_facts", "")
        hint = r.get("improvement_hint", "")
        fail_lines.append(
            f"- **{r.get('id','?')}** sat={weighted:.2f} | missing: {miss} | wrong: {wrong} | hint: {hint}"
        )

    report = REPO / "docs" / "quality" / f"SCORING_REPORT.{args.label}.v4data.md"
    report.write_text(
        f"# v4-data Scoring Report — {args.label}\n\n"
        f"**Cases scored**: {n}\n\n"
        f"## KPIs (data-layer)\n\n"
        f"| KPI | Count | % |\n"
        f"|:---|---:|---:|\n"
        f"| Satisfaction (weighted ≥ 4.0)   | {sat} | {sat / n * 100:.0f}% |\n"
        f"| Minimum Acceptable (avg ≥ 3.0 + safe) | {mn} | {mn / n * 100:.0f}% |\n"
        f"| Catastrophic (NOT safe)          | {cat} | {cat / n * 100:.0f}% |\n\n"
        f"## Dimension averages (0–5)\n\n"
        + "| Dimension | Avg | Weight |\n|:---|---:|---:|\n"
        + "\n".join(
            f"| {d} | {dim_means[d]:.2f} | {WEIGHTS.get(d, 0):.2f} |"
            for d in DIMS
        )
        + "\n\n"
        f"## Bottom 15 cases (by weighted satisfaction)\n\n"
        + "\n".join(fail_lines)
        + "\n"
    )
    print(f"wrote {report}")
    print(f"\nKPI: Sat={sat}/{n} ({sat / n * 100:.0f}%) | Min={mn}/{n} ({mn / n * 100:.0f}%) | Cat={cat}/{n} ({cat / n * 100:.0f}%)")


if __name__ == "__main__":
    main()
