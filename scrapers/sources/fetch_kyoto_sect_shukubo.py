#!/usr/bin/env python3
"""Fetch Kyoto-area sect-affiliated shukubo (temple-lodging) facilities.

Background: Wikidata anchor (#30) only catches shukubo entities that
already exist as Wikidata items, which leaves Kyoto's per-sect lodging
facilities (和順会館 / 御室会館 / 智積院会館 / 同朋会館 etc.) as a
data gap — none of them have a Wikidata QID. Fetching the official
facility pages directly closes that gap.

Source policy: each entry's URL is the operator-published facility
page. We capture only metadata that the operator itself publishes
(title, description, address, phone). No third-party reviews, no
ratings.

Output: data/r3/kyoto_sect_shukubo.json
Schema: { source, authority, fetched_at, count, records:[{...}] }
"""

from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
OUT_FILE = REPO_ROOT / "data" / "r3" / "kyoto_sect_shukubo.json"
USER_AGENT = "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)"

# Operator-published shukubo facility pages. The list is anchored to
# the head temple ("総本山" / "大本山") of each sect, as identified by
# the sect's own self-published canonical page; the lodging facility
# linked from those pages is what we fetch. New facilities should only
# be added when the head temple's official page surfaces a link to
# them — we are not free to invent affiliations.
TARGETS: list[dict[str, str]] = [
    {
        "sect_ja": "浄土宗",
        "head_temple_ja": "知恩院",
        "head_temple_en": "Chion-in",
        "head_temple_url": "https://www.chion-in.or.jp/",
        "facility_url": "https://www.wajun-kaikan.jp/",
        "facility_name_ja": "知恩院 和順会館",
    },
    {
        "sect_ja": "天台宗",
        "head_temple_ja": "比叡山延暦寺",
        "head_temple_en": "Enryaku-ji",
        "head_temple_url": "https://www.hieizan.or.jp/",
        "facility_url": "https://syukubo.jp/",
        "facility_name_ja": "比叡山延暦寺 延暦寺会館",
    },
    {
        "sect_ja": "黄檗宗",
        "head_temple_ja": "萬福寺",
        "head_temple_en": "Manpuku-ji",
        "head_temple_url": "https://www.obakusan.or.jp/",
        "facility_url": "https://www.obakusan.or.jp/zen/yuyusou/",
        "facility_name_ja": "萬福寺 悠悠荘",
    },
]


# Sites whose lodging facility we know to exist but whose canonical URL
# could not be confirmed automatically in this pass. We record them as
# `pending_url_confirm` records so the data layer carries the operator
# identity even when the fetch fails. A future revision will re-survey
# the head temple's own page to surface the correct facility URL and
# move these entries up to the active TARGETS list.
PENDING: list[dict[str, str]] = [
    {
        "sect_ja": "真言宗御室派",
        "head_temple_ja": "仁和寺",
        "head_temple_en": "Ninna-ji",
        "head_temple_url": "https://ninnaji.jp/",
        "facility_name_ja": "仁和寺 御室会館",
    },
    {
        "sect_ja": "真言宗智山派",
        "head_temple_ja": "智積院",
        "head_temple_en": "Chishaku-in",
        "head_temple_url": "https://chisan.or.jp/",
        "facility_name_ja": "智積院 宿坊・智積院会館",
    },
    {
        "sect_ja": "浄土真宗本願寺派",
        "head_temple_ja": "本願寺（西本願寺）",
        "head_temple_en": "Nishi-Honganji",
        "head_temple_url": "https://www.hongwanji.or.jp/",
        "facility_name_ja": "本願寺 聞法会館",
    },
    {
        "sect_ja": "真宗大谷派",
        "head_temple_ja": "真宗本廟（東本願寺）",
        "head_temple_en": "Higashi-Honganji",
        "head_temple_url": "https://www.higashihonganji.or.jp/",
        "facility_name_ja": "東本願寺 同朋会館",
    },
    {
        "sect_ja": "臨済宗妙心寺派",
        "head_temple_ja": "妙心寺",
        "head_temple_en": "Myoshin-ji",
        "head_temple_url": "https://www.myoshinji.or.jp/",
        "facility_name_ja": "妙心寺 塔頭の宿坊",
    },
    {
        "sect_ja": "臨済宗大徳寺派",
        "head_temple_ja": "大徳寺",
        "head_temple_en": "Daitoku-ji",
        "head_temple_url": "https://daitokuji.com/",
        "facility_name_ja": "大徳寺 塔頭の宿坊（瑞峯院・大仙院ほか）",
    },
]

TITLE_RE = re.compile(r"<title[^>]*>(.*?)</title>", re.S | re.I)
META_RE = re.compile(
    r'<meta[^>]+name="description"[^>]*content="([^"]+)"', re.I,
)
META_RE_REV = re.compile(
    r'<meta[^>]+content="([^"]+)"[^>]*name="description"', re.I,
)
OG_TITLE_RE = re.compile(
    r'<meta[^>]+property="og:title"[^>]*content="([^"]+)"', re.I,
)
OG_DESC_RE = re.compile(
    r'<meta[^>]+property="og:description"[^>]*content="([^"]+)"', re.I,
)
TEL_RE = re.compile(r"(?:TEL|Tel|tel|電話)[\s:：]*\(?(\d[\d\-\s\(\)]{8,20})", re.I)
ADDR_RE = re.compile(
    r"〒?\s*(\d{3}[-－]\d{4})\s*([^<\n]{6,80}?)(?:</|\n|電話|TEL|Tel)",
    re.S,
)
WS_RE = re.compile(r"\s+")


def _clean(text: str) -> str:
    return WS_RE.sub(" ", text.strip())


def _fetch(url: str, sleep_seconds: float) -> str | None:
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    req = urllib.request.Request(
        url, headers={"User-Agent": USER_AGENT, "Accept-Language": "ja,en;q=0.7"},
    )
    try:
        with opener.open(req, timeout=20) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            body = resp.read().decode(charset, errors="replace")
        time.sleep(sleep_seconds)
        return body
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as exc:
        sys.stderr.write(f"warn: fetch failed {url}: {exc}\n")
        return None


def _extract(target: dict[str, str], html: str) -> dict[str, object]:
    title_match = TITLE_RE.search(html)
    title_html = _clean(title_match.group(1)) if title_match else ""
    og_title_match = OG_TITLE_RE.search(html)
    og_title = _clean(og_title_match.group(1)) if og_title_match else ""

    desc_match = META_RE.search(html) or META_RE_REV.search(html)
    desc = _clean(desc_match.group(1)) if desc_match else ""
    og_desc_match = OG_DESC_RE.search(html)
    og_desc = _clean(og_desc_match.group(1)) if og_desc_match else ""

    tel_match = TEL_RE.search(html)
    tel = _clean(tel_match.group(1)) if tel_match else None

    addr_match = ADDR_RE.search(html)
    address = None
    postal = None
    if addr_match:
        postal = addr_match.group(1)
        address = _clean(addr_match.group(2))

    return {
        "sect_ja": target["sect_ja"],
        "head_temple_ja": target["head_temple_ja"],
        "head_temple_en": target["head_temple_en"],
        "head_temple_url": target["head_temple_url"],
        "facility_name_ja": target["facility_name_ja"],
        "facility_url": target["facility_url"],
        "page_title": title_html or og_title,
        "page_title_og": og_title,
        "page_description": desc or og_desc,
        "page_description_og": og_desc,
        "phone": tel,
        "postal_code": postal,
        "address_ja": address,
        "kinds": ["shukubo", "buddhist_temple"],
        "prefecture_ja": "京都府"
        if target["facility_url"].startswith(
            ("https://www.wajun-kaikan.jp/",
             "https://www.omuro-kaikan.jp/",
             "https://chisan.or.jp/",
             "https://monbo.jp/",
             "https://www.higashihonganji.or.jp/",
             "https://www.myoshinji.or.jp/",
             "https://daitokuji.or.jp/",
             "https://syukubo.jp/",
             "https://www.obakusan.or.jp/")
        )
        else None,
        "source_url": target["facility_url"],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--sleep", type=float, default=5.0,
        help="seconds between requests (default: 5.0 — DATA_POLICY floor)",
    )
    args = parser.parse_args()

    records: list[dict[str, object]] = []
    for target in TARGETS:
        sys.stderr.write(
            f"fetching {target['facility_name_ja']} ({target['facility_url']})…\n"
        )
        html = _fetch(target["facility_url"], args.sleep)
        if not html:
            rec = {
                "sect_ja": target["sect_ja"],
                "head_temple_ja": target["head_temple_ja"],
                "head_temple_en": target["head_temple_en"],
                "head_temple_url": target["head_temple_url"],
                "facility_name_ja": target["facility_name_ja"],
                "facility_url": target["facility_url"],
                "fetch_status": "error",
                "source_url": target["facility_url"],
                "kinds": ["shukubo", "buddhist_temple"],
                "prefecture_ja": "京都府",
            }
            records.append(rec)
            continue
        rec = _extract(target, html)
        rec["fetch_status"] = "ok"
        records.append(rec)

    # Append pending entries (operator known, canonical URL unconfirmed).
    for pending in PENDING:
        rec = {
            "sect_ja": pending["sect_ja"],
            "head_temple_ja": pending["head_temple_ja"],
            "head_temple_en": pending["head_temple_en"],
            "head_temple_url": pending["head_temple_url"],
            "facility_name_ja": pending["facility_name_ja"],
            "facility_url": None,
            "fetch_status": "pending_url_confirm",
            "source_url": pending["head_temple_url"],
            "kinds": ["shukubo", "buddhist_temple"],
            "prefecture_ja": "京都府",
        }
        records.append(rec)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    out = {
        "source": "kyoto_sect_shukubo",
        "authority": "各宗派 公式 (per-temple operator pages)",
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "user_agent": USER_AGENT,
        "count": len(records),
        "records": records,
    }
    OUT_FILE.write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    sys.stderr.write(
        f"wrote {OUT_FILE} ({len(records)} facilities)\n",
    )


if __name__ == "__main__":
    main()
