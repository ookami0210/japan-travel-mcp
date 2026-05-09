#!/usr/bin/env python3
"""
Check whether a target case meets the PASS criterion under the per-case
targeted iteration discipline:

  Min PASS:  all 3 judges score every numeric dim ≥3 AND
             at least 1 judge scores Sat (weighted) ≥4

Usage:
  python3.11 docs/quality/check_pass.py --label iter118-foo --case L3-03
  python3.11 docs/quality/check_pass.py --label iter118-foo --case L3-03 --mode sat
"""
from __future__ import annotations

import argparse
import json
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
SAT_WEIGHTS = {
    "intent_understanding": 0.25,
    "factual_accuracy": 0.25,
    "practical_usefulness": 0.25,
    "specificity": 0.10,
    "groundedness": 0.10,
    "expression_quality": 0.05,
}


def sat(r: dict) -> float:
    return sum(SAT_WEIGHTS[d] * r.get(d, 0) for d in SAT_WEIGHTS)


def load_judge_scores(label: str, case_id: str) -> dict[int, dict]:
    """Return {judge_num: scored_row} for the given case across all judges."""
    out: dict[int, dict] = {}
    # First check per-Q dir
    per_q_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{label}_per_q"
    if per_q_dir.exists():
        for fp in sorted(per_q_dir.glob(f"{case_id}_judge*_scored.jsonl")):
            jname = fp.name.split("judge")[1].split("_")[0]
            try:
                j = int(jname)
            except ValueError:
                continue
            for line in fp.read_text().splitlines():
                if not line.strip():
                    continue
                try:
                    r = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if r.get("id") == case_id:
                    out[j] = r
                    break
    # Fall back to batch dir (full 100q eval)
    if not out:
        batch_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{label}_100case"
        if batch_dir.exists():
            for fp in sorted(batch_dir.glob("batch_*_judge*_scored.jsonl")):
                jname = fp.name.split("judge")[1].split("_")[0]
                try:
                    j = int(jname)
                except ValueError:
                    continue
                for line in fp.read_text().splitlines():
                    if not line.strip():
                        continue
                    try:
                        r = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if r.get("id") == case_id:
                        out[j] = r
                        break
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument("--case", required=True, help="case id (e.g. L3-03) or comma-list")
    parser.add_argument(
        "--mode",
        choices=["min", "sat"],
        default="min",
        help="min: 3-judges all dims ≥3 + ≥1 judge Sat ≥4 (default)\n"
             "sat: 3-judges all dims ≥4 + ≥1 judge Sat ≥5",
    )
    args = parser.parse_args()

    case_ids = [c.strip() for c in args.case.split(",") if c.strip()]
    overall_pass = True
    for cid in case_ids:
        scores = load_judge_scores(args.label, cid)
        if not scores:
            print(f"  ⚠ {cid}: no judge scores found for label={args.label}")
            overall_pass = False
            continue
        if len(scores) < 3:
            print(f"  ⚠ {cid}: only {len(scores)} judges scored (need 3): {sorted(scores)}")
            overall_pass = False
            continue
        # Apply pass criterion
        if args.mode == "min":
            dim_threshold = 3
            sat_threshold = 4.0
        else:
            dim_threshold = 4
            sat_threshold = 5.0
        all_dims_ok = True
        any_sat_ok = False
        per_judge = []
        for j, r in sorted(scores.items()):
            dim_vals = {d: r.get(d, 0) for d in NUMERIC_DIMS}
            min_dim = min(dim_vals.values())
            s = sat(r)
            judge_dim_ok = min_dim >= dim_threshold
            judge_sat_ok = s >= sat_threshold
            safety_ok = bool(r.get("safety_pass")) and bool(r.get("hallucination_pass"))
            if not judge_dim_ok:
                all_dims_ok = False
            if not safety_ok:
                all_dims_ok = False
            if judge_sat_ok:
                any_sat_ok = True
            per_judge.append(
                f"  j{j}: min_dim={min_dim} sat={s:.2f} safety={safety_ok} "
                f"dim_ok={judge_dim_ok} sat≥{sat_threshold:.0f}={judge_sat_ok}"
            )

        passed = all_dims_ok and any_sat_ok
        marker = "✓ PASS" if passed else "✗ FAIL"
        print(f"  {marker} {cid} (mode={args.mode}, dim_threshold≥{dim_threshold}, sat_threshold≥{sat_threshold:.0f})")
        for line in per_judge:
            print(line)
        if not passed:
            overall_pass = False
        print()

    sys.exit(0 if overall_pass else 1)


if __name__ == "__main__":
    main()
