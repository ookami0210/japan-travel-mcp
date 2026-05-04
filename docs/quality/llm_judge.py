#!/usr/bin/env python3
"""
LLM-judge scoring of quality test results.

Uses Claude (Sonnet 4.6) to assign each test case a 0/1/2 score against the
our rubric:
  2 — strong: the tool returned what a human would have hand-picked
  1 — partial: returned something useful but missed the central asset
  0 — empty / off-topic

Reads docs/quality/test_results.jsonl + docs/quality/test_calls.json,
writes:
  - docs/quality/test_results_scored.jsonl (one scored line per case)
  - docs/quality/SCORING_REPORT.md (markdown summary)

Run:
  ANTHROPIC_API_KEY=... python3 docs/quality/llm_judge.py
  python3 docs/quality/llm_judge.py --new-tools     # score the 11-case suite

Cost: ~100 calls × ~3k input tokens × $3/Mtok = ~$0.90 per full 100-case run
on Sonnet 4.6. Caching the system prompt cuts repeat-run cost.
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

JUDGE_SYSTEM = """You are scoring tool responses from the japan-travel-mcp server.

The server is an OSS Japan tourism data MCP. Its tools take a query and
return structured JSON; we are checking whether the response would help a
human researcher / agent answer the user's intent.

Score each case on a 0/1/2 rubric:

  2 (strong)  — The response contains what a human would have hand-picked
                as the right answer. The central / canonical assets for the
                query are clearly present in the top results, with enough
                metadata (source URL, names, descriptions) that a downstream
                agent could trust and surface them. For aggregator tools
                returning many items, top-3 should include the obvious
                candidates.

  1 (partial) — The response contains relevant material but misses the
                central asset, OR returns very generic content (admin pages,
                "site search" stubs, navigation shells), OR the right
                content is buried in noise rather than ranked at the top.

  0 (empty / off-topic) — Empty result list, error, or the tool returned
                content unrelated to the query intent.

Important calibration notes:
  - Empty list count=0 with a clear hint about why is **0** unless the
    query was for something the corpus genuinely doesn't designate (in
    which case the empty result IS the correct answer → 1 or 2).
  - Pages with names like "サイト内検索", "イベント案内", or generic
    navigation labels are noise → cap at 1 even if they technically match.
  - DMO / designation-system tools that simply return all the rows for a
    valid filter should score 2 if the count matches the official source.
  - Cross-lingual queries (Korean/English query, Japanese content) score
    based on whether the *content* is correct, not whether the *language*
    matched.

Return ONLY a JSON object, no prose: {"score": 0|1|2, "reason": "<≤60 words>"}"""


# Rubric v2 — "AI agent usefulness" framing (confirmed 2026-05-02).
# Same 0/1/2 scale, but the bar for 2 is "an AI agent receiving this
# can produce a useful answer for the end user" rather than "the
# canonical asset is in the top results".
#
# Why the change: vector embeddings + DMO regional-positioning data add
# signals beyond exact-name matching. A response that surfaces a
# substantively-related regional alternative — and frames it honestly
# ('this isn't the most famous, but here are similar items from the
# region') — is *useful* to a downstream AI agent even when it doesn't
# return the textbook answer.
#
# The MCP server's job is comprehensiveness + neutrality; the user-side
# service judges fit. We score how well the response equips the agent.
JUDGE_SYSTEM_V2 = """You are scoring tool responses from the japan-travel-mcp server.

The server is an OSS Japan tourism data MCP. Its tools return structured JSON
that AI agents (Claude / GPT / Gemini etc.) consume to answer end-user
questions about Japan tourism.

We score each response on whether it equips the AI agent to give a
useful end-user answer. Comprehensiveness + neutrality are the server's
goals — quality judgement is the agent's job, not the server's.

Score each case on a 0/1/2 rubric:

  2 (useful)  — An AI agent can produce a useful answer for the end user
                from this response. EITHER:
                (a) the central / canonical asset is present, OR
                (b) substantively-related regional alternatives are present
                    with enough metadata that the agent can surface them
                    honestly (e.g. "X is not formally designated as a
                    famous regional dish, but here are similar fermented
                    foods from the area: ...").
                Honest framing of "less famous, here is what we have"
                still earns 2 if it would equip the agent.

  1 (partial) — The response has some relevance but the agent would need
                additional retrieval / clarification before responding.
                OR the right content is buried under noise that an agent
                without filtering would surface inappropriately.

  0 (off-topic / unhelpful) — The agent gets stuck (empty result, error,
                or content so unrelated that surfacing it would mislead
                the user). Pure error responses are 0; empty-but-correct
                "no formal designation exists for X" responses are 1 or 2
                depending on whether they hint at alternatives.

Important calibration:
  - Generic admin/nav pages ("サイト内検索", "MAIN MENU", encoding
    garbage) in TOP results = 0 or 1 (agent would surface noise to user)
  - Vector-retrieval matches that are off-region but topically aligned:
    1 if there's no regional context, 2 if region is clearly tagged
  - Designation-system tools (DMO / GI / Heritage etc.) returning the
    full filter result = 2 if count matches the authority

Return ONLY a JSON object, no prose: {"score": 0|1|2, "reason": "<≤60 words>"}"""

JUDGE_USER_TPL = """Test case:
ID: {id}
Topic / intent: {topic}
Query: {query}
Tool called: {tool}({args})

Response (truncated to 4000 chars):
```
{response}
```

Score this case (0/1/2) and return JSON only."""


def load_calls(path: Path) -> dict:
    cases = json.loads(path.read_text())
    return {c["id"]: c for c in cases}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--new-tools", action="store_true",
                        help="Score the 11-case new-tools corpus instead of the 100-case set")
    parser.add_argument("--label", default="post-scrape",
                        help="Label this run (e.g. 'pre-scrape', 'post-scrape'). "
                             "Used in the report title and the output filename suffix.")
    parser.add_argument("--rubric", choices=["v1", "v2"], default="v1",
                        help="v1: original 'canonical asset matching' rubric. "
                             "v2: 'AI-agent usefulness' rubric (confirmed 2026-05-02). "
                             "v2 credits semantic alternatives + honest framing.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Print prompts but don't call API")
    args = parser.parse_args()

    label_slug = re.sub(r"[^a-z0-9]+", "_", args.label.lower()).strip("_") or "run"
    rubric_suffix = "" if args.rubric == "v1" else f".{args.rubric}"
    full_label = f"{label_slug}{rubric_suffix}"
    judge_system = JUDGE_SYSTEM if args.rubric == "v1" else JUDGE_SYSTEM_V2
    if args.new_tools:
        results_path = REPO / "docs" / "quality" / "test_results_new_tools.jsonl"
        calls_path = REPO / "docs" / "quality" / "test_calls_new_tools.json"
        scored_path = REPO / "docs" / "quality" / f"test_results_new_tools_scored.{full_label}.jsonl"
        report_path = REPO / "docs" / "quality" / f"SCORING_REPORT_NEW_TOOLS.{full_label}.md"
        case_total = 22  # 11 cases × 2pts max
    else:
        results_path = REPO / "docs" / "quality" / "test_results.jsonl"
        calls_path = REPO / "docs" / "quality" / "test_calls.json"
        scored_path = REPO / "docs" / "quality" / f"test_results_scored.{full_label}.jsonl"
        report_path = REPO / "docs" / "quality" / f"SCORING_REPORT.{full_label}.md"
        case_total = 200  # 100 cases × 2pts max

    if not results_path.exists():
        sys.exit(f"missing {results_path}")
    calls = load_calls(calls_path) if calls_path.exists() else {}

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        sys.exit("ANTHROPIC_API_KEY env var required")

    client = anthropic.Anthropic(api_key=api_key) if not args.dry_run else None

    scored = []
    raw_lines = results_path.read_text().splitlines()
    for i, line in enumerate(raw_lines, 1):
        if not line.strip():
            continue
        rec = json.loads(line)
        cid = rec.get("id", f"case-{i}")
        meta = calls.get(cid, {})
        topic = rec.get("topic") or meta.get("intent") or meta.get("topic") or ""
        query = rec.get("query") or json.dumps(rec.get("args", {}), ensure_ascii=False)
        tool = rec.get("tool", "?")
        argstr = json.dumps(rec.get("args", {}), ensure_ascii=False)

        result = rec.get("result", {})
        if result.get("ok") and "response" in result:
            response_str = json.dumps(result["response"], ensure_ascii=False, indent=2)[:4000]
        elif "response_raw" in result:
            response_str = result["response_raw"][:4000]
        else:
            response_str = json.dumps(result, ensure_ascii=False, indent=2)[:4000]

        prompt = JUDGE_USER_TPL.format(
            id=cid, topic=topic, query=query, tool=tool, args=argstr,
            response=response_str,
        )
        if args.dry_run:
            print(f"--- {cid} ---")
            print(prompt[:600])
            scored.append({**rec, "score": None, "reason": "dry-run"})
            continue

        # Up to 3 retries on transient failures
        last_err = None
        score = None
        reason = None
        for attempt in range(3):
            try:
                resp = client.messages.create(
                    model="claude-sonnet-4-5",
                    max_tokens=400,
                    system=[
                        {"type": "text", "text": judge_system, "cache_control": {"type": "ephemeral"}},
                    ],
                    messages=[{"role": "user", "content": prompt}],
                )
                txt = resp.content[0].text.strip()
                m = re.search(r'\{.*\}', txt, re.S)
                if not m:
                    raise ValueError(f"no json in: {txt[:200]}")
                data = json.loads(m.group(0))
                score = int(data["score"])
                reason = str(data.get("reason", ""))[:300]
                break
            except Exception as e:
                last_err = e
                time.sleep(2 ** attempt)
        if score is None:
            print(f"  [{i:3d}] {cid} judge_failed: {last_err}", file=sys.stderr)
            scored.append({**rec, "score": None, "reason": f"judge_failed: {last_err}"})
        else:
            print(f"  [{i:3d}] {cid} score={score}", file=sys.stderr)
            scored.append({**rec, "score": score, "reason": reason})

    # Write scored jsonl
    with scored_path.open("w") as f:
        for s in scored:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"wrote {scored_path}", file=sys.stderr)

    # Build markdown report
    write_report(scored, report_path, case_total, args.new_tools, args.label, args.rubric)


def write_report(scored: list[dict], path: Path, case_total: int, new_tools: bool, label: str, rubric: str) -> None:
    n = len(scored)
    counts = {0: 0, 1: 0, 2: 0, None: 0}
    for s in scored:
        counts[s.get("score")] = counts.get(s.get("score"), 0) + 1

    raw_total = counts[2] * 2 + counts[1]
    pct = (raw_total / case_total) * 100 if case_total else 0

    rubric_tag = "rubric v1 — canonical-asset" if rubric == "v1" else "rubric v2 — AI-agent usefulness"
    title = (
        f"Quality test scoring — new-tools ({label}, {rubric_tag})"
        if new_tools
        else f"Quality test scoring — 100-case ({label}, {rubric_tag})"
    )

    lines = [
        f"# {title}",
        "",
        f"Generated: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}",
        f"Cases: {n}",
        f"Judge: claude-sonnet-4-5 (LLM judge against our 0/1/2 rubric)",
        "",
        "## Totals",
        "",
        f"- score-2 (strong):  **{counts[2]:>3d}** / {n}",
        f"- score-1 (partial): **{counts[1]:>3d}** / {n}",
        f"- score-0 (off):     **{counts[0]:>3d}** / {n}",
        f"- judge-failed:      {counts[None]} / {n}",
        "",
        f"**Raw points: {raw_total} / {case_total} ({pct:.1f}%)**",
        "",
        "## Per-case detail",
        "",
        "| ID | Tool | Score | Reason |",
        "|:---|:-----|:-----:|:-------|",
    ]
    for s in scored:
        reason = (s.get("reason") or "").replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {s.get('id','?')} | {s.get('tool','?')} | "
            f"{s.get('score') if s.get('score') is not None else '?'} | {reason[:140]} |"
        )

    path.write_text("\n".join(lines) + "\n")
    print(f"wrote {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
