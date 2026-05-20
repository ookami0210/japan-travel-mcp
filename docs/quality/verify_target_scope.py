#!/usr/bin/env python3
"""
Verify that an iteration's response changes are confined to the declared
target case set. Exits non-zero if:
  - any non-target case differs byte-for-byte from the previous iter
  - any target case is byte-identical to the previous iter (lever didn't fire)

Usage:
  python3.11 docs/quality/verify_target_scope.py \
      --prev iter116-clusters-fuji-peace-jomon-shiretoko \
      --curr iter117-infeasibility-promote \
      --targets L3-07
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent


def load_responses(label: str) -> dict[str, str]:
    fp = REPO / "docs" / "quality" / f"test_results.{label}.jsonl"
    if not fp.exists():
        sys.exit(f"missing test_results file: {fp}")
    out = {}
    for line in fp.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        out[r["id"]] = json.dumps(r.get("result", ""), ensure_ascii=False, sort_keys=False)
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prev", required=True, help="previous iter label")
    parser.add_argument("--curr", required=True, help="current iter label")
    parser.add_argument(
        "--targets",
        required=True,
        help="comma-separated case ids declared as targets (e.g. L3-07,L3-12)",
    )
    args = parser.parse_args()

    targets = {t.strip() for t in args.targets.split(",") if t.strip()}
    prev = load_responses(args.prev)
    curr = load_responses(args.curr)

    common = set(prev) & set(curr)
    diffs = {tid for tid in common if prev[tid] != curr[tid]}

    expected_diff = targets & common
    unexpected_diff = diffs - targets
    target_unchanged = expected_diff - diffs

    print(f"  prev={args.prev} ({len(prev)} cases)")
    print(f"  curr={args.curr} ({len(curr)} cases)")
    print(f"  targets={sorted(targets)}")
    print(f"  diff cases: {len(diffs)} → {sorted(diffs)}")
    print()

    fail = False
    if unexpected_diff:
        print(f"  ✗ FAIL: {len(unexpected_diff)} non-target cases changed:")
        for tid in sorted(unexpected_diff):
            print(f"      - {tid}")
        print()
        print(f"     The lever leaked outside the declared target scope.")
        print(f"     Either revert the change, narrow the trigger, or add the")
        print(f"     leaked cases to --targets if intended.")
        fail = True

    if target_unchanged:
        print(f"  ✗ FAIL: {len(target_unchanged)} target cases UNCHANGED (lever didn't fire):")
        for tid in sorted(target_unchanged):
            print(f"      - {tid}")
        print()
        print(f"     The change in source did not affect the response for these")
        print(f"     cases. The lever's trigger condition probably doesn't match")
        print(f"     this case's tool args. Pick a different lever.")
        fail = True

    if not fail:
        print(f"  ✓ PASS: target cases changed ({sorted(expected_diff)}), no leak.")
        sys.exit(0)
    sys.exit(1)


if __name__ == "__main__":
    main()
