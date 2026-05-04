#!/usr/bin/env python3
"""
First-pass automated digest of each test result.
Outputs a markdown digest for the maintainer to review and score 0/1/2 by hand.
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
RESULTS = REPO / "docs" / "quality" / "test_results.jsonl"


def items_of(resp):
    """Pull a list of records from a tool response, regardless of which tool."""
    if not isinstance(resp, dict):
        return []
    for key in ("items", "spots", "hotels", "results"):
        if key in resp and isinstance(resp[key], list):
            return resp[key]
    return []


def digest_item(it, lang):
    """A short string summarising one item for human review."""
    if not isinstance(it, dict):
        return str(it)[:80]
    name = it.get("name") or it.get("title") or it.get("name_ja") or it.get("title_ja") or "?"
    nameja = it.get("name_ja") or it.get("title_ja") or ""
    src = it.get("source") or it.get("type") or "?"
    desc_lang = it.get("description") or it.get("summary") or it.get("body") or ""
    desc_ja = it.get("description_ja") or it.get("summary_ja") or it.get("body_ja") or ""
    desc = (desc_lang or desc_ja or "")[:80]
    pref = it.get("prefecture") or it.get("prefecture_code") or ""
    return f"[{src}] {name} ({nameja}) :: {desc} ({pref})"


def topic_hit(items, topic):
    """Naïve topic detection: any of the topic's keywords in name/desc?"""
    keywords = re.findall(r"[一-鿿]+|[a-zA-Z]+", topic)
    keywords = [k for k in keywords if len(k) >= 2]
    if not keywords:
        return False
    for it in items[:30]:
        if not isinstance(it, dict):
            continue
        text = json.dumps(it, ensure_ascii=False)
        if any(k in text for k in keywords):
            return True
    return False


def main():
    out_lines = ["# Test results digest (auto)\n"]
    levels = {"L1": [], "L2": [], "L3": [], "L4": []}

    with RESULTS.open() as f:
        for line in f:
            d = json.loads(line)
            level = d["level"]
            r = d.get("result", {})
            if not r.get("ok"):
                err = r.get("error", "?")
                summary = f"❌ ERROR: {err}"
                items = []
            elif "response_raw" in r:
                summary = f"⚠ raw text: {r['response_raw'][:200]}"
                items = []
            else:
                resp = r["response"]
                items = items_of(resp)
                if "error" in resp:
                    summary = f"⚠ tool error: {resp['error']}"
                else:
                    cnt = len(items)
                    hit = topic_hit(items, d["topic"])
                    summary = f"count={cnt}, topic_hit={hit}"
            block = [
                f"## {d['id']} [{d['lang']}] {d['topic']}",
                f"**Query**: {d['query']}",
                f"**Tool**: {d['tool']}({json.dumps(d['args'], ensure_ascii=False)})",
                f"**Summary**: {summary}",
            ]
            if items:
                block.append("**First 5 items:**")
                for it in items[:5]:
                    block.append(f"  - {digest_item(it, d['lang'])}")
            block.append("")
            levels[level].append("\n".join(block))

    for lvl in ["L1", "L2", "L3", "L4"]:
        out_lines.append(f"\n# {lvl} ({len(levels[lvl])} cases)\n")
        out_lines.extend(levels[lvl])

    digest = REPO / "docs" / "quality" / "test_digest.md"
    digest.write_text("\n".join(out_lines))
    print(f"Wrote {digest}")


if __name__ == "__main__":
    main()
