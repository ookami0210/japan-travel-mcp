#!/usr/bin/env python3
"""
Find DMO official-website URLs that the plan-PDF auto-extract missed.

confirmed 2026-05-02: brute-force this. The 300+ missing DMOs need
manual mapping; we use Claude with web_search to do it programmatically.

Pipeline:
  1. Read data/r3/dmo.json — list of all 350 DMOs.
  2. Read data/_state/dmo_website_overrides.json — what's already mapped.
  3. For each unmapped DMO whose existing data/dmo/<id>/pages.json carries
     note=no_homepage_url_found, ask Claude (Sonnet 4.5 with web_search)
     to find the org's official website.
  4. Save matches to dmo_website_overrides.json.

Run:
  ANTHROPIC_API_KEY=... python3 scrapers/sources/find_dmo_websites.py
  ANTHROPIC_API_KEY=... python3 scrapers/sources/find_dmo_websites.py --limit 20

Cost: ~$0.02-0.05 per DMO with web_search (Sonnet 4.5). Full 313 ≈ $5-15.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import anthropic  # type: ignore

REPO = Path(__file__).resolve().parents[2]
DMO_JSON = REPO / "data" / "r3" / "dmo.json"
OVERRIDES_PATH = REPO / "data" / "_state" / "dmo_website_overrides.json"
DMO_DIR = REPO / "data" / "dmo"

CONCURRENCY = 8
# Default to Sonnet 4.5 for the higher-stakes re-runs (confirmed 2026-05-02).
# Initial mass discovery used Haiku ($1.40 for 313 DMOs) and worked well; re-runs
# fix specific gaps so accuracy > cost matters.
MODEL = os.environ.get("DMO_DISCOVERY_MODEL", "claude-sonnet-4-5")

# Strict "official" definition (confirmed 2026-05-02). Tighter rules
# improve precision more than model upgrade does.
PROMPT_TEMPLATE = """Find the official tourism website URL for this Japanese DMO (Destination Management Organization, 観光地域づくり法人).

DMO name: {name}
Coverage area: {area}

Use web_search to identify the org's homepage. We want ONLY a URL that meets ALL of these criteria:

ACCEPT:
- The DMO's own promotional / tourism website (operated by or for the DMO itself)
- Domain typically contains: kanko / kankou / kankoh / travel / tourism / navi / visit / tabi / -trip
- Frequently uses .or.jp / .ne.jp / .jp / .com TLDs
- Page wording reads like a destination promotion site

REJECT (return null):
- City/town hall sites (city.*.jp, town.*.jp, *.lg.jp) UNLESS the page is unambiguously the DMO's own subpage
- mlit.go.jp / kankocho.go.jp (registry pages, not the DMO's site)
- Social media (facebook, twitter/x, instagram, youtube, line)
- Booking aggregators (jalan.net, rakuten, tabelog, tripadvisor, agoda, booking.com)
- Wikipedia / wikidata
- Generic prefecture sites that don't match this specific DMO
- Any URL where you have <60% confidence it's the right organisation's homepage

If unsure → return null. False positives are worse than missing entries.

Respond with ONLY one JSON object:
{{"url": "https://example.jp/", "confidence": "high|medium", "reasoning": "<≤30 words>"}}
or
{{"url": null, "confidence": "low", "reasoning": "<why no confident match>"}}"""


def load_dmo_list() -> list[dict[str, Any]]:
    return json.loads(DMO_JSON.read_text(encoding="utf-8"))["entries"]


def load_overrides() -> dict[str, str]:
    if not OVERRIDES_PATH.exists():
        return {}
    try:
        return json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")).get("overrides", {})
    except Exception:
        return {}


def save_overrides(overrides: dict[str, str]) -> None:
    payload = {
        "schema_version": 1,
        "_comment": (
            "Manual + Claude-discovered mapping of DMO id -> official website URL."
            " Filled progressively. See scrapers/sources/find_dmo_websites.py."
        ),
        "last_updated": "2026-05-02",
        "overrides": overrides,
    }
    OVERRIDES_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def needs_url(dmo_id: str, overrides: dict[str, str]) -> bool:
    if dmo_id in overrides:
        return False
    pages_path = DMO_DIR / dmo_id / "pages.json"
    if not pages_path.exists():
        return True
    try:
        d = json.loads(pages_path.read_text(encoding="utf-8"))
        return d.get("note") == "no_homepage_url_found"
    except Exception:
        return True


async def find_one(
    client: anthropic.AsyncAnthropic,
    dmo: dict[str, Any],
    sem: asyncio.Semaphore,
) -> tuple[str, str | None, str]:
    async with sem:
        area = (
            ", ".join(dmo.get("prefectures", []))
            + (" | " + ", ".join(dmo.get("municipalities", [])[:5])
               if dmo.get("municipalities") else "")
        )
        prompt = PROMPT_TEMPLATE.format(name=dmo["name"], area=area)
        try:
            resp = await client.messages.create(
                model=MODEL,
                max_tokens=400,
                tools=[{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}],
                messages=[{"role": "user", "content": prompt}],
            )
        except Exception as e:
            return (dmo["id"], None, f"api_error: {e}")

        # Find the assistant's last text block
        text_blocks = [
            b for b in resp.content
            if getattr(b, "type", None) == "text"
        ]
        if not text_blocks:
            return (dmo["id"], None, "no_text_response")
        txt = text_blocks[-1].text.strip()

        m = re.search(r"\{[\s\S]*?\}", txt)
        if not m:
            return (dmo["id"], None, f"no_json: {txt[:100]}")
        try:
            data = json.loads(m.group(0))
        except Exception:
            return (dmo["id"], None, f"json_parse: {m.group(0)[:100]}")

        url = data.get("url")
        if url and isinstance(url, str) and url.startswith("http"):
            return (dmo["id"], url, data.get("confidence", "?"))
        return (dmo["id"], None, data.get("reasoning", "no_url_in_response"))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key and not args.dry_run:
        sys.exit("ANTHROPIC_API_KEY required")

    dmos = load_dmo_list()
    overrides = load_overrides()
    pending = [d for d in dmos if needs_url(d["id"], overrides)]
    if args.limit:
        pending = pending[: args.limit]
    print(f"[find_dmo] {len(pending)} DMOs need URL discovery", file=sys.stderr)

    if args.dry_run:
        for d in pending[:10]:
            print(f"  would search: {d['id']}  {d['name']}", file=sys.stderr)
        return

    client = anthropic.AsyncAnthropic(api_key=api_key)
    sem = asyncio.Semaphore(CONCURRENCY)
    found = 0
    not_found = 0
    api_errors = 0
    flush_every = 10
    seen = 0

    tasks = [find_one(client, d, sem) for d in pending]
    for fut in asyncio.as_completed(tasks):
        dmo_id, url, info = await fut
        seen += 1
        if url:
            overrides[dmo_id] = url
            found += 1
            print(f"  [{seen:3d}/{len(pending)}] {dmo_id} → {url}  ({info})", file=sys.stderr)
        else:
            not_found += 1
            if "api_error" in (info or ""):
                api_errors += 1
            if seen % 25 == 0:
                print(f"  [{seen:3d}/{len(pending)}] {dmo_id} miss ({info[:60]})", file=sys.stderr)
        # Flush periodically so partial progress survives crashes
        if seen % flush_every == 0:
            save_overrides(overrides)

    save_overrides(overrides)
    print(
        f"[find_dmo] done — found={found} not_found={not_found} api_errors={api_errors}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    asyncio.run(main())
