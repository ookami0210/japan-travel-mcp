#!/usr/bin/env python3
"""
Build a slim judge prompt for a SINGLE case, for use with per-Q targeted
iteration. The 100-question batch prompt is ~125 KB and judging it with
3 judges costs ~390 KB of input tokens; if only 1 case actually changed
between iters, judging that one case is ~5 KB × 3 judges = 15 KB.

Usage:
  python3.11 docs/quality/build_per_q_prompt.py --label iter118-foo --case L3-03
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
RUBRIC_PATH = REPO / "docs" / "quality" / "judge_prompt_v3.txt"
CALLS_PATH = REPO / "docs" / "quality" / "test_calls.json"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True)
    parser.add_argument(
        "--case",
        required=True,
        help="single case id, e.g. L3-03; OR comma-separated list",
    )
    parser.add_argument("--max-chars", type=int, default=4000)
    args = parser.parse_args()

    case_ids = [c.strip() for c in args.case.split(",") if c.strip()]

    rubric = RUBRIC_PATH.read_text(encoding="utf-8").strip()
    calls = {c["id"]: c for c in json.loads(CALLS_PATH.read_text())}

    results_path = REPO / "docs" / "quality" / f"test_results.{args.label}.jsonl"
    if not results_path.exists():
        sys.exit(f"missing test_results: {results_path}")
    results = {}
    for line in results_path.read_text().splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        results[r["id"]] = r

    out_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}_per_q"
    out_dir.mkdir(parents=True, exist_ok=True)

    for cid in case_ids:
        if cid not in calls:
            print(f"  ⚠ {cid} not in test_calls — skipping")
            continue
        if cid not in results:
            print(f"  ⚠ {cid} not in {args.label} test_results — skipping")
            continue
        cd = calls[cid]
        rd = results[cid]
        result_str = json.dumps(rd.get("result", ""), ensure_ascii=False, indent=2)
        if len(result_str) > args.max_chars:
            result_str = result_str[: args.max_chars] + "\n... (truncated)"
        body = (
            f"{rubric}\n\nScore the following case:\n\n"
            f"=== Case {cid} ===\n"
            f"Topic / intent: {cd.get('topic', '')}\n"
            f"Query: {cd.get('query', '')}\n"
            f"Tool: {cd['tool']}({json.dumps(cd['args'], ensure_ascii=False)})\n\n"
            f"Response (truncated to {args.max_chars} chars):\n```\n{result_str}\n```\n"
        )
        out_path = out_dir / f"{cid}_prompt.txt"
        out_path.write_text(body, encoding="utf-8")
        print(f"  wrote {out_path} ({len(body)} chars)")

    print()
    print(f"  ✓ Per-Q prompts ready at {out_dir}")
    print(f"    Spawn 3 Sonnet subagents per case (one per judge) to score:")
    print(f"      input:  <case>_prompt.txt")
    print(f"      output: <case>_judge<1|2|3>_scored.jsonl  (1 line per case)")


if __name__ == "__main__":
    main()
