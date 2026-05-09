#!/usr/bin/env python3
"""Compute deterministic (LLM-judge-free) quality metrics from a label's
test_results.jsonl.

Why: the LLM-graded rubric (intent_understanding / practical_usefulness
/ etc.) carries ±20pp Sat noise across Sonnet sessions. Mechanically-
checkable signals — JSON parse validity, response size, structured-
field coverage on the entity records — can be diff'd byte-for-byte
between runs and surface true regressions without judge variance.

Output: docs/quality/deterministic_metrics.<label>.json with:
  - per-case rows: id, tool, parse_validity, response_token_count,
    response_byte_count, item_count, structured_field_coverage,
    nav_chrome_share, has_truncation_note
  - aggregate KPI rows: parse_pass_rate, avg_token_count,
    avg_field_coverage, total_items_returned

Usage:
  python3 docs/quality/deterministic_metrics.py --label iter101-bunka-kunishitei
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# Per-entity fields we count toward structured_field_coverage. The list
# is anchored to the constraint-encodable fields the Solver track wants
# (DATA_SOURCES.md / project_japan_travel_mcp_research_0504.md). When a
# response surfaces these fields non-null, downstream LLMs can compose
# itineraries that respect time / location / budget / mobility.
ENTITY_FIELDS = [
    "coordinates",
    "opening_hours",
    "heritage_designations",
    "kinds",
    "wikipedia_kind_tags",
    "nearest_transit",
    "nearby_pois",
    "typical_visit_minutes",
    "price_band",
    "wheelchair",
    "phone",
    "website",
]

# Lists inside the response we walk for entity-level counts.
ITEM_LIST_KEYS = ["items", "results", "spots", "entities", "records", "events", "festivals"]

# Strings that suggest navigational / boilerplate content sneaked in
# (a recurring failure mode of the municipal scrape pipeline).
NAV_CHROME_RES = [
    re.compile(r"(クッキー|cookie\s*(consent|policy)|プライバシー|privacy\s*policy)", re.I),
    re.compile(r"(お問い合わせ|contact\s*us|お知らせ|news\s*&\s*topics|サイトマップ|sitemap)", re.I),
    re.compile(r"(ホーム\s*$|^\s*home\s*$|navigation\s*menu|skip\s*to\s*content)", re.I),
]


def estimate_tokens(text: str) -> int:
    """Rough char-to-token estimate (LLM-agnostic). 1 token ≈ 4 chars in
    English, ~1.5 chars per CJK character. We average across the two by
    using a 3.0 divisor — within ~25% of tiktoken on travel queries."""
    return max(1, int(len(text) / 3.0))


def coerce_response(rec: dict) -> dict | None:
    """Reach into the harness wrapper to find the actual MCP response."""
    if not isinstance(rec, dict):
        return None
    result = rec.get("result", rec)
    if isinstance(result, dict):
        resp = result.get("response", result)
        if isinstance(resp, dict):
            return resp
    return None


def walk_items(resp: dict) -> list[dict]:
    items: list[dict] = []
    for k in ITEM_LIST_KEYS:
        v = resp.get(k)
        if isinstance(v, list):
            for it in v:
                if isinstance(it, dict):
                    items.append(it)
    # Some tools (get_entity_full / get_description) return a single
    # entity at the top level — count that as one item.
    if not items and ("qid" in resp or "name_ja" in resp or "name" in resp):
        items.append(resp)
    return items


def field_coverage(items: list[dict]) -> float:
    if not items:
        return 0.0
    total_slots = len(items) * len(ENTITY_FIELDS)
    filled = 0
    for it in items:
        for f in ENTITY_FIELDS:
            v = it.get(f)
            if v is None:
                continue
            if isinstance(v, (list, dict, str)) and len(v) == 0:
                continue
            filled += 1
    return filled / total_slots


def nav_chrome_share(items: list[dict]) -> float:
    if not items:
        return 0.0
    hit = 0
    for it in items:
        name = (it.get("name") or it.get("name_ja") or "")
        desc = (it.get("description") or it.get("description_ja") or "")
        body = " ".join(it.get("body_paragraphs") or []) if isinstance(it.get("body_paragraphs"), list) else ""
        joined = f"{name}\n{desc}\n{body}"
        if any(r.search(joined) for r in NAV_CHROME_RES):
            hit += 1
    return hit / len(items)


def metric_for_case(rec: dict) -> dict:
    resp = coerce_response(rec)
    raw = json.dumps(rec.get("result", {}), ensure_ascii=False)
    parse_validity = resp is not None
    items = walk_items(resp) if resp else []
    return {
        "id": rec.get("id"),
        "tool": rec.get("tool"),
        "parse_validity": parse_validity,
        "response_byte_count": len(raw.encode("utf-8")),
        "response_token_count": estimate_tokens(raw),
        "item_count": len(items),
        "structured_field_coverage": round(field_coverage(items), 4),
        "nav_chrome_share": round(nav_chrome_share(items), 4),
        "has_truncation_note": bool(resp and resp.get("truncated")),
        "has_routing_hint": bool(resp and resp.get("routing_hint")),
        "has_query_intent": bool(resp and resp.get("query_intent")),
        "has_safety_keywords": bool(resp and resp.get("safety_keywords_detected")),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--label", required=True, help="iter label (matches test_results.<label>.jsonl)")
    args = parser.parse_args()

    src = REPO / f"docs/quality/test_results.{args.label}.jsonl"
    if not src.exists():
        # Some legacy labels were written without the iter prefix.
        alt = REPO / f"docs/quality/test_results.{args.label}.v3.jsonl"
        src = alt if alt.exists() else src
    if not src.exists():
        raise SystemExit(f"test_results not found for label {args.label}")

    rows: list[dict] = []
    for line in src.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rec = json.loads(line)
        rows.append(metric_for_case(rec))

    n = len(rows)
    if n == 0:
        raise SystemExit("no rows scored")
    summary = {
        "label": args.label,
        "case_count": n,
        "parse_pass_rate": round(sum(r["parse_validity"] for r in rows) / n, 4),
        "avg_response_token_count": round(sum(r["response_token_count"] for r in rows) / n, 1),
        "median_response_token_count": int(sorted(r["response_token_count"] for r in rows)[n // 2]),
        "avg_item_count": round(sum(r["item_count"] for r in rows) / n, 2),
        "avg_structured_field_coverage": round(
            sum(r["structured_field_coverage"] for r in rows) / n, 4
        ),
        "avg_nav_chrome_share": round(
            sum(r["nav_chrome_share"] for r in rows) / n, 4
        ),
        "truncation_note_rate": round(
            sum(r["has_truncation_note"] for r in rows) / n, 4
        ),
        "routing_hint_emit_rate": round(
            sum(r["has_routing_hint"] for r in rows) / n, 4
        ),
        "query_intent_emit_rate": round(
            sum(r["has_query_intent"] for r in rows) / n, 4
        ),
    }

    out_path = REPO / f"docs/quality/deterministic_metrics.{args.label}.json"
    out_path.write_text(
        json.dumps({"summary": summary, "rows": rows}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    # Print a one-line summary so the auto_loop log shows it.
    print(
        f"[deterministic] {args.label}: "
        f"parse={summary['parse_pass_rate']*100:.0f}% "
        f"avg_tokens={summary['avg_response_token_count']:.0f} "
        f"items={summary['avg_item_count']:.1f} "
        f"field_cov={summary['avg_structured_field_coverage']*100:.1f}% "
        f"chrome={summary['avg_nav_chrome_share']*100:.2f}% "
        f"hint_rate={summary['routing_hint_emit_rate']*100:.0f}%"
    )
    print(f"  wrote {out_path}")


if __name__ == "__main__":
    main()
