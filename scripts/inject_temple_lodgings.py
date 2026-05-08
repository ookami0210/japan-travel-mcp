#!/usr/bin/env python3
"""
Fold temple-lodging records from data/_state/temple_lodgings.json into
data/_state/wikidata_attractions.json (master) and the corresponding
per-prefecture files.

Two paths:
  1. QID already in master — enrich `types[]` with Q11455614 (shukubō)
     so the runtime kind label "shukubo" is added. Also propagate to
     per-prefecture entry.
  2. QID not in master — insert full record as a new attraction with
     types=[Q11455614], source_anchor="wikidata_shukubo".

Run:
  python3 scripts/inject_temple_lodgings.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SHUKUBO_SOURCE = REPO / "data/_state/temple_lodgings.json"
PREFS = REPO / "data/prefectures"

SHUKUBO_QID = "Q11455614"

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


def to_master_record(rec: dict) -> dict:
    """Map a temple_lodgings record to the wikidata_attractions schema."""
    types = list(rec.get("types") or [])
    if SHUKUBO_QID not in types:
        types.append(SHUKUBO_QID)
    return {
        "qid": rec["qid"],
        "wikidata_url": rec.get("wikidata_url") or f"https://www.wikidata.org/wiki/{rec['qid']}",
        "name_ja": rec.get("name_ja"),
        "name_en": rec.get("name_en"),
        "name_zh": rec.get("name_zh"),
        "name_ko": rec.get("name_ko"),
        "description_en": rec.get("description_en"),
        "coordinates": rec.get("coordinates"),
        "prefecture_code": rec.get("prefecture_code") or "",
        "admin_code": rec.get("admin_code"),
        "admin_name": rec.get("admin_name"),
        "types": types,
        "source_anchor": "wikidata_shukubo",
    }


def main() -> None:
    src = json.loads(SHUKUBO_SOURCE.read_text())
    incoming = src.get("records") or []

    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    by_qid = {a.get("qid"): a for a in items if a.get("qid")}

    enriched = 0
    inserted = 0
    by_pref_added: dict[str, list[dict]] = {}
    by_pref_enriched: dict[str, list[str]] = {}
    skipped_no_pref = 0

    for rec in incoming:
        qid = rec["qid"]
        pref_code = rec.get("prefecture_code") or ""
        if not pref_code:
            skipped_no_pref += 1
            continue

        existing = by_qid.get(qid)
        if existing:
            # Path 1: enrich
            types = list(existing.get("types") or [])
            if SHUKUBO_QID not in types:
                types.append(SHUKUBO_QID)
                existing["types"] = types
                enriched += 1
                by_pref_enriched.setdefault(pref_code, []).append(qid)
        else:
            # Path 2: insert
            new_rec = to_master_record(rec)
            items.append(new_rec)
            by_qid[qid] = new_rec
            inserted += 1
            by_pref_added.setdefault(pref_code, []).append(new_rec)

    master["attractions"] = items
    master["total_attractions"] = len(items)
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(
        f"master: +{inserted} new / {enriched} enriched / total {len(items)} | skipped (no prefecture): {skipped_no_pref}"
    )

    # Update per-pref files
    pref_codes = set(by_pref_added) | set(by_pref_enriched)
    for code in sorted(pref_codes):
        slug = CODE_TO_SLUG.get(code)
        if not slug:
            print(f"  skip pref code {code} (unknown)")
            continue
        path = PREFS / f"{slug}.json"
        if not path.exists():
            print(f"  skip {slug} (no pref file)")
            continue
        d = json.loads(path.read_text())
        existing = d.get("wikidata_attractions") or []
        by_q_pref = {a.get("qid"): a for a in existing if a.get("qid")}

        added_pref = 0
        enriched_pref = 0
        for r in by_pref_added.get(code, []):
            if r["qid"] not in by_q_pref:
                existing.append(r)
                by_q_pref[r["qid"]] = r
                added_pref += 1
        for q in by_pref_enriched.get(code, []):
            entry = by_q_pref.get(q)
            if not entry:
                continue
            types = list(entry.get("types") or [])
            if SHUKUBO_QID not in types:
                types.append(SHUKUBO_QID)
                entry["types"] = types
                enriched_pref += 1

        d["wikidata_attractions"] = existing
        tmp_p = path.with_suffix(".json.new")
        tmp_p.write_text(json.dumps(d, ensure_ascii=False, indent=2))
        tmp_p.replace(path)
        print(f"  {slug} (pref {code}): +{added_pref} new / {enriched_pref} enriched")


if __name__ == "__main__":
    main()
