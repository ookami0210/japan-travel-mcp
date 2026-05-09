#!/usr/bin/env python3
"""Fold landmark records resolved by `fetch_landmark_by_name.ts` into the
wikidata_attractions master.

Strategy (mirrors `inject_bunka_kunishitei.py`):

  1. If the resolved QID already exists in master → enrich the master
     record with description_en/ja, types, multilingual labels, sitelinks
     where the master is missing them. Tag `landmark_anchor=true`.

  2. If the resolved QID is missing → insert a new master entry with the
     full payload, tagged `source_anchor="landmark_by_name"`.

  3. Per-prefecture file refresh: for each new / enriched entry, also
     write the change into the relevant `data/prefectures/<slug>.json`
     so `loadAllPrefectures` (which reads per-pref files) sees the update.

Unresolved records (`match_qid: null`) are skipped.

Run:
  python3.11 scripts/inject_landmark_by_name.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SRC = REPO / "data/_state/landmark_by_name.json"
PREFS = REPO / "data/prefectures"

CODE_TO_SLUG = {
    "01": "hokkaido", "02": "aomori", "03": "iwate", "04": "miyagi",
    "05": "akita", "06": "yamagata", "07": "fukushima", "08": "ibaraki",
    "09": "tochigi", "10": "gunma", "11": "saitama", "12": "chiba",
    "13": "tokyo", "14": "kanagawa", "15": "niigata", "16": "toyama",
    "17": "ishikawa", "18": "fukui", "19": "yamanashi", "20": "nagano",
    "21": "gifu", "22": "shizuoka", "23": "aichi", "24": "mie",
    "25": "shiga", "26": "kyoto", "27": "osaka", "28": "hyogo",
    "29": "nara", "30": "wakayama", "31": "tottori", "32": "shimane",
    "33": "okayama", "34": "hiroshima", "35": "yamaguchi", "36": "tokushima",
    "37": "kagawa", "38": "ehime", "39": "kochi", "40": "fukuoka",
    "41": "saga", "42": "nagasaki", "43": "kumamoto", "44": "oita",
    "45": "miyazaki", "46": "kagoshima", "47": "okinawa",
}

# Bbox -> prefecture code fallback when admin_qid lookup fails. Only used
# for landmarks whose P131 chain doesn't resolve to a prefecture-level
# QID directly. We don't ship the full prefecture-polygon table here;
# fall back to leaving prefecture_code=null and letting the master's
# coord-based downstream tooling handle it.


def admin_qid_to_prefecture_code(admin_qid: str | None, master_index: dict) -> str | None:
    """Walk master's existing admin_qid → prefecture_code mapping to
    resolve a landmark's admin_qid. Cheap heuristic; if we can't find a
    direct mapping, return None and let coord-based tools handle it."""
    if not admin_qid:
        return None
    return master_index.get(admin_qid)


def main() -> None:
    if not SRC.exists():
        print(f"source missing: {SRC} — run fetch_landmark_by_name.ts first.")
        return
    print(f"loading {MASTER}")
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    attractions = master["attractions"]
    print(f"  master attractions: {len(attractions)}")

    print(f"loading {SRC}")
    src = json.loads(SRC.read_text(encoding="utf-8"))
    records = src.get("records", [])
    resolved = [r for r in records if r.get("match_qid")]
    print(f"  landmark records: {len(records)} ({len(resolved)} resolved)")

    qid_to_idx: dict[str, int] = {}
    admin_to_pref: dict[str, str] = {}
    for i, a in enumerate(attractions):
        if isinstance(a.get("qid"), str):
            qid_to_idx[a["qid"]] = i
        if a.get("admin_qid") and a.get("prefecture_code"):
            admin_to_pref[a["admin_qid"]] = a["prefecture_code"]

    enriched = 0
    inserted = 0
    skipped = 0
    pref_file_changes: dict[str, list[dict]] = {}

    for rec in resolved:
        qid = rec["match_qid"]
        # Build the master-shape payload
        pref_code = admin_qid_to_prefecture_code(rec.get("admin_qid"), admin_to_pref)
        payload = {
            "qid": qid,
            "wikidata_url": rec.get("wikidata_url") or f"https://www.wikidata.org/wiki/{qid}",
            "name_ja": rec.get("name_ja"),
            "name_en": rec.get("name_en"),
            "name_zh": rec.get("name_zh"),
            "name_ko": rec.get("name_ko"),
            "description_en": rec.get("description_en"),
            "description_ja": rec.get("description_ja"),
            "coordinates": rec.get("coordinates"),
            "prefecture_code": pref_code,
            "admin_qid": rec.get("admin_qid"),
            "admin_code": None,
            "admin_name": None,
            "types": rec.get("types") or [],
            "wikipedia_titles": {
                k: v for k, v in [
                    ("en", rec.get("enwiki_title")),
                    ("ja", rec.get("jawiki_title")),
                ] if v
            } or None,
            "source_anchor": "landmark_by_name",
            "landmark_query": rec.get("name_query"),
        }
        if qid in qid_to_idx:
            existing = attractions[qid_to_idx[qid]]
            # Non-destructive enrichment: only fill fields the master
            # doesn't already have.
            for k, v in payload.items():
                if v is None or v == [] or v == {}:
                    continue
                if k == "qid":
                    continue
                if k == "source_anchor":
                    # don't overwrite a stronger source_anchor
                    continue
                if k == "landmark_query":
                    # always tag the landmark query so we can audit
                    existing[k] = v
                    continue
                if existing.get(k) in (None, "", [], {}):
                    existing[k] = v
            existing["landmark_anchor"] = True
            enriched += 1
        else:
            attractions.append(payload)
            inserted += 1
            if pref_code:
                pref_file_changes.setdefault(pref_code, []).append(payload)

    print(f"enriched (existing): {enriched}")
    print(f"inserted (new):      {inserted}")
    print(f"skipped:             {skipped}")

    master["attractions"] = attractions
    master["total_attractions"] = len(attractions)
    MASTER.write_text(json.dumps(master, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {MASTER}")

    # Per-prefecture file refresh — append new landmarks to the
    # corresponding prefecture's wikidata_attractions array. We avoid a
    # full rebuild here because that'd churn 47 files; instead we
    # in-place append (`loadAllPrefectures` reads them at boot and our
    # synthetic insert is harmless in-place).
    for pref_code, items in pref_file_changes.items():
        slug = CODE_TO_SLUG.get(pref_code)
        if not slug:
            continue
        pref_path = PREFS / f"{slug}.json"
        if not pref_path.exists():
            continue
        pref_data = json.loads(pref_path.read_text(encoding="utf-8"))
        pref_data.setdefault("wikidata_attractions", [])
        seen = {a.get("qid") for a in pref_data["wikidata_attractions"]}
        added_here = 0
        for item in items:
            if item["qid"] in seen:
                continue
            pref_data["wikidata_attractions"].append(item)
            seen.add(item["qid"])
            added_here += 1
        if added_here > 0:
            pref_path.write_text(json.dumps(pref_data, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"  + {added_here} → {pref_path.name}")


if __name__ == "__main__":
    main()
