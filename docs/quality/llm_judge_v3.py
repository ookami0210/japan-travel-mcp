#!/usr/bin/env python3
"""
LLM-judge scoring of quality test results — rubric v3.1 (11-dim, T=0).

Direct Anthropic API path that replaces the Agent-tool subagent path used by
build_v3_prompts.py / aggregate_v3_multijudge.py. Key differences:

  * temperature defaults to 0.0 (validated 2026-05-14 — same mean as T=1.0
    with 1/5 the variance and 0 parse-fail rate)
  * rubric is loaded verbatim from judge_prompt_v3.txt (git-pinned)
  * 11-dimension JSONL output, compatible with aggregate_v3_multijudge.py
  * one API call per (case, judge) — N judges run sequentially per case so
    the per-judge files land independently and aggregation works on partial
    progress
  * response excerpt budget defaults to 12000 chars (matches iter127 wide
    judge view)

Reads:
  docs/quality/test_results.<label>.jsonl
  docs/quality/test_calls.json
Writes:
  docs/quality/judge_v3_batches/<label>_100case/batch_<N>_judge<J>_scored.jsonl

The output layout matches build_v3_prompts.py output so the existing
aggregator (aggregate_v3_multijudge.py) consumes it without change.

Usage:
  ANTHROPIC_API_KEY=... python3.11 docs/quality/llm_judge_v3.py \\
      --label iter127-widejudge --judges 3 --temperature 0.0

Cost estimate per 100-case × 3-judge run:
  ~300 calls × ~5K input + ~400 output tokens
  ≈ $4.50 input + $1.80 output ≈ $6.30 (Sonnet 4.6, no cache hits)
  System prompt cached → repeat runs ≈ $2.50.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import anthropic  # type: ignore

REPO = Path(__file__).resolve().parent.parent.parent
RUBRIC_PATH = REPO / "docs" / "quality" / "judge_prompt_v3.txt"

CASE_TEMPLATE = """=== Case {id} ===
Topic / intent: {topic}
Query: {query}
Tool: {tool}({args})

Response ({budget_label}):
```
{response}
```
"""

NUMERIC_DIMS = [
    "intent_understanding", "groundedness", "factual_accuracy",
    "practical_usefulness", "constraint_handling", "travel_feasibility",
    "specificity", "expression_quality",
]


def build_case_prompt(rec: dict, calls: dict, max_chars: int) -> str:
    meta = calls.get(rec["id"], {})
    result = rec.get("result", {})
    if result.get("ok") and "response" in result:
        full = json.dumps(result["response"], ensure_ascii=False, indent=2)
    elif "response_raw" in result:
        full = result["response_raw"]
    else:
        full = json.dumps(result, ensure_ascii=False)
    truncated = len(full) > max_chars
    response_str = full[:max_chars] + ("\n... (truncated)" if truncated else "")
    approx_tokens = len(response_str) // 3
    budget_label = (
        f"~{approx_tokens} tokens (chars/3 approx; budget {max_chars} chars)"
        + (", truncated" if truncated else "")
    )
    return CASE_TEMPLATE.format(
        id=rec["id"],
        topic=rec.get("topic") or meta.get("intent") or meta.get("topic", ""),
        query=rec.get("query") or json.dumps(rec.get("args", {}), ensure_ascii=False),
        tool=rec.get("tool", "?"),
        args=json.dumps(rec.get("args", {}), ensure_ascii=False),
        response=response_str,
        budget_label=budget_label,
    )


def parse_score(txt: str) -> dict:
    # Per-case prompts ask for exactly one JSON object; allow either bare
    # object or jsonl-fenced single line.
    m = re.search(r"```(?:jsonl|json)?\s*\n(.*?)\n```", txt, re.S)
    body = m.group(1).strip() if m else txt.strip()
    # First try: parse as single JSON object
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        pass
    # Fallback: find first {...} block
    m2 = re.search(r"\{.*\}", body, re.S)
    if not m2:
        raise ValueError(f"no json found in: {txt[:400]}")
    return json.loads(m2.group(0))


def score_case(
    client: anthropic.Anthropic,
    rubric: str,
    case_prompt: str,
    model: str,
    temperature: float,
    max_retries: int = 3,
) -> tuple[dict | None, str | None]:
    user_msg = (
        case_prompt
        + "\n\nReturn STRICTLY one JSON object for this case. Fields: id, "
        + ", ".join(NUMERIC_DIMS)
        + ", safety_pass, hallucination_pass, failure_category, "
          "reasoning, missing_data, wrong_data, improvement_hint."
    )
    last_err: str | None = None
    for attempt in range(max_retries):
        try:
            resp = client.messages.create(
                model=model,
                max_tokens=900,
                temperature=temperature,
                system=[{
                    "type": "text",
                    "text": rubric,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_msg}],
            )
            txt = resp.content[0].text.strip()
            data = parse_score(txt)
            # Validate required keys exist
            if "id" not in data:
                raise ValueError(f"missing id in: {txt[:300]}")
            return data, None
        except Exception as e:  # noqa: BLE001 — retry on any failure
            last_err = f"{type(e).__name__}: {e}"
            time.sleep(2 ** attempt)
    return None, last_err


def load_test_results(path: Path) -> list[dict]:
    out = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(json.loads(line))
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True,
                    help="iter label, e.g. iter127-widejudge")
    ap.add_argument("--judges", type=int, default=1,
                    help="Number of judges (default 1; T=0 is deterministic so multi-judge "
                         "gives no variance reduction — multi-judge only useful for T>0 runs)")
    ap.add_argument("--temperature", type=float, default=0.0)
    ap.add_argument("--model", default="claude-sonnet-4-6")
    ap.add_argument("--max-chars", type=int, default=12000,
                    help="Response excerpt char budget (default 12000)")
    ap.add_argument("--batches", type=int, default=4,
                    help="Batch dir partitioning (default 4 of 25 cases each)")
    ap.add_argument("--results-path", default=None,
                    help="Override test_results path (default test_results.<label>.jsonl)")
    ap.add_argument("--calls-path", default=None,
                    help="Override test_calls path (default test_calls.json)")
    ap.add_argument("--only-judge", type=int, default=None,
                    help="If set, only run this judge index (1..N), skip others")
    ap.add_argument("--only-batch", type=int, default=None,
                    help="If set, only run this batch (1..N), skip others (for parallelism)")
    ap.add_argument("--only-ids", default=None,
                    help="Comma-separated case ids to score (default: all)")
    ap.add_argument("--resume", action="store_true",
                    help="Skip cases already present in target judge files")
    args = ap.parse_args()

    if args.results_path:
        results_path = Path(args.results_path)
    else:
        results_path = REPO / "docs" / "quality" / f"test_results.{args.label}.jsonl"
    calls_path = (
        Path(args.calls_path)
        if args.calls_path
        else REPO / "docs" / "quality" / "test_calls.json"
    )
    if not results_path.exists():
        sys.exit(f"missing {results_path}")
    if not calls_path.exists():
        sys.exit(f"missing {calls_path}")
    if not RUBRIC_PATH.exists():
        sys.exit(f"missing rubric: {RUBRIC_PATH}")

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        sys.exit("ANTHROPIC_API_KEY env var required")

    rubric = RUBRIC_PATH.read_text(encoding="utf-8").strip()
    records = load_test_results(results_path)
    calls = {c["id"]: c for c in json.loads(calls_path.read_text())}
    if args.only_ids:
        wanted = {s.strip() for s in args.only_ids.split(",") if s.strip()}
        records = [r for r in records if r["id"] in wanted]

    # Partition records into batches for output layout consistency
    n = len(records)
    bsz = (n + args.batches - 1) // args.batches
    batches: list[list[dict]] = []
    for i in range(args.batches):
        s = i * bsz
        e = min(s + bsz, n)
        if s >= n:
            break
        batches.append(records[s:e])

    out_dir = REPO / "docs" / "quality" / "judge_v3_batches" / f"{args.label}_100case"
    out_dir.mkdir(parents=True, exist_ok=True)

    client = anthropic.Anthropic(api_key=api_key)

    judge_indices = (
        [args.only_judge] if args.only_judge else list(range(1, args.judges + 1))
    )

    t_start = time.time()
    total_calls = sum(len(b) for b in batches) * len(judge_indices)
    done = 0

    for bi, batch in enumerate(batches, 1):
        if args.only_batch and bi != args.only_batch:
            continue
        # Pre-build per-case prompts once for this batch
        prompts = [(rec, build_case_prompt(rec, calls, args.max_chars)) for rec in batch]

        for j in judge_indices:
            out_path = out_dir / f"batch_{bi}_judge{j}_scored.jsonl"

            already: set[str] = set()
            existing_rows: list[dict] = []
            if args.resume and out_path.exists():
                for line in out_path.read_text().splitlines():
                    try:
                        r = json.loads(line)
                        if "id" in r:
                            already.add(r["id"])
                            existing_rows.append(r)
                    except json.JSONDecodeError:
                        continue

            scored_rows = list(existing_rows)
            for rec, case_prompt in prompts:
                cid = rec["id"]
                if cid in already:
                    done += 1
                    continue
                data, err = score_case(
                    client, rubric, case_prompt, args.model, args.temperature,
                )
                done += 1
                if data is None:
                    print(f"  [{done}/{total_calls}] batch{bi} j{j} {cid} FAIL: {err}",
                          file=sys.stderr)
                    scored_rows.append({"id": cid, "_error": err})
                else:
                    # Ensure id is set even if model omitted it
                    data["id"] = cid
                    print(f"  [{done}/{total_calls}] batch{bi} j{j} {cid} "
                          f"Sat-numeric={[data.get(d) for d in NUMERIC_DIMS]}",
                          file=sys.stderr)
                    scored_rows.append(data)

                # Incremental write after each case (recover on Ctrl-C)
                out_path.write_text(
                    "\n".join(json.dumps(r, ensure_ascii=False) for r in scored_rows)
                    + "\n",
                    encoding="utf-8",
                )

            print(f"  wrote {out_path} ({len(scored_rows)} rows)", file=sys.stderr)

    elapsed = time.time() - t_start
    print(f"\n  total: {done} calls in {elapsed:.1f}s "
          f"(~{elapsed/max(1,done):.2f}s/call)", file=sys.stderr)


if __name__ == "__main__":
    main()
