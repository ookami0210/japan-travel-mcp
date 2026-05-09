#!/usr/bin/env python3
"""
Build v3 evaluation prompts for the Tourism Agent Evaluation Scorecard.

Per confirmed design (2026-05-02):
  - 11-dimension scorecard (7 numeric 0-5, 2 pass/fail, 1 categorical)
  - Two KPIs: Satisfaction Accuracy + Minimum Acceptable Accuracy
  - Per-case reasoning + missing_data + wrong_data + improvement_hint
    so the improvement loop has concrete next-step material

Pipeline:
  1. Read test_results.jsonl (100 cases) and test_calls.json (intents)
  2. Generate one prompt per case
  3. Split into 4 batches of 25 each → judge_v3_batches/<label>/batch_<n>.txt
  4. Main loop spawns 4 subagents (one per batch) — each scores 25 cases
     under the user's Claude Code subscription quota (no API billing)
  5. Each subagent writes its scored output to
     judge_v3_batches/<label>/batch_<n>_scored.jsonl
  6. aggregate_v3.py merges batches → scored.<label>.v3.jsonl + report

Usage:
  python3 docs/quality/build_v3_prompts.py --label deep-scrape
  python3 docs/quality/build_v3_prompts.py --new-tools --label deep-scrape
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# Pinned rubric — the prompt that the judge sees is the contents of
# docs/quality/judge_prompt_v3.txt verbatim, so we can git-pin the rubric
# version and detect drift via the file's commit hash. Inlining the prompt
# here used to mean any edit silently changed the scoring contract; reading
# it from a file means the rubric is reviewable in PRs and reproducible
# across runs.
_RUBRIC_PATH = Path(__file__).resolve().parent / "judge_prompt_v3.txt"
V3_RUBRIC = _RUBRIC_PATH.read_text(encoding="utf-8").strip()

CASE_TEMPLATE = """
=== Case {id} ===
Topic / intent: {topic}
Query: {query}
Tool: {tool}({args})

Response (truncated to 4000 chars):
```
{response}
```
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-tools", action="store_true",
                        help="Use the 11-case new-tools corpus")
    parser.add_argument("--label", default="deep-scrape",
                        help="Label for output filenames")
    parser.add_argument("--batches", type=int, default=4,
                        help="Number of batches (= subagents)")
    args = parser.parse_args()

    if args.new_tools:
        results_path = REPO / "docs" / "quality" / "test_results_new_tools.jsonl"
        calls_path = REPO / "docs" / "quality" / "test_calls_new_tools.json"
        out_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}_new_tools"
    else:
        results_path = REPO / "docs" / "quality" / "test_results.jsonl"
        calls_path = REPO / "docs" / "quality" / "test_calls.json"
        out_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}_100case"

    if not results_path.exists():
        sys.exit(f"missing {results_path}")
    calls = {c["id"]: c for c in json.loads(calls_path.read_text())}

    cases = []
    for line in results_path.read_text().splitlines():
        if not line.strip():
            continue
        rec = json.loads(line)
        meta = calls.get(rec["id"], {})
        result = rec.get("result", {})
        if result.get("ok") and "response" in result:
            response_str = json.dumps(result["response"], ensure_ascii=False, indent=2)[:4000]
        elif "response_raw" in result:
            response_str = result["response_raw"][:4000]
        else:
            response_str = json.dumps(result, ensure_ascii=False)[:4000]
        cases.append({
            "id": rec["id"],
            "topic": rec.get("topic") or meta.get("intent") or meta.get("topic", ""),
            "query": rec.get("query") or json.dumps(rec.get("args", {}), ensure_ascii=False),
            "tool": rec.get("tool", "?"),
            "args": json.dumps(rec.get("args", {}), ensure_ascii=False),
            "response": response_str,
        })

    out_dir.mkdir(parents=True, exist_ok=True)
    n = len(cases)
    batch_size = (n + args.batches - 1) // args.batches
    for i in range(args.batches):
        start = i * batch_size
        end = min(start + batch_size, n)
        if start >= n:
            break
        batch_cases = cases[start:end]
        prompt_parts = [V3_RUBRIC, "", "Score each of the following cases:"]
        for c in batch_cases:
            prompt_parts.append(CASE_TEMPLATE.format(**c))
        prompt_parts.append(
            "\nReturn one JSONL line per case in the order above. "
            "Each line must include: id, intent_understanding, groundedness, "
            "factual_accuracy, practical_usefulness, constraint_handling, "
            "travel_feasibility, specificity, expression_quality, "
            "safety_pass, hallucination_pass, failure_category, "
            "reasoning, missing_data, wrong_data, improvement_hint."
        )
        prompt_path = out_dir / f"batch_{i+1}_prompt.txt"
        prompt_path.write_text("\n".join(prompt_parts), encoding="utf-8")

        # Also write the case ids for this batch (for the aggregator to verify ordering)
        ids_path = out_dir / f"batch_{i+1}_ids.json"
        ids_path.write_text(
            json.dumps([c["id"] for c in batch_cases], ensure_ascii=False),
            encoding="utf-8",
        )

    print(f"[v3-prompts] wrote {args.batches} batches × ~{batch_size} cases to {out_dir}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
