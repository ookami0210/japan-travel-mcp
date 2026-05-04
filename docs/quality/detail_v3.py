#!/usr/bin/env python3
"""
Per-case detail of v3 scoring — every case × every dimension.

Output: a markdown table with one row per test case, showing all 8 numeric
dimensions (0-5), safety/hallucination pass, failure category, weighted
satisfaction score, and the satisfaction/min-acceptable/catastrophic
classifications.

Usage:
  python3 docs/quality/detail_v3.py --label after-getspots-fix
"""
import argparse, json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

NUMERIC_DIMS = [
    ("intent_understanding", "Int"),
    ("groundedness", "Gnd"),
    ("factual_accuracy", "Fact"),
    ("practical_usefulness", "Pract"),
    ("constraint_handling", "Cstrt"),
    ("travel_feasibility", "Feas"),
    ("specificity", "Spec"),
    ("expression_quality", "Expr"),
]

SATISFACTION_WEIGHTS = {
    "intent_understanding": 0.25,
    "factual_accuracy": 0.25,
    "practical_usefulness": 0.25,
    "specificity": 0.10,
    "groundedness": 0.10,
    "expression_quality": 0.05,
}


def sat_score(r):
    return sum(SATISFACTION_WEIGHTS.get(d, 0) * r.get(d, 0) for d in SATISFACTION_WEIGHTS)


def avg_numeric(r):
    vals = [r.get(d, 0) for d, _ in NUMERIC_DIMS]
    return sum(vals) / len(vals) if vals else 0


def classify(r):
    s = sat_score(r)
    avg = avg_numeric(r)
    safe = bool(r.get("safety_pass"))
    halluc = bool(r.get("hallucination_pass"))
    cat = (not safe) or (not halluc)
    sat_ok = s >= 4.0
    min_ok = safe and halluc and avg >= 3.0
    return s, avg, sat_ok, min_ok, cat


def cell(v, threshold_low=2, threshold_high=4):
    """Color-code cell: ❌ for ≤low, ⚠️ for middle, ✅ for ≥high."""
    if v is None:
        return "—"
    n = int(v)
    if n <= threshold_low:
        return f"**{n}**🔴"
    if n >= threshold_high:
        return f"**{n}**🟢"
    return f"{n}🟡"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="after-getspots-fix")
    args = ap.parse_args()

    scored_path = REPO / "docs" / "quality" / f"test_results_scored.{args.label}.v3.jsonl"
    if not scored_path.exists():
        print(f"missing {scored_path}")
        return

    cases = []
    for line in scored_path.read_text().splitlines():
        if not line.strip(): continue
        cases.append(json.loads(line))

    out = REPO / "docs" / "quality" / f"DETAIL_v3.{args.label}.md"
    lines = [
        f"# Per-case dimension detail — {args.label} (v3)",
        "",
        f"100 cases × 8 numeric dims (0-5) + safety/halluc + failure category.",
        "",
        "Color code: 🔴 ≤2 (KPI '作らない' threshold) ｜ 🟡 3 ｜ 🟢 ≥4 (KPI '成功' threshold)",
        "",
        "**Sat = weighted satisfaction (0.25*intent + 0.25*factual + 0.25*pract + 0.10*spec + 0.10*gnd + 0.05*expr)**",
        "**Min = avg ≥3 + safety + halluc PASS** ｜ **Cat = safety FAIL or halluc FAIL**",
        "",
    ]

    # Build header
    headers = ["ID", "Tool", "Topic"]
    headers += [abbr for _, abbr in NUMERIC_DIMS]
    headers += ["Safe", "Hall", "Fail", "Sat", "Min", "Cat"]
    lines.append("| " + " | ".join(headers) + " |")
    lines.append("|" + "|".join(["---"] * len(headers)) + "|")

    # Sort by tool then id
    cases.sort(key=lambda r: (r.get("_tool", "?"), r.get("id", "")))

    sat_count = 0
    min_count = 0
    cat_count = 0
    bad_dim_counts = {d: 0 for d, _ in NUMERIC_DIMS}  # count of ≤2 per dim

    for r in cases:
        s, avg, sat_ok, min_ok, cat = classify(r)
        if sat_ok: sat_count += 1
        if min_ok: min_count += 1
        if cat: cat_count += 1
        for d, _ in NUMERIC_DIMS:
            if r.get(d, 0) <= 2:
                bad_dim_counts[d] += 1
        row = [
            r.get("id", "?"),
            r.get("_tool", "?")[:14],
            (r.get("_topic", "?") or "?")[:18],
        ]
        for d, _ in NUMERIC_DIMS:
            row.append(cell(r.get(d)))
        row.append("✅" if r.get("safety_pass") else "**❌**")
        row.append("✅" if r.get("hallucination_pass") else "**❌**")
        row.append(r.get("failure_category") or "—")
        row.append(f"**{s:.2f}**{'🟢' if sat_ok else ('🟡' if s >= 3 else '🔴')}")
        row.append("✅" if min_ok else "❌")
        row.append("**🚨**" if cat else "—")
        lines.append("| " + " | ".join(str(x) for x in row) + " |")

    n = len(cases)
    lines.append("")
    lines.append("## サマリ")
    lines.append("")
    lines.append(f"- **Satisfaction (sat ≥4.0)**: **{sat_count}/{n}** ({100*sat_count/n:.0f}%) ← 目標 50%+")
    lines.append(f"- **Minimum Acceptable (avg ≥3 + safe + halluc)**: **{min_count}/{n}** ({100*min_count/n:.0f}%) ← 目標 99.99%")
    lines.append(f"- **Catastrophic (safety/halluc fail)**: **{cat_count}/{n}** ({100*cat_count/n:.0f}%) ← 目標 0%")
    lines.append("")
    lines.append("## 各次元で ≤2 (作らない目標違反) のケース数")
    lines.append("")
    lines.append("| Dimension | ≤2 cases | % |")
    lines.append("|:---|---:|---:|")
    for d, abbr in NUMERIC_DIMS:
        c = bad_dim_counts[d]
        lines.append(f"| {d} ({abbr}) | {c} | {100*c/n:.0f}% |")

    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {out}")
    print(f"Sat: {sat_count}/{n}, Min: {min_count}/{n}, Cat: {cat_count}/{n}")


if __name__ == "__main__":
    main()
