#!/usr/bin/env python3
"""
Pre-compute the `nearby_pois` structured field on every attraction with
coordinates: top-N other attractions within a walking-radius cap.

Output schema added to each master attraction:
  nearby_pois: [
    {
      qid: "Q...",
      name_ja: str | null,
      name_en: str | null,
      coordinates: { lat, lng },
      distance_m: int,
      walk_minutes: int,
      kinds: [str, ...] | null,   # truncated WD_TYPE_KIND-derived labels
    },
    ...
  ]

Constants:
  CAP_M             1500   1.5 km haversine radius
  TOP_N             5      most-near other attractions
  WALK_M_PER_MIN    80     standard pedestrian-planning constant

Restricted to same-prefecture + bordering-prefectures (47-pref adjacency
map) to keep the pairwise sweep tractable. The previous nearest_transit
script established the same containment pattern.

Run:
  python3 scripts/inject_nearby_pois.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
PREFS = REPO / "data/prefectures"

CAP_M = 1500
TOP_N = 5
WALK_M_PER_MIN = 80

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

ADJACENT: dict[str, list[str]] = {
    "01": [],
    "02": ["03", "05"], "03": ["02", "04", "05"], "04": ["03", "05", "06", "07"],
    "05": ["02", "03", "04", "06"], "06": ["04", "05", "07", "15"],
    "07": ["04", "06", "08", "09", "10", "15"], "08": ["07", "09", "11", "12"],
    "09": ["07", "08", "10", "11"], "10": ["07", "09", "11", "15", "20"],
    "11": ["08", "09", "10", "12", "13", "19", "20"], "12": ["08", "11", "13"],
    "13": ["11", "12", "14", "19"], "14": ["13", "19", "22"],
    "15": ["06", "07", "10", "16", "20"], "16": ["15", "17", "20", "21"],
    "17": ["16", "18", "21"], "18": ["17", "21", "25"],
    "19": ["11", "13", "14", "20", "22"], "20": ["10", "11", "15", "16", "19", "21", "22", "23"],
    "21": ["16", "17", "18", "20", "22", "23", "25"], "22": ["14", "19", "20", "23"],
    "23": ["20", "21", "22", "24"], "24": ["21", "23", "25", "26", "29"],
    "25": ["18", "21", "24", "26"], "26": ["18", "24", "25", "27", "28", "29"],
    "27": ["26", "28", "29", "30"], "28": ["26", "27", "31", "33"],
    "29": ["24", "26", "27", "30"], "30": ["27", "29"],
    "31": ["28", "32", "33"], "32": ["31", "33", "34", "35"],
    "33": ["28", "31", "32", "34"], "34": ["32", "33", "35", "38"],
    "35": ["32", "34"], "36": ["37", "38", "39"],
    "37": ["36", "38"], "38": ["34", "36", "37", "39"],
    "39": ["36", "38"], "40": ["41", "43", "44"],
    "41": ["40", "42", "43"], "42": ["41", "43"],
    "43": ["40", "41", "42", "44", "45"], "44": ["40", "43", "45"],
    "45": ["43", "44", "46"], "46": ["45"],
    "47": [],
}

# Wikidata type QID → kind label (mirror of src/lib/kinds.ts WD_TYPE_KIND
# minimal subset — only the labels surfaced in nearby_pois preview).
WD_TYPE_KIND: dict[str, str] = {
    "Q570116": "tourist_attraction", "Q15303351": "historic_site",
    "Q44613": "buddhist_temple", "Q845945": "shinto_shrine",
    "Q23413": "castle", "Q92026": "japanese_castle",
    "Q33506": "museum", "Q22698": "park", "Q1107656": "garden",
    "Q4989906": "monument", "Q4087053": "natural_monument",
    "Q34038": "waterfall", "Q23397": "lake", "Q35509": "cave",
    "Q40080": "beach", "Q204324": "volcano", "Q39816": "valley",
    "Q14888011": "onsen_resort", "Q12536": "hot_spring",
    "Q1071482": "national_park", "Q11832860": "quasi_national_park",
    "Q488205": "designated_cultural_property_jp", "Q1496967": "pilgrimage_site",
    "Q15243209": "preservation_district", "Q3960": "lighthouse",
    "Q1500350": "resort", "Q635155": "theater", "Q1248784": "airport",
    "Q5393308": "buddhist_temple", "Q697295": "shinto_shrine",
    "Q11588709": "sacred_mountain", "Q1370978": "great_buddha",
    "Q1051606": "great_buddha", "Q39614": "buddhist_monastery",
    "Q11455614": "shukubo",
}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371000.0
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def kinds_for(types: list[str] | None) -> list[str] | None:
    if not types:
        return None
    out: list[str] = []
    seen: set[str] = set()
    for t in types:
        k = WD_TYPE_KIND.get(t)
        if k and k not in seen:
            out.append(k)
            seen.add(k)
    return out or None


def main() -> None:
    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    print(f"master: {len(items)} attractions")

    with_coords = []
    by_pref: dict[str, list[dict]] = {}
    for a in items:
        c = a.get("coordinates")
        if not c or c.get("lat") is None or c.get("lng") is None:
            continue
        with_coords.append(a)
        pref = (a.get("prefecture_code") or "").strip()
        by_pref.setdefault(pref or "", []).append(a)
    print(f"  with coords: {len(with_coords)}")
    print(f"  bucketed across {len(by_pref)} prefecture buckets")

    annotated = 0
    no_neighbors = 0
    for idx, a in enumerate(with_coords):
        if idx and idx % 5000 == 0:
            print(f"  ...{idx} processed, {annotated} annotated")
        c = a["coordinates"]
        lat0, lng0 = c["lat"], c["lng"]
        pref = (a.get("prefecture_code") or "").strip()
        candidate_prefs = {pref} | set(ADJACENT.get(pref, [])) if pref else set(by_pref.keys())
        my_qid = a.get("qid")

        ranked: list[tuple[float, dict]] = []
        for cand_pref in candidate_prefs:
            for b in by_pref.get(cand_pref, []):
                if b.get("qid") == my_qid:
                    continue
                bc = b.get("coordinates")
                if not bc:
                    continue
                d = haversine_m(lat0, lng0, bc["lat"], bc["lng"])
                if d > CAP_M:
                    continue
                ranked.append((d, b))
        ranked.sort(key=lambda x: x[0])
        top = ranked[:TOP_N]
        if not top:
            no_neighbors += 1
            continue

        a["nearby_pois"] = [
            {
                "qid": b["qid"],
                "name_ja": b.get("name_ja"),
                "name_en": b.get("name_en"),
                "coordinates": b.get("coordinates"),
                "distance_m": int(round(d)),
                "walk_minutes": int(round(d / WALK_M_PER_MIN)),
                "kinds": kinds_for(b.get("types")),
            }
            for d, b in top
        ]
        annotated += 1

    master["attractions"] = items
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(f"\nmaster updated: {annotated} annotated / {no_neighbors} isolated (no neighbour <{CAP_M}m)")

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
            np_list = mrec.get("nearby_pois")
            if np_list and entry.get("nearby_pois") != np_list:
                entry["nearby_pois"] = np_list
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
