#!/usr/bin/env python3
"""
Backfill Wikidata short descriptions (en + ja) and sitelink titles into
master attractions that currently lack them.

Path 1 (en): if a master entry lacks description_en AND Wikidata has an
English description, set description_en. Non-destructive: existing
description_en values win.

Path 2 (ja): unconditionally set description_ja from Wikidata when
absent on master AND present in source. The ja description fills a real
gap — only ~1.6% of master entries had description_ja before.

Path 3 (sitelinks): record enwiki_title / jawiki_title under the
optional `wikipedia_titles` field for entries that have either. Used by
future enrichment passes (Wikipedia REST summary fetch / e5 embedding
rebuild) to map QID → article title without re-querying Wikidata.

Run:
  python3 scripts/inject_wikidata_descriptions.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SRC = REPO / "data/_state/wikidata_descriptions.json"
PREFS = REPO / "data/prefectures"

CODE_TO_SLUG = {
    "01": "hokkaido", "02": "aomori", "03": "iwate", "04": "miyagi", "05": "akita",
    "06": "yamagata", "07": "fukushima", "08": "ibaraki", "09": "tochigi", "10": "gunma",
    "11": "saitama", "12": "chiba", "13": "tokyo", "14": "kanagawa", "15": "niigata",
    "16": "toyama", "17": "ishikawa", "18": "fukui", "19": "yamanashi", "20": "nagano",
    "21": "gifu", "22": "shizuoka", "23": "aichi", "24": "mie", "25": "shiga",
    "26": "kyoto", "27": "osaka", "28": "hyogo", "29": "nara", "30": "wakayama",
    "31": "tottori", "32": "shimane", "33": "okayama", "34": "hiroshima", "35": "yamaguchi",
    "36": "tokushima", "37": "kagawa", "38": "ehime", "39": "kochi", "40": "fukuoka",
    "41": "saga", "42": "nagasaki", "43": "kumamoto", "44": "oita", "45": "miyazaki",
    "46": "kagoshima", "47": "okinawa",
}


def main() -> None:
    src = json.loads(SRC.read_text())
    incoming = src.get("records") or []
    by_qid_src = {r["qid"]: r for r in incoming if r.get("qid")}
    print(f"source: {len(by_qid_src)} backfill records")

    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    print(f"master: {len(items)} attractions")

    set_en = 0
    set_ja = 0
    set_titles = 0
    for a in items:
        qid = a.get("qid")
        if not qid:
            continue
        rec = by_qid_src.get(qid)
        if not rec:
            continue
        if not a.get("description_en") and rec.get("description_en"):
            a["description_en"] = rec["description_en"]
            set_en += 1
        if not a.get("description_ja") and rec.get("description_ja"):
            a["description_ja"] = rec["description_ja"]
            set_ja += 1
        en_title = rec.get("enwiki_title")
        ja_title = rec.get("jawiki_title")
        if en_title or ja_title:
            existing_titles = a.get("wikipedia_titles") or {}
            if en_title and not existing_titles.get("en"):
                existing_titles["en"] = en_title
            if ja_title and not existing_titles.get("ja"):
                existing_titles["ja"] = ja_title
            if existing_titles != a.get("wikipedia_titles"):
                a["wikipedia_titles"] = existing_titles
                set_titles += 1

    master["attractions"] = items
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(f"\nmaster updated:")
    print(f"  description_en  set: {set_en}")
    print(f"  description_ja  set: {set_ja}")
    print(f"  wikipedia_titles set: {set_titles}")

    # Per-pref propagation
    by_qid_master = {a["qid"]: a for a in items if a.get("qid")}
    pref_updated = 0
    for code, slug in CODE_TO_SLUG.items():
        path = PREFS / f"{slug}.json"
        if not path.exists():
            continue
        d = json.loads(path.read_text())
        existing = d.get("wikidata_attractions") or []
        changed = False
        for entry in existing:
            qid = entry.get("qid")
            if not qid:
                continue
            mrec = by_qid_master.get(qid)
            if not mrec:
                continue
            for field in ("description_en", "description_ja", "wikipedia_titles"):
                v = mrec.get(field)
                if v is not None and entry.get(field) != v:
                    entry[field] = v
                    changed = True
        if changed:
            d["wikidata_attractions"] = existing
            tmp_p = path.with_suffix(".json.new")
            tmp_p.write_text(json.dumps(d, ensure_ascii=False, indent=2))
            tmp_p.replace(path)
            pref_updated += 1
    print(f"per-pref files updated: {pref_updated} / 47")


if __name__ == "__main__":
    main()
