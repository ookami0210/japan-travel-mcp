#!/usr/bin/env python3
"""
Aggregate v3 (Tourism Agent Evaluation Scorecard) scored batches into a
single scored.jsonl + a markdown report with the three KPIs:

  - Satisfaction Accuracy = % of cases with weighted_satisfaction_score >= 4.0
  - Minimum Acceptable Accuracy = % of cases with safety_pass + hallucination_pass + avg_score >= 3.0
  - Catastrophic Error Rate = % of cases with safety_pass=false OR hallucination_pass=false

Plus per-dimension distribution, per-tool breakdown, per-failure-category breakdown.

Usage:
  python3 docs/quality/aggregate_v3.py --label deep-scrape
  python3 docs/quality/aggregate_v3.py --new-tools --label deep-scrape
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# Satisfaction score weights (confirmed 2026-05-02)
SATISFACTION_WEIGHTS = {
    "intent_understanding": 0.25,
    "factual_accuracy": 0.25,
    "practical_usefulness": 0.25,
    "specificity": 0.10,
    "groundedness": 0.10,
    "expression_quality": 0.05,
}

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

FAILURE_CATEGORIES = {
    "A": "Retrieval Failure (needed data not fetched)",
    "B": "Ranking Failure (buried below noise)",
    "C": "Reasoning Failure (synthesised wrong)",
    "D": "Grounding Failure (made up content)",
    "E": "Practicality Failure (correct but unusable)",
    "F": "Constraint Failure (ignored explicit constraints)",
    "G": "Coverage Failure (too few options)",
    "H": "Safety / Cultural Failure",
}


def parse_jsonl_block(text: str) -> list[dict]:
    """Parse a ```jsonl ...``` block (or naked JSONL) from a subagent's text output."""
    # Try to find a fenced jsonl/json code block first
    m = re.search(r"```(?:jsonl|json)?\s*\n([\s\S]*?)\n```", text)
    if m:
        body = m.group(1)
    else:
        body = text
    out = []
    for line in body.splitlines():
        line = line.strip()
        if not line:
            continue
        # Skip non-JSON noise
        if not line.startswith("{"):
            continue
        try:
            out.append(json.loads(line))
        except Exception:
            # Maybe trailing comma or partial line; try to extract first {...}
            m2 = re.search(r"\{[\s\S]*\}", line)
            if m2:
                try:
                    out.append(json.loads(m2.group(0)))
                except Exception:
                    pass
    return out


def satisfaction_score(rec: dict) -> float:
    """Weighted satisfaction score (0-5)."""
    s = 0.0
    for dim, w in SATISFACTION_WEIGHTS.items():
        v = rec.get(dim)
        if isinstance(v, (int, float)):
            s += w * v
    return s


def avg_numeric(rec: dict) -> float:
    """Unweighted average of all numeric dims (0-5)."""
    vals = [rec.get(d) for d in NUMERIC_DIMS if isinstance(rec.get(d), (int, float))]
    if not vals:
        return 0.0
    return sum(vals) / len(vals)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-tools", action="store_true")
    parser.add_argument("--label", default="deep-scrape")
    args = parser.parse_args()

    suffix = "_new_tools" if args.new_tools else "_100case"
    batch_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}{suffix}"
    if not batch_dir.exists():
        sys.exit(f"missing batch dir: {batch_dir}")

    # Load test_results for tool/topic enrichment
    if args.new_tools:
        results_path = REPO / "docs" / "quality" / "test_results_new_tools.jsonl"
    else:
        results_path = REPO / "docs" / "quality" / "test_results.jsonl"
    test_results = {}
    for line in results_path.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        test_results[r["id"]] = r

    # Read each batch's scored output (subagent must write to batch_<n>_scored.jsonl)
    scored_records: list[dict] = []
    for batch_path in sorted(batch_dir.glob("batch_*_scored.jsonl")):
        records = []
        for line in batch_path.read_text().splitlines():
            line = line.strip()
            if not line or not line.startswith("{"):
                continue
            try:
                records.append(json.loads(line))
            except Exception:
                continue
        if not records:
            # Fallback: try parsing the raw batch_<n>_scored.txt format (subagent dumped text)
            txt_path = batch_path.with_suffix(".txt")
            if txt_path.exists():
                records = parse_jsonl_block(txt_path.read_text())
        scored_records.extend(records)

    if not scored_records:
        sys.exit(f"no scored records found in {batch_dir}")

    # Enrich with tool/topic from test_results
    for rec in scored_records:
        # Subagent prompts asked for "case_id" so handle both forms
        cid = rec.get("id") or rec.get("case_id")
        if "id" not in rec and cid:
            rec["id"] = cid
        tr = test_results.get(cid, {})
        rec["_tool"] = tr.get("tool", "?")
        rec["_topic"] = tr.get("topic", "?")
        rec["_query"] = tr.get("query", "")
        rec["_satisfaction_score"] = round(satisfaction_score(rec), 3)
        rec["_avg_numeric"] = round(avg_numeric(rec), 3)

    # Write scored.jsonl
    out_path = REPO / "docs" / "quality" / f"test_results_scored.{args.label}.v3{suffix.replace('_100case','')}.jsonl"
    with out_path.open("w", encoding="utf-8") as f:
        for rec in scored_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")

    # Compute KPIs
    n = len(scored_records)
    satisfaction_count = sum(1 for r in scored_records if r["_satisfaction_score"] >= 4.0)
    min_acceptable_count = sum(
        1 for r in scored_records
        if r.get("safety_pass") and r.get("hallucination_pass") and r["_avg_numeric"] >= 3.0
    )
    catastrophic_count = sum(
        1 for r in scored_records
        if not r.get("safety_pass") or not r.get("hallucination_pass")
    )

    sat_pct = 100.0 * satisfaction_count / n if n else 0
    min_pct = 100.0 * min_acceptable_count / n if n else 0
    cat_pct = 100.0 * catastrophic_count / n if n else 0

    # Per-dimension distribution
    dim_dist: dict = {}
    for d in NUMERIC_DIMS:
        vals = [r.get(d) for r in scored_records if isinstance(r.get(d), (int, float))]
        if not vals:
            continue
        dim_dist[d] = {
            "mean": round(sum(vals) / len(vals), 2),
            "n": len(vals),
            "dist": {str(k): sum(1 for v in vals if int(v) == k) for k in range(6)},
        }

    # Per-tool breakdown
    by_tool: dict = defaultdict(lambda: {"n": 0, "sat": 0, "min": 0, "cat": 0, "avg_sum": 0})
    for r in scored_records:
        t = r["_tool"]
        by_tool[t]["n"] += 1
        by_tool[t]["avg_sum"] += r["_avg_numeric"]
        if r["_satisfaction_score"] >= 4.0:
            by_tool[t]["sat"] += 1
        if r.get("safety_pass") and r.get("hallucination_pass") and r["_avg_numeric"] >= 3.0:
            by_tool[t]["min"] += 1
        if not r.get("safety_pass") or not r.get("hallucination_pass"):
            by_tool[t]["cat"] += 1

    # Failure category breakdown
    fail_cat: dict = defaultdict(int)
    for r in scored_records:
        fc = r.get("failure_category")
        if fc:
            fail_cat[fc] += 1

    # Build report
    report_path = REPO / "docs" / "quality" / f"SCORING_REPORT.{args.label}.v3{suffix.replace('_100case','')}.md"
    lines: list[str] = []
    lines.append(f"# Tourism Agent Evaluation Scorecard — {args.label} (v3)")
    lines.append("")
    lines.append(f"Cases: {n}")
    lines.append(f"Test set: {'new-tools (11-case)' if args.new_tools else '100-case'}")
    lines.append("")
    lines.append("## KPIs (confirmed 2026-05-02)")
    lines.append("")
    lines.append(f"- **Satisfaction Accuracy**: {satisfaction_count}/{n} = **{sat_pct:.1f}%** (sat. score ≥ 4.0)")
    lines.append(f"- **Minimum Acceptable Accuracy**: {min_acceptable_count}/{n} = **{min_pct:.1f}%** (Safety+Hallucination Pass + avg ≥ 3.0)")
    lines.append(f"- **Catastrophic Error Rate**: {catastrophic_count}/{n} = **{cat_pct:.1f}%** (Safety Fail or Hallucination Fail)")
    lines.append("")
    lines.append("Targets:")
    lines.append("- Satisfaction Accuracy: maximise (50%+ for launch readiness)")
    lines.append("- Minimum Acceptable Accuracy: **target 99.99%**")
    lines.append("- Catastrophic Error Rate: **target 0%**")
    lines.append("")
    lines.append("## Per-dimension distribution (0-5 scale)")
    lines.append("")
    lines.append("| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |")
    lines.append("|:----------|-----:|--:|--:|--:|--:|--:|--:|")
    for d in NUMERIC_DIMS:
        if d not in dim_dist:
            continue
        dist = dim_dist[d]["dist"]
        lines.append(
            f"| {d} | {dim_dist[d]['mean']:.2f} | "
            f"{dist.get('0','0')} | {dist.get('1','0')} | {dist.get('2','0')} | "
            f"{dist.get('3','0')} | {dist.get('4','0')} | {dist.get('5','0')} |"
        )
    lines.append("")
    lines.append("## Per-tool breakdown")
    lines.append("")
    lines.append("| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |")
    lines.append("|:-----|--:|--------------:|----------------:|--------------:|----------:|")
    for tool in sorted(by_tool):
        d = by_tool[tool]
        s_pct = 100 * d["sat"] / d["n"] if d["n"] else 0
        m_pct = 100 * d["min"] / d["n"] if d["n"] else 0
        c_pct = 100 * d["cat"] / d["n"] if d["n"] else 0
        avg = d["avg_sum"] / d["n"] if d["n"] else 0
        lines.append(
            f"| {tool} | {d['n']} | {s_pct:.1f}% | {m_pct:.1f}% | {c_pct:.1f}% | {avg:.2f} |"
        )
    lines.append("")
    lines.append("## Failure Category breakdown")
    lines.append("")
    lines.append("| Category | Description | Count | % |")
    lines.append("|:--------:|:------------|------:|--:|")
    for letter, label in FAILURE_CATEGORIES.items():
        c = fail_cat.get(letter, 0)
        pct = 100 * c / n if n else 0
        lines.append(f"| {letter} | {label} | {c} | {pct:.1f}% |")
    no_fail = n - sum(fail_cat.values())
    lines.append(f"| — | (no failure category, ≥4 across the board) | {no_fail} | {100*no_fail/n:.1f}% |")
    lines.append("")

    # Top improvement hints (sample 10 worst)
    lines.append("## Top improvement hints (sample of worst 10)")
    lines.append("")
    sorted_records = sorted(scored_records, key=lambda r: r["_satisfaction_score"])[:10]
    for r in sorted_records:
        lines.append(f"- **{r['id']}** (sat {r['_satisfaction_score']:.2f}, fail={r.get('failure_category')}) — {r['_tool']}: {(r.get('improvement_hint') or '')[:120]}")
    lines.append("")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"[v3-aggregate] wrote {report_path}", file=sys.stderr)
    print(f"[v3-aggregate] wrote {out_path}", file=sys.stderr)
    print(f"[v3-aggregate] Satisfaction Accuracy: {sat_pct:.1f}%", file=sys.stderr)
    print(f"[v3-aggregate] Minimum Acceptable Accuracy: {min_pct:.1f}%", file=sys.stderr)
    print(f"[v3-aggregate] Catastrophic Error Rate: {cat_pct:.1f}%", file=sys.stderr)


if __name__ == "__main__":
    main()
