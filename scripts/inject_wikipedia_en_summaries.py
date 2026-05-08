#!/usr/bin/env python3
"""
Replace the short Wikidata description_en (typically a 5-25 char "type
of X" stub) on master attractions with the richer 1-2 sentence English
Wikipedia intro extract when available. Also records wikipedia_titles.en
on entries where it wasn't yet captured.

Source: data/_state/wikipedia_en_summaries.json (per QID + enwiki title +
extract). Only entries with non-empty extract are touched.

Heuristic upgrade rule: replace existing description_en only when the
Wikipedia extract is at least 1.4× longer. New description_en set on
entries that had none. Marks the source via
description_en_source = "en_wikipedia_intro" so downstream passes can
distinguish Wikipedia-extract entries from Wikidata-short ones.

Run:
  python3 scripts/inject_wikipedia_en_summaries.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SRC = REPO / "data/_state/wikipedia_en_summaries.json"
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
    by_qid = {r["qid"]: r for r in incoming if r.get("qid")}
    print(f"source: {len(incoming)} total / {sum(1 for r in incoming if r.get('extract'))} with extract")

    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    print(f"master: {len(items)} attractions")

    upgraded = 0  # short → richer
    set_new = 0   # had no description_en
    title_set = 0
    for a in items:
        qid = a.get("qid")
        if not qid:
            continue
        rec = by_qid.get(qid)
        if not rec:
            continue
        # Always record wikipedia_titles.en for traceability
        en_title = rec.get("title")
        if en_title:
            t = a.get("wikipedia_titles") or {}
            if t.get("en") != en_title:
                t["en"] = en_title
                a["wikipedia_titles"] = t
                title_set += 1

        extract = rec.get("extract")
        if not extract:
            continue
        existing = a.get("description_en")
        if existing:
            if len(extract) > len(existing) * 1.4:
                a["description_en"] = extract
                a["description_en_source"] = "en_wikipedia_intro"
                upgraded += 1
        else:
            a["description_en"] = extract
            a["description_en_source"] = "en_wikipedia_intro"
            set_new += 1

    master["attractions"] = items
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(
        f"\nmaster updated:"
        f"\n  description_en upgraded (short→Wikipedia): {upgraded}"
        f"\n  description_en newly set:                   {set_new}"
        f"\n  wikipedia_titles.en captured:               {title_set}"
    )

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
            for field in ("description_en", "description_en_source", "wikipedia_titles"):
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
