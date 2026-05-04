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

V3_RUBRIC = """You are scoring tool responses from the japan-travel-mcp server, an OSS Japan tourism data MCP. Its tools return structured JSON that AI agents (Claude / GPT / Gemini) consume to answer end-user travel questions.

Score the response on the **Tourism Agent Evaluation Scorecard** (11 dimensions). The MCP server's job is comprehensiveness + neutrality; the user-side agent judges fit. Score how well this response equips the agent to produce a good end-user answer.

For each numeric dimension, use 0-5:
  5 = excellent — agent can use as-is
  4 = good — minor gap, mostly useful
  3 = acceptable — works but weak
  2 = problematic — intent matches but practically thin
  1 = bad — incorrect, off-target, or unsafe

DIMENSIONS:

1. **intent_understanding (0-5)** — Does the response address the user's actual intent?
2. **groundedness (0-5)** — Is the response based on real data (not hallucinated)?
3. **factual_accuracy (0-5)** — Are the facts (names, places, attributes) correct?
4. **practical_usefulness (0-5)** — Can a traveler use this for trip planning?
5. **constraint_handling (0-5)** — Does it respect query constraints (budget / season / mobility / time / family / accessibility)?
6. **travel_feasibility (0-5)** — Is the proposed itinerary geographically + temporally feasible (e.g. not Tokyo↔Yakushima same-day)?
7. **specificity (0-5)** — Is the response specific (named assets, addresses, dates) vs generic?
8. **expression_quality (0-5)** — Is the response well-formed (clear structure, metadata, no nav-chrome dominating)?
9. **safety_pass (true|false)** — TRUE iff the response avoids dangerous, absurd, or culturally offensive recommendations.
10. **hallucination_pass (true|false)** — TRUE iff the response avoids fabricating non-existent places / facts.
11. **failure_category (A|B|C|D|E|F|G|H|null)** — null when ≥4 across the board. Otherwise pick the SINGLE worst:
    - A. Retrieval Failure — needed data wasn't fetched
    - B. Ranking Failure — data present but buried below noise
    - C. Reasoning Failure — data present but synthesised wrong
    - D. Grounding Failure — mentions things not in the corpus
    - E. Practicality Failure — correct but unusable
    - F. Constraint Failure — ignored explicit constraints
    - G. Coverage Failure — sparse, too few options
    - H. Safety / Cultural Failure — dangerous or insensitive

Plus three free-form fields (≤80 words each):
- **reasoning** — short justification of your scoring
- **missing_data** — what *should* be there but isn't ('' if nothing)
- **wrong_data** — incorrect / fabricated content ('' if none)
- **improvement_hint** — concrete next-step the server could take

Output STRICTLY one JSON object per case, in the order given. Wrap your full output in a ```jsonl code block, one object per line."""

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
