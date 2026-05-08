#!/usr/bin/env python3
"""Fold 文化庁 国指定文化財 records into the wikidata_attractions master.

Two paths, mirroring inject_temple_lodgings.py:

  1. Coordinate match (haversine ≤ 200 m AND first-character name
     overlap). Enrich the matching master entry's `heritage_designations`
     array with the Wikidata QID corresponding to the kunishitei
     `register_sub_id`. Also tag a per-record `bunka_kunishitei_entry_id`
     so downstream consumers can trace back to the official record.

  2. No coord match. Add a new master entry with the kunishitei record's
     coordinates, name, and inferred heritage_designation. Marked with
     `source_anchor="bunka_kunishitei"` so the runtime can surface them
     distinctly.

The mapping `register_sub_id` → Wikidata heritage QID follows the well
known correspondences (国宝 = Q11579194, 重要文化財 = Q1188622, 史跡 =
Q30834580 etc.). Where a single register_sub_id lumps multiple
designations (e.g. 102 = 国宝 OR 重要文化財), we encode both QIDs.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
KUNISHITEI = REPO / "data/r3/bunka_kunishitei.json"
PREFS = REPO / "data/prefectures"

# register_sub_id → list of Wikidata heritage QID (P1435 designation).
REGISTER_SUB_ID_TO_QIDS: dict[str, list[str]] = {
    "102": ["Q11579194", "Q1188622"],   # 国宝・重要文化財（建造物）
    "101": ["Q11633166"],               # 登録有形文化財（建造物）
    "201": ["Q11579194", "Q1188622"],   # 国宝・重要文化財（美術工芸品）
    "211": ["Q11633166"],               # 登録有形文化財（美術工芸品）
    "202": ["Q11633166"],               # 登録美術品 (registered art object)
    "301": ["Q56557009"],               # 重要有形民俗文化財
    "311": ["Q56557009"],               # 登録有形民俗文化財 (overlap with 重要)
    "302": ["Q11695676"],               # 重要無形民俗文化財
    "322": ["Q11695676"],               # 登録無形民俗文化財
    "312": ["Q11695676"],               # 記録作成等の措置を講ずべき無形の民俗文化財
    "303": ["Q11522796"],               # 重要無形文化財
    "323": ["Q11522796"],               # 登録無形文化財
    "313": ["Q11522796"],               # 記録作成等の措置を講ずべき無形文化財
    "304": ["Q11522796"],               # 選定保存技術
    "401": ["Q30834580", "Q11414752", "Q43113623"],
                                       # 史跡 / 名勝 / 天然記念物 (combined cell)
    "411": ["Q11638384"],               # 登録記念物
    "412": ["Q64576748"],               # 重要文化的景観
    "103": ["Q850649"],                 # 重要伝統的建造物群保存地区
    "901": ["Q9259"],                   # 世界遺産
}

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

PREF_NAME_TO_CODE = {
    "北海道": "01", "青森県": "02", "岩手県": "03", "宮城県": "04",
    "秋田県": "05", "山形県": "06", "福島県": "07", "茨城県": "08",
    "栃木県": "09", "群馬県": "10", "埼玉県": "11", "千葉県": "12",
    "東京都": "13", "神奈川県": "14", "新潟県": "15", "富山県": "16",
    "石川県": "17", "福井県": "18", "山梨県": "19", "長野県": "20",
    "岐阜県": "21", "静岡県": "22", "愛知県": "23", "三重県": "24",
    "滋賀県": "25", "京都府": "26", "大阪府": "27", "兵庫県": "28",
    "奈良県": "29", "和歌山県": "30", "鳥取県": "31", "島根県": "32",
    "岡山県": "33", "広島県": "34", "山口県": "35", "徳島県": "36",
    "香川県": "37", "愛媛県": "38", "高知県": "39", "福岡県": "40",
    "佐賀県": "41", "長崎県": "42", "熊本県": "43", "大分県": "44",
    "宮崎県": "45", "鹿児島県": "46", "沖縄県": "47",
}


def haversine_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    R = 6_371_000.0
    p1 = math.radians(a_lat)
    p2 = math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def name_first_char(name: str | None) -> str:
    if not name:
        return ""
    stripped = name.strip()
    return stripped[0] if stripped else ""


def main() -> None:
    print(f"loading {MASTER}")
    master = json.loads(MASTER.read_text(encoding="utf-8"))
    attractions = master["attractions"]
    print(f"  master attractions: {len(attractions)}")

    print(f"loading {KUNISHITEI}")
    kuni = json.loads(KUNISHITEI.read_text(encoding="utf-8"))
    records = kuni.get("records", [])
    print(f"  kunishitei records: {len(records)}")
    if not records:
        print("no kunishitei records — nothing to inject. Run the fetcher first.")
        return

    # Build a quick coord index for master entries: bucket by 0.01° tile.
    coord_index: dict[tuple[int, int], list[dict]] = {}
    for a in attractions:
        coords = a.get("coordinates")
        if not coords or coords.get("lat") is None or coords.get("lng") is None:
            continue
        lat, lng = coords["lat"], coords["lng"]
        # 0.01° ≈ 1.1 km — gives ~3 km neighbour radius across 9 buckets
        key = (int(lat * 100), int(lng * 100))
        coord_index.setdefault(key, []).append(a)

    enriched = 0
    inserted = 0
    skipped = 0

    for rec in records:
        if not rec.get("lat") or not rec.get("lng"):
            skipped += 1
            continue
        try:
            lat = float(rec["lat"])
            lng = float(rec["lng"])
        except (TypeError, ValueError):
            skipped += 1
            continue
        rsi = rec.get("register_sub_id")
        target_qids = REGISTER_SUB_ID_TO_QIDS.get(rsi or "", [])
        if not target_qids:
            skipped += 1
            continue

        # Search neighbour buckets for a coord match.
        bucket = (int(lat * 100), int(lng * 100))
        candidates: list[dict] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                candidates.extend(coord_index.get((bucket[0] + dx, bucket[1] + dy), []))

        first = name_first_char(rec.get("name_ja"))
        match: dict | None = None
        match_dist: float = float("inf")
        for cand in candidates:
            ccoords = cand.get("coordinates", {})
            d = haversine_m(lat, lng, ccoords.get("lat"), ccoords.get("lng"))
            if d > 200:
                continue
            cand_first = name_first_char(cand.get("name_ja"))
            if first and cand_first and first != cand_first:
                continue
            if d < match_dist:
                match = cand
                match_dist = d

        if match is not None:
            existing_des = match.setdefault("heritage_designations", [])
            added = False
            for q in target_qids:
                if q not in existing_des:
                    existing_des.append(q)
                    added = True
            match["bunka_kunishitei_entry_id"] = rec.get("entry_id")
            if rec.get("kind_jp"):
                match["bunka_kunishitei_kind"] = rec["kind_jp"]
            if added:
                enriched += 1
        else:
            # Insert as a new master entry. We use a synthetic QID-like id
            # so downstream code paths that key on `qid` keep working,
            # while the synthetic prefix marks it as bunka-only.
            pref_code = PREF_NAME_TO_CODE.get(rec.get("prefecture_jp") or "", None)
            new_entry = {
                "qid": f"BUNKA-{rec['entry_id']}",
                "wikidata_url": rec.get("source_url"),
                "name_ja": rec.get("name_ja"),
                "name_en": None,
                "name_zh": None,
                "name_ko": None,
                "description_en": None,
                "coordinates": {"lat": lat, "lng": lng},
                "prefecture_code": pref_code,
                "admin_code": None,
                "admin_name": None,
                "types": [],
                "heritage_designations": list(target_qids),
                "source_anchor": "bunka_kunishitei",
                "bunka_kunishitei_entry_id": rec.get("entry_id"),
                "bunka_kunishitei_kind": rec.get("kind_jp"),
                "bunka_kunishitei_classification": rec.get("classification_jp"),
                "bunka_kunishitei_era": rec.get("era_jp"),
            }
            attractions.append(new_entry)
            inserted += 1

    print(f"enriched (existing): {enriched}")
    print(f"inserted (new):      {inserted}")
    print(f"skipped (no coord / no QID mapping): {skipped}")

    master["attractions"] = attractions
    master["total_attractions"] = len(attractions)
    MASTER.write_text(
        json.dumps(master, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"wrote {MASTER}")


if __name__ == "__main__":
    main()
