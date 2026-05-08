#!/usr/bin/env python3
"""Fetch 文化庁 国指定文化財等データベース (kunishitei.bunka.go.jp).

Approach: the public form posts to /bsys/searchlist with a CSRF token and
session cookie. Pagination uses `pageNumber=N` (not the always-1
`page_no` field). Each result page contains:

  - <a href="/heritage/detail/<kind_code>/<entry_id>">name</a>
  - mapChange('<kind_code>', '<entry_id>', <lat>, <lng>) — coordinates
    inline in the JS handler. "Array" is emitted when coords are absent.
  - Result table cells: [icon, name, kind_jp, classification, era,
    prefecture_jp, map_link]

We iterate over every `register_sub_id` (designation type), paginate
until empty, dedupe by entry_id, and persist:

  - data/_state/bunka_kunishitei.partial/<register_sub_id>.json
    (per-type checkpoint so the script can resume)
  - data/r3/bunka_kunishitei.json (final aggregate)

Per-domain rate limit: 5 s between requests (ADR / DATA_POLICY default).
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
STATE_DIR = REPO_ROOT / "data" / "_state" / "bunka_kunishitei.partial"
OUT_FILE = REPO_ROOT / "data" / "r3" / "bunka_kunishitei.json"
USER_AGENT = "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)"
INDEX_URL = "https://kunishitei.bunka.go.jp/bsys/index"
SEARCH_URL = "https://kunishitei.bunka.go.jp/bsys/searchlist"

# 20 designation type codes from the kunishitei DB form.
DESIGNATION_TYPES: list[dict[str, str]] = [
    {"code": "102", "ja": "国宝・重要文化財（建造物）",
     "en": "National Treasure / Important Cultural Property (architectural)"},
    {"code": "101", "ja": "登録有形文化財（建造物）",
     "en": "Registered Tangible Cultural Property (architectural)"},
    {"code": "201", "ja": "国宝・重要文化財（美術工芸品）",
     "en": "National Treasure / Important Cultural Property (fine art)"},
    {"code": "211", "ja": "登録有形文化財（美術工芸品）",
     "en": "Registered Tangible Cultural Property (fine art)"},
    {"code": "202", "ja": "登録美術品", "en": "Registered Art Object"},
    {"code": "301", "ja": "重要有形民俗文化財",
     "en": "Important Tangible Folk Cultural Property"},
    {"code": "311", "ja": "登録有形民俗文化財",
     "en": "Registered Tangible Folk Cultural Property"},
    {"code": "302", "ja": "重要無形民俗文化財",
     "en": "Important Intangible Folk Cultural Property"},
    {"code": "322", "ja": "登録無形民俗文化財",
     "en": "Registered Intangible Folk Cultural Property"},
    {"code": "312", "ja": "記録作成等の措置を講ずべき無形の民俗文化財",
     "en": "Intangible Folk Cultural Property requiring documentation"},
    {"code": "303", "ja": "重要無形文化財",
     "en": "Important Intangible Cultural Property"},
    {"code": "323", "ja": "登録無形文化財",
     "en": "Registered Intangible Cultural Property"},
    {"code": "313", "ja": "記録作成等の措置を講ずべき無形文化財",
     "en": "Intangible Cultural Property requiring documentation"},
    {"code": "304", "ja": "選定保存技術", "en": "Selected Conservation Technique"},
    {"code": "401", "ja": "史跡名勝天然記念物",
     "en": "Historic Site / Place of Scenic Beauty / Natural Monument"},
    {"code": "411", "ja": "登録記念物", "en": "Registered Monument"},
    {"code": "412", "ja": "重要文化的景観",
     "en": "Important Cultural Landscape"},
    {"code": "103", "ja": "重要伝統的建造物群保存地区",
     "en": "Important Preservation District for Groups of Traditional Buildings"},
    {"code": "901", "ja": "世界遺産", "en": "World Heritage"},
]

CSRF_RE = re.compile(
    r'name="_csrfToken" autocomplete="off" value="([a-f0-9]+)"'
)
ANCHOR_RE = re.compile(
    r'<a[^>]+href="(/heritage/detail/(\d+)/(\d+))"[^>]*>([^<]+)</a>',
    re.S,
)
MAP_RE = re.compile(
    r"mapChange\(\s*'(\d+)'\s*,\s*'(\d+)'\s*,\s*([\d\.]+|Array)\s*,\s*([\d\.]+|Array)\)"
)
TABLE_RE = re.compile(r"<table[^>]*>(.*?)</table>", re.S)
TR_RE = re.compile(r"<tr[^>]*>(.*?)</tr>", re.S)
TD_RE = re.compile(r"<t[dh][^>]*>(.*?)</t[dh]>", re.S)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    return WS_RE.sub(" ", TAG_RE.sub("", text)).strip()


def _build_opener() -> urllib.request.OpenerDirector:
    cj = http.cookiejar.CookieJar()
    return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))


def _fetch_csrf(opener: urllib.request.OpenerDirector) -> str:
    req = urllib.request.Request(INDEX_URL, headers={"User-Agent": USER_AGENT})
    body = opener.open(req).read().decode("utf-8", errors="replace")
    m = CSRF_RE.search(body)
    if not m:
        raise RuntimeError("could not extract _csrfToken from index page")
    return m.group(1)


def _post(
    opener: urllib.request.OpenerDirector,
    csrf: str,
    register_sub_id: str,
    page_number: int,
) -> str:
    body = urllib.parse.urlencode({
        "_method": "POST",
        "_csrfToken": csrf,
        "screen_id": "index",
        "page_no": "1",
        "register_sub_id": register_sub_id,
        "sortTarget": "area",
        "sortType": "asc",
        "pageNumber": str(page_number),
    }).encode("utf-8")
    req = urllib.request.Request(
        SEARCH_URL,
        data=body,
        headers={
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        method="POST",
    )
    return opener.open(req).read().decode("utf-8", errors="replace")


def _parse_page(html: str, register_sub_id: str) -> list[dict[str, object]]:
    """Parse a single result page into a list of records.

    The result table is the largest table on the page and uses the column
    layout [icon, name, kind_jp, classification, era, prefecture_jp,
    map_link]. We use the anchor + mapChange regexes to assemble the
    record list, then fall back on table-row scanning to fill in
    classification / era / prefecture for matching entry_ids.
    """
    coords: dict[str, tuple[str | None, str | None]] = {}
    for kind, entry, lat, lng in MAP_RE.findall(html):
        if kind != register_sub_id:
            continue
        coords[entry] = (
            lat if lat != "Array" else None,
            lng if lng != "Array" else None,
        )

    extras: dict[str, dict[str, str]] = {}
    for table in TABLE_RE.findall(html):
        rows = TR_RE.findall(table)
        if len(rows) <= 2:
            continue
        for row in rows:
            cells = TD_RE.findall(row)
            if len(cells) < 6:
                continue
            entry_match = re.search(
                r"href=\"/heritage/detail/(\d+)/(\d+)\"", row
            )
            if not entry_match:
                continue
            entry = entry_match.group(2)
            extras[entry] = {
                "kind_jp": _clean(cells[2]),
                "classification_jp": _clean(cells[3]),
                "era_jp": _clean(cells[4]),
                "prefecture_jp": _clean(cells[5]),
            }

    seen: set[str] = set()
    records: list[dict[str, object]] = []
    for href, kind, entry, name in ANCHOR_RE.findall(html):
        if kind != register_sub_id or entry in seen:
            continue
        seen.add(entry)
        cleaned_name = _clean(name)
        if not cleaned_name:
            continue
        ex = extras.get(entry, {})
        lat, lng = coords.get(entry, (None, None))
        records.append({
            "entry_id": entry,
            "register_sub_id": register_sub_id,
            "name_ja": cleaned_name,
            "kind_jp": ex.get("kind_jp"),
            "classification_jp": ex.get("classification_jp"),
            "era_jp": ex.get("era_jp"),
            "prefecture_jp": ex.get("prefecture_jp"),
            "lat": lat,
            "lng": lng,
            "source_url": "https://kunishitei.bunka.go.jp" + href,
        })
    return records


def _fetch_designation_type(
    opener: urllib.request.OpenerDirector,
    csrf: str,
    designation: dict[str, str],
    sleep_seconds: float,
    max_pages: int,
) -> list[dict[str, object]]:
    code = designation["code"]
    sys.stderr.write(
        f"[{code}] {designation['ja']} — fetching pages…\n",
    )
    seen_entries: set[str] = set()
    accum: list[dict[str, object]] = []
    for page in range(1, max_pages + 1):
        html = _post(opener, csrf, code, page)
        records = _parse_page(html, code)
        new_records = [r for r in records if r["entry_id"] not in seen_entries]
        if not new_records:
            sys.stderr.write(
                f"[{code}] page {page}: no new records — terminating "
                f"({len(seen_entries)} total)\n",
            )
            break
        for rec in new_records:
            seen_entries.add(rec["entry_id"])  # type: ignore[arg-type]
            accum.append(rec)
        sys.stderr.write(
            f"[{code}] page {page}: +{len(new_records)} (running {len(accum)})\n",
        )
        time.sleep(sleep_seconds)
    return accum


def _persist_partial(code: str, records: list[dict[str, object]]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / f"{code}.json"
    path.write_text(
        json.dumps({"register_sub_id": code, "records": records},
                   ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _load_partial(code: str) -> list[dict[str, object]] | None:
    path = STATE_DIR / f"{code}.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("records", [])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--only", help="comma-separated register_sub_id codes; default = all",
    )
    parser.add_argument(
        "--max-pages", type=int, default=2000,
        help="safety cap on pages per designation type (default: 2000)",
    )
    parser.add_argument(
        "--sleep", type=float, default=5.0,
        help="seconds between requests (default: 5.0 — DATA_POLICY floor)",
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="skip designation types that already have a partial file",
    )
    args = parser.parse_args()

    requested: list[dict[str, str]] = DESIGNATION_TYPES
    if args.only:
        wanted = set(args.only.split(","))
        requested = [d for d in DESIGNATION_TYPES if d["code"] in wanted]

    opener = _build_opener()
    csrf = _fetch_csrf(opener)

    aggregate: list[dict[str, object]] = []
    for d in requested:
        code = d["code"]
        cached = _load_partial(code) if args.resume else None
        if cached is not None:
            sys.stderr.write(
                f"[{code}] resuming from partial — {len(cached)} records "
                f"already on disk\n",
            )
            aggregate.extend(cached)
            continue
        records = _fetch_designation_type(
            opener, csrf, d, args.sleep, args.max_pages,
        )
        _persist_partial(code, records)
        aggregate.extend(records)
        # Refresh CSRF every designation type to avoid session expiry.
        try:
            csrf = _fetch_csrf(opener)
        except (urllib.error.URLError, RuntimeError) as exc:
            sys.stderr.write(f"warn: csrf refresh failed: {exc}\n")

    # Aggregate write
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "source": "bunka_kunishitei",
        "authority": "文化庁 (Agency for Cultural Affairs)",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "endpoint": SEARCH_URL,
        "user_agent": USER_AGENT,
        "designation_types": DESIGNATION_TYPES,
        "count": len(aggregate),
        "records": aggregate,
    }
    OUT_FILE.write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    sys.stderr.write(
        f"wrote {OUT_FILE} ({len(aggregate)} records across "
        f"{len(requested)} designation types)\n",
    )


if __name__ == "__main__":
    main()
