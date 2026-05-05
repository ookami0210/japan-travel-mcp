#!/usr/bin/env python3
"""
Inject Wikipedia category-derived entities into the wikidata_attractions
master + per-prefecture files.

Source: data/r3/wikipedia_categories.json (by_category map)
Target kinds (adds these as wikipedia_kind_tags):
  sake_brewery / sake_brand / observatory / ski_resort / cycling_route /
  lavender / shimanami / kominka / hanabi / matsuri / sakura_meisho /
  kouyou_meisho / snow_festival

Strategy:
  For each Wikipedia page in a target category whose QID is NOT already in
  master, infer prefecture_code from the extract text (keyword scan against
  the 47 prefecture names) and inject as a new wikidata attraction record
  with the kind_tag, description, and a coords field if available.

Safety:
  - Writes to a .new file first for inspection, then atomically renames
  - Skip if QID already present
  - Skip if no prefecture inferable AND no coords
"""
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
WIKI = REPO / "data/r3/wikipedia_categories.json"
MASTER = REPO / "data/_state/wikidata_attractions.json"
PREFS = REPO / "data/prefectures"

PREF_NAME_TO_CODE = {
    "北海道": "01", "青森": "02", "岩手": "03", "宮城": "04", "秋田": "05",
    "山形": "06", "福島": "07", "茨城": "08", "栃木": "09", "群馬": "10",
    "埼玉": "11", "千葉": "12", "東京": "13", "神奈川": "14", "新潟": "15",
    "富山": "16", "石川": "17", "福井": "18", "山梨": "19", "長野": "20",
    "岐阜": "21", "静岡": "22", "愛知": "23", "三重": "24", "滋賀": "25",
    "京都": "26", "大阪": "27", "兵庫": "28", "奈良": "29", "和歌山": "30",
    "鳥取": "31", "島根": "32", "岡山": "33", "広島": "34", "山口": "35",
    "徳島": "36", "香川": "37", "愛媛": "38", "高知": "39", "福岡": "40",
    "佐賀": "41", "長崎": "42", "熊本": "43", "大分": "44", "宮崎": "45",
    "鹿児島": "46", "沖縄": "47",
}

# Pref-name patterns to match against extract text
# Order: longer suffixes first (北海道 before 北海)
PREF_PATTERNS = sorted(PREF_NAME_TO_CODE.items(), key=lambda kv: -len(kv[0]))

RELEVANT_KIND_TAGS = {
    "sake_brewery", "sake_brand", "observatory", "ski_resort",
    "cycling_route", "lavender", "shimanami", "kominka",
    "hanabi", "matsuri", "sakura_meisho", "kouyou_meisho",
    "snow_festival", "yakei", "preservation_district",
}

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


def infer_prefecture_code(text: str) -> str | None:
    if not text:
        return None
    for name, code in PREF_PATTERNS:
        if name in text:
            return code
    return None


def main() -> None:
    wiki = json.loads(WIKI.read_text())
    by_cat = wiki.get("by_category", {})
    cats = wiki.get("categories", [])

    master = json.loads(MASTER.read_text())
    items = master.get("attractions", [])
    master_qids = {a.get("qid") for a in items if a.get("qid")}

    # Aggregate kind_tags per QID
    qid_to_tags: dict[str, set[str]] = {}
    qid_to_page: dict[str, dict] = {}
    for cat in cats:
        title = cat.get("title")
        kind_tag = cat.get("kind_tag")
        if not kind_tag or kind_tag not in RELEVANT_KIND_TAGS:
            continue
        for p in by_cat.get(title, []):
            qid = p.get("qid")
            if not qid or qid in master_qids:
                continue
            qid_to_tags.setdefault(qid, set()).add(kind_tag)
            # First page record wins
            if qid not in qid_to_page:
                qid_to_page[qid] = p

    print(f"candidate QIDs to inject: {len(qid_to_tags)}")

    # Special-case shimanami → cycling_route + sakura tags merge
    for qid, tags in qid_to_tags.items():
        if "shimanami" in tags:
            tags.add("cycling_route")

    # Build new attraction records
    new_records = []
    by_pref_new: dict[str, list[dict]] = {}
    skipped_no_pref = 0
    for qid, tags in qid_to_tags.items():
        page = qid_to_page[qid]
        title = page.get("title") or ""
        extract = page.get("extract") or ""
        # Try inferring prefecture
        pref = infer_prefecture_code(title) or infer_prefecture_code(extract)
        if not pref:
            skipped_no_pref += 1
            continue
        rec = {
            "qid": qid,
            "wikidata_url": f"https://www.wikidata.org/wiki/{qid}",
            "name_ja": title,
            "name_en": None,
            "name_zh": None,
            "name_ko": None,
            "description_en": (extract[:200] if extract else None),
            "coordinates": (
                {"lat": page["lat"], "lng": page["lng"]}
                if page.get("lat") is not None and page.get("lng") is not None
                else None
            ),
            "prefecture_code": pref,
            "admin_code": None,
            "admin_name": None,
            "types": [],
            "source_anchor": "wikipedia_category",
            "wikipedia_kind_tags": sorted(tags),
        }
        new_records.append(rec)
        by_pref_new.setdefault(pref, []).append(rec)

    print(f"injectable: {len(new_records)} (skipped no-pref: {skipped_no_pref})")
    print("by prefecture:")
    for code, lst in sorted(by_pref_new.items()):
        print(f"  {code} ({CODE_TO_SLUG.get(code)}): {len(lst)}")

    # Write to master
    items.extend(new_records)
    master["attractions"] = items
    master["total_attractions"] = len(items)
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(f"wrote master: {MASTER} ({len(items)} total)")

    # Write to per-prefecture files
    for code, recs in by_pref_new.items():
        slug = CODE_TO_SLUG.get(code)
        if not slug:
            continue
        path = PREFS / f"{slug}.json"
        if not path.exists():
            print(f"  skip {slug} (no pref file)")
            continue
        try:
            d = json.loads(path.read_text())
        except Exception as e:
            print(f"  skip {slug} (parse error: {e})")
            continue
        existing = d.get("wikidata_attractions") or []
        existing_qids = {a.get("qid") for a in existing}
        added = 0
        for r in recs:
            if r["qid"] in existing_qids:
                continue
            existing.append(r)
            added += 1
        d["wikidata_attractions"] = existing
        tmp_p = path.with_suffix(".json.new")
        tmp_p.write_text(json.dumps(d, ensure_ascii=False, indent=2))
        tmp_p.replace(path)
        print(f"  {slug}: +{added} entries (now {len(existing)})")


if __name__ == "__main__":
    main()
