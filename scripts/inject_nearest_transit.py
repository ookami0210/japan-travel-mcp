#!/usr/bin/env python3
"""
Pre-compute the `nearest_transit` structured field on every attraction
with coordinates, sourced from data/_state/railway_stations.json
(fetcher: scrapers/sources/fetch_railway_stations.ts).

Output schema added to each master attraction:
  nearest_transit: {
    station_qid: "Q...",
    station_name_ja: "...",
    station_name_en: "...",
    station_coordinates: { lat, lng },
    distance_m: int,            # haversine, rounded
    walk_minutes: int,          # round(distance_m / 80)  (80 m/min standard)
    operator_qid: "Q..." | null,
    operator_name: str | null,
  }

Walking-pace assumption: 80 m/min is the typical Japanese pedestrian
planning value (used in real-estate listings as "徒歩 N 分 = 距離 / 80m").
Cap at 5 km — beyond that, calling it "nearest transit by walk" is
misleading; field is populated only when nearest station is within 5 km.

For each pref-coded attraction, we limit the search to stations in the
same prefecture (P131* admin chain) plus a small buffer of neighbouring
prefectures. This avoids O(N×M) cross-product on 74k attractions × 12k
stations and gives ~95% of the lookup quality at <5% of the cost.

Run:
  python3 scripts/inject_nearest_transit.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SRC = REPO / "data/_state/railway_stations.json"
PREFS = REPO / "data/prefectures"

WALK_M_PER_MIN = 80
DISTANCE_CAP_M = 5000

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

# Adjacency (prefecture borders). Used to expand candidate-station set when
# attraction is near a prefecture boundary. Keys: prefecture code; values:
# list of bordering prefecture codes. Curated from a standard prefecture
# adjacency map.
ADJACENT: dict[str, list[str]] = {
    "01": [],
    "02": ["03", "05"],
    "03": ["02", "04", "05"],
    "04": ["03", "05", "06", "07"],
    "05": ["02", "03", "04", "06"],
    "06": ["04", "05", "07", "15"],
    "07": ["04", "06", "08", "09", "10", "15"],
    "08": ["07", "09", "11", "12"],
    "09": ["07", "08", "10", "11"],
    "10": ["07", "09", "11", "15", "20"],
    "11": ["08", "09", "10", "12", "13", "19", "20"],
    "12": ["08", "11", "13"],
    "13": ["11", "12", "14", "19"],
    "14": ["13", "19", "22"],
    "15": ["06", "07", "10", "16", "20"],
    "16": ["15", "17", "20", "21"],
    "17": ["16", "18", "21"],
    "18": ["17", "21", "25"],
    "19": ["11", "13", "14", "20", "22"],
    "20": ["10", "11", "15", "16", "19", "21", "22", "23"],
    "21": ["16", "17", "18", "20", "22", "23", "25"],
    "22": ["14", "19", "20", "23"],
    "23": ["20", "21", "22", "24"],
    "24": ["21", "23", "25", "26", "29"],
    "25": ["18", "21", "24", "26"],
    "26": ["18", "24", "25", "27", "28", "29"],
    "27": ["26", "28", "29", "30"],
    "28": ["26", "27", "31", "33"],
    "29": ["24", "26", "27", "30"],
    "30": ["27", "29"],
    "31": ["28", "32", "33"],
    "32": ["31", "33", "34", "35"],
    "33": ["28", "31", "32", "34"],
    "34": ["32", "33", "35", "38"],
    "35": ["32", "34"],
    "36": ["37", "38", "39"],
    "37": ["36", "38"],
    "38": ["34", "36", "37", "39"],
    "39": ["36", "38"],
    "40": ["41", "43", "44"],
    "41": ["40", "42", "43"],
    "42": ["41", "43"],
    "43": ["40", "41", "42", "44", "45"],
    "44": ["40", "43", "45"],
    "45": ["43", "44", "46"],
    "46": ["45"],
    "47": [],
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


def candidate_pref_codes(pref_code: str) -> set[str]:
    out = {pref_code}
    out.update(ADJACENT.get(pref_code, []))
    return out


def find_nearest(
    lat: float,
    lng: float,
    pref_code: str,
    stations_by_pref: dict[str, list[dict]],
    cap_m: float = DISTANCE_CAP_M,
) -> tuple[dict, float] | None:
    candidates_pref = candidate_pref_codes(pref_code) if pref_code else set(stations_by_pref.keys())
    best_station = None
    best_distance = cap_m + 1
    for p in candidates_pref:
        stations = stations_by_pref.get(p) or []
        for s in stations:
            c = s.get("coordinates")
            if not c:
                continue
            d = haversine_m(lat, lng, c["lat"], c["lng"])
            if d < best_distance:
                best_distance = d
                best_station = s
    if best_station is None or best_distance > cap_m:
        return None
    return best_station, best_distance


def make_nearest_transit(station: dict, distance_m: float) -> dict:
    return {
        "station_qid": station["qid"],
        "station_name_ja": station.get("name_ja"),
        "station_name_en": station.get("name_en"),
        "station_coordinates": station.get("coordinates"),
        "distance_m": int(round(distance_m)),
        "walk_minutes": int(round(distance_m / WALK_M_PER_MIN)),
        "operator_qid": station.get("operator_qid"),
        "operator_name": station.get("operator_name"),
    }


def main() -> None:
    src = json.loads(SRC.read_text())
    stations = src.get("stations") or []
    print(f"loaded {len(stations)} stations")

    # Bucket by prefecture for fast lookup
    stations_by_pref: dict[str, list[dict]] = {}
    fallback_no_pref: list[dict] = []
    for s in stations:
        pref = (s.get("prefecture_code") or "").strip()
        if pref:
            stations_by_pref.setdefault(pref, []).append(s)
        else:
            fallback_no_pref.append(s)
    print(f"  bucketed: {len(stations_by_pref)} prefectures populated, {len(fallback_no_pref)} stations without pref")

    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    print(f"master: {len(items)} attractions")

    annotated = 0
    skipped_no_coords = 0
    skipped_too_far = 0

    for a in items:
        c = a.get("coordinates")
        if not c or c.get("lat") is None or c.get("lng") is None:
            skipped_no_coords += 1
            continue
        pref = (a.get("prefecture_code") or "").strip()
        result = find_nearest(c["lat"], c["lng"], pref, stations_by_pref)
        if result is None:
            skipped_too_far += 1
            continue
        station, distance = result
        a["nearest_transit"] = make_nearest_transit(station, distance)
        annotated += 1

    master["attractions"] = items
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(
        f"\nmaster updated: {annotated} annotated / {skipped_no_coords} no-coords / {skipped_too_far} >5km from any station"
    )

    # Per-pref propagation: re-attach nearest_transit on existing entries
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
            nt = mrec.get("nearest_transit")
            if nt is not None and entry.get("nearest_transit") != nt:
                entry["nearest_transit"] = nt
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
