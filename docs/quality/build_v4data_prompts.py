#!/usr/bin/env python3
"""
Build v4-data evaluation prompts for the Product 1 (MCP server / data layer)
of japan-travel-mcp.

Why a new rubric (confirmed 2026-05-04):
  - v3 mixes data-quality (groundedness / factual_accuracy / safety) with
    composition-quality (practical_usefulness / specificity /
    expression_quality / constraint_handling). Iter45-52 dimension
    averages showed data dimensions clustered at 3.5-4.4 (high) while
    composition / agent-responsibility dimensions sat at 2.0-2.9 (low).
  - The Sat plateau at 22% (iter44) is therefore not a data problem —
    it's a Product 2 (composition layer) gap that this MCP server
    cannot fix. Per the two-product split memo, v4-data isolates the
    data layer's responsibility so the iter loop optimises the right
    surface.
  - Composition / narrative axes are deferred to a future v4-compose
    rubric that will drive Product 2 development.

Pipeline mirrors build_v3_prompts.py:
  1. Read test_results.jsonl (100 cases) and test_calls_v2.json (with
     expected_entities)
  2. Generate one prompt per case
  3. Split into N batches → judge_v4data_batches/<label>/batch_<n>.txt
  4. Main loop spawns N subagents — each scores its batch
  5. Each subagent writes batch_<n>_scored.jsonl
  6. aggregate_v4data.py merges → scored.<label>.v4data.jsonl + report

Usage:
  python3 docs/quality/build_v4data_prompts.py --label iter54-baseline
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

V4DATA_RUBRIC = """You are scoring tool responses from japan-travel-mcp's **Product 1 — the MCP data server**. The direct consumer is an AI agent (Claude / GPT / Gemini), NOT a human end-user. The server's job is to return faithful, complete, well-structured travel data; composing user-friendly prose is the agent's responsibility (or a separate Product 2 composition layer).

Score the response on the **Data Layer Scorecard (v4-data, 7 dimensions)**.

For each numeric dimension, use 0-5:
  5 = excellent — agent has everything needed and more
  4 = good — minor gap that doesn't block the agent
  3 = acceptable — works but missing a relevant subset
  2 = problematic — major asset(s) missing or wrong
  1 = bad — wrong domain / wrong jurisdiction / fabricated
  0 = empty or hostile (errors, unrelated payload)

DIMENSIONS:

1. **data_completeness (0-5)** — Does the response include the primary entities the query implies? Use the `expected_entities` list (when given) as ground truth, but reward over-coverage of clearly-related entities too.

2. **data_accuracy (0-5)** — Are facts correct (names, prefectures, types, coordinates near-correct, source URLs)? An entity in the wrong prefecture is -2; a wrong romanisation is -1; a fabricated entity is 0 and forces hallucination_pass=false.

3. **schema_conformance (0-5)** — Are records well-structured? Look for: stable IDs (qid / spot_id), `source` and `source_url`/`url` for traceability, `prefecture`, `coordinates` where applicable, `kinds`/`types`, multilingual labels when available. Penalise broken nesting, dangling cross-refs, mixed language fields, missing source attribution.

4. **recall_of_known (0-5)** — When the query mentions a famous landmark (e.g. 富士山, 姫路城, 出雲大社, 厳島神社, 那智の滝, 鎌倉大仏, 京都御所, 屋久島), does that entity appear AT ALL in the response (not necessarily ranked first)? 5 = present and findable. 3 = a closely-related entity present but not the canonical one. 0 = entirely missing.

5. **prominence_ranking (0-5)** — Is the most-famous matching entity ranked near the top? A 4-language Wikipedia entity with heritage_designations should outrank a single-language local kofun in a same-name match.

6. **traceability (0-5)** — Can a downstream agent trust and cite the data? Look for: source_anchor/types, qid, source URL, dataset attribution. Heritage designations (UNESCO WHS, 国宝, 重要文化財, etc.) when relevant should be in the response.

7. **structured_metadata (0-5)** — Does the response carry agent-useful metadata fields beyond names? E.g. heritage_designations, kinds (waterfall/temple/castle), prominence_score, safety_keywords_detected when query implies risk, truncation_note when results capped. Reward when present and informative.

PASS/FAIL CHECKS:

- **safety_pass (true|false)** — TRUE iff the response avoids fabricating dangerous, infeasible, or impossible facts. Note: the server does NOT need to compose a safety warning to pass — emitting `safety_keywords_detected` metadata is enough. Composition is the agent's job.

- **hallucination_pass (true|false)** — TRUE iff every named entity in the response actually exists in real Japan. Made-up shrines, fictional ryokan, made-up festival dates → false.

KPI CALCULATION (used downstream):
  satisfaction_data = weighted average ≥ 4.0 across the 7 dimensions, with
    weights {data_completeness:0.25, data_accuracy:0.25, recall_of_known:0.20,
             prominence_ranking:0.10, schema_conformance:0.10, traceability:0.05,
             structured_metadata:0.05}
  minimum_data = safety_pass AND hallucination_pass AND avg(7 dims) ≥ 3.0
  catastrophic = NOT(safety_pass) OR NOT(hallucination_pass)

FREE-FORM FIELDS (≤80 words each):
- **reasoning** — short justification of scoring
- **missing_entities** — comma list of clearly-expected entities not present (or '')
- **wrong_facts** — incorrect / fabricated content ('' if none)
- **improvement_hint** — concrete next-step for the server (e.g. "fetch P31=Q92026 castles", "add heritage_designations to get_local_food", "expose source_anchor on get_dmo")

Output STRICTLY one JSON object per case, in the order given. Wrap your full output in a ```jsonl code block, one object per line. Each object MUST contain: id, data_completeness, data_accuracy, schema_conformance, recall_of_known, prominence_ranking, traceability, structured_metadata, safety_pass, hallucination_pass, reasoning, missing_entities, wrong_facts, improvement_hint."""

CASE_TEMPLATE = """
=== Case {id} ===
Topic / intent: {topic}
Query: {query}
Tool: {tool}({args})
Expected entities (ground truth, may be empty): {expected_entities}

Response (truncated to 4000 chars):
```
{response}
```
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--label", required=True, help="Label for output filenames")
    parser.add_argument("--batches", type=int, default=4, help="Number of batches (= subagents)")
    parser.add_argument(
        "--calls-file",
        default="docs/quality/test_calls_v2.json",
        help="Test calls file with expected_entities",
    )
    parser.add_argument(
        "--results-file",
        default="docs/quality/test_results.jsonl",
        help="Test results file",
    )
    args = parser.parse_args()

    results_path = REPO / args.results_file
    calls_path = REPO / args.calls_file
    out_dir = REPO / "docs" / "quality" / "judge_v4data_batches" / f"{args.label}_100case"

    if not results_path.exists():
        sys.exit(f"missing {results_path}")
    if not calls_path.exists():
        sys.exit(f"missing {calls_path} — run gen_test_calls_v2.py first")

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
        else:
            response_str = json.dumps(result, ensure_ascii=False, indent=2)[:4000]

        expected = meta.get("expected_entities", [])
        cases.append(
            CASE_TEMPLATE.format(
                id=rec["id"],
                topic=meta.get("topic", "?"),
                query=meta.get("query", "?"),
                tool=meta.get("tool", "?"),
                args=json.dumps(meta.get("args", {}), ensure_ascii=False),
                expected_entities=", ".join(expected) if expected else "(none specified)",
                response=response_str,
            )
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    batch_size = (len(cases) + args.batches - 1) // args.batches
    for i in range(args.batches):
        start = i * batch_size
        end = min(start + batch_size, len(cases))
        if start >= end:
            break
        batch_cases = cases[start:end]
        batch_path = out_dir / f"batch_{i+1}.txt"
        batch_path.write_text(V4DATA_RUBRIC + "\n\n" + "".join(batch_cases))
        print(f"  wrote {batch_path} with {len(batch_cases)} cases")

    print(f"\n✅ Built {args.batches} batches under {out_dir}")
    print("Next: spawn subagents (one per batch) to write batch_<n>_scored.jsonl,")
    print("then run aggregate_v4data.py --label", args.label)


if __name__ == "__main__":
    main()
