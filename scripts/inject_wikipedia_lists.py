#!/usr/bin/env python3
"""
Fold canonical-list members from data/r3/wikipedia_lists.json into
data/_state/wikidata_attractions.json (master) and per-prefecture files.

Source covers 28 Japanese tourism canonical lists (e.g. 日本さくら名所100選,
森林浴の森100選, 日本100名城, 日本の棚田百選, 日本の渚百選, 日本三景, etc).
Each list-article page link with a Wikidata QID is treated as a member.

Two paths:
  1. QID already in master — append the list's `kind_tag` to
     `wikipedia_kind_tags[]` (used by the get_spots ranker for a +0.05/tag
     boost up to a 4-tag cap; see src/index.ts iter93/iter98 comments).
  2. QID not in master — insert a stub attraction record with QID + name
     + (when available) coordinates + extract, plus the kind_tag.

Festival-class kind_tags (hanabi / yuki_matsuri / matsuri / matsuri_top /
fire_festival / bon_odori) are skipped here — get_festivals already
consumes wikipedia_lists.json directly for those, and double-injecting
would duplicate the tag boost.

Noise filter: drop pages whose title is a pure prefecture name or a year
reference. Article-navigation links of that shape are common in 100選
articles but never represent canonical list members.

Run:
  python3 scripts/inject_wikipedia_lists.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
SRC = REPO / "data/r3/wikipedia_lists.json"
PREFS = REPO / "data/prefectures"

PREF_NAMES = {
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
    "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
    "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
    "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
    "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
    "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
    "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
}

YEAR_RE = re.compile(r"^\d{4}年$|^平成\d+年$|^昭和\d+年$|^令和\d+年$|^明治\d+年$|^大正\d+年$")
GENERIC_RE = re.compile(r"^(日本|国|世界|地方|地域|市町村|都道府県|都市|町|村|市|郡|府|県|国家)$")

# Kinds already handled by get_festivals via direct wikipedia_lists consumption
SKIP_KINDS = {
    "hanabi", "yuki_matsuri", "matsuri", "matsuri_top",
    "fire_festival", "bon_odori",
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

PREF_NAME_TO_CODE = {
    "北海道": "01", "青森県": "02", "岩手県": "03", "宮城県": "04", "秋田県": "05",
    "山形県": "06", "福島県": "07", "茨城県": "08", "栃木県": "09", "群馬県": "10",
    "埼玉県": "11", "千葉県": "12", "東京都": "13", "神奈川県": "14", "新潟県": "15",
    "富山県": "16", "石川県": "17", "福井県": "18", "山梨県": "19", "長野県": "20",
    "岐阜県": "21", "静岡県": "22", "愛知県": "23", "三重県": "24", "滋賀県": "25",
    "京都府": "26", "大阪府": "27", "兵庫県": "28", "奈良県": "29", "和歌山県": "30",
    "鳥取県": "31", "島根県": "32", "岡山県": "33", "広島県": "34", "山口県": "35",
    "徳島県": "36", "香川県": "37", "愛媛県": "38", "高知県": "39", "福岡県": "40",
    "佐賀県": "41", "長崎県": "42", "熊本県": "43", "大分県": "44", "宮崎県": "45",
    "鹿児島県": "46", "沖縄県": "47",
}


def is_noise(title: str) -> bool:
    if title in PREF_NAMES:
        return True
    if YEAR_RE.match(title):
        return True
    if GENERIC_RE.match(title):
        return True
    return False


def infer_pref_code(text: str) -> str:
    if not text:
        return ""
    for name, code in PREF_NAME_TO_CODE.items():
        if name in text:
            return code
    return ""


def to_master_record(page: dict, kind_tag: str, list_title: str) -> dict:
    coords = None
    if page.get("lat") is not None and page.get("lng") is not None:
        coords = {"lat": page["lat"], "lng": page["lng"]}
    return {
        "qid": page["qid"],
        "wikidata_url": f"https://www.wikidata.org/wiki/{page['qid']}",
        "name_ja": page.get("title"),
        "name_en": None,
        "name_zh": None,
        "name_ko": None,
        "description_en": None,
        "description_ja": page.get("extract"),
        "coordinates": coords,
        "prefecture_code": infer_pref_code(page.get("extract") or page.get("title") or ""),
        "admin_code": None,
        "admin_name": None,
        "types": [],
        "wikipedia_kind_tags": [kind_tag],
        "source_anchor": f"wikipedia_list:{list_title}",
    }


def main() -> None:
    src = json.loads(SRC.read_text())
    by_list = src.get("by_list") or {}
    list_meta = src.get("lists") or []
    title_to_kind = {it["title"]: it["kind_tag"] for it in list_meta}

    master = json.loads(MASTER.read_text())
    items = master.get("attractions") or []
    by_qid = {a.get("qid"): a for a in items if a.get("qid")}

    enriched_total = 0
    inserted_total = 0
    skipped_noise = 0
    by_pref_added: dict[str, list[dict]] = {}
    by_pref_enriched_qids: dict[str, set[str]] = {}
    per_list_stats: dict[str, tuple[int, int, int]] = {}  # (added, enriched, skipped)

    for list_title, pages in by_list.items():
        kind_tag = title_to_kind.get(list_title)
        if not kind_tag or kind_tag in SKIP_KINDS:
            continue
        added = enriched = skipped = 0
        for p in pages:
            qid = p.get("qid")
            title = p.get("title") or ""
            if not qid or not title:
                continue
            if is_noise(title):
                skipped += 1
                skipped_noise += 1
                continue
            existing = by_qid.get(qid)
            if existing:
                tags = list(existing.get("wikipedia_kind_tags") or [])
                if kind_tag not in tags:
                    tags.append(kind_tag)
                    existing["wikipedia_kind_tags"] = tags
                    enriched += 1
                    enriched_total += 1
                    pref = (existing.get("prefecture_code") or "").strip()
                    if pref:
                        by_pref_enriched_qids.setdefault(pref, set()).add(qid)
            else:
                rec = to_master_record(p, kind_tag, list_title)
                items.append(rec)
                by_qid[qid] = rec
                added += 1
                inserted_total += 1
                pref = rec.get("prefecture_code") or ""
                if pref:
                    by_pref_added.setdefault(pref, []).append(rec)
        per_list_stats[list_title] = (added, enriched, skipped)

    master["attractions"] = items
    master["total_attractions"] = len(items)
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(
        f"master: +{inserted_total} new / {enriched_total} enriched / {skipped_noise} skipped (noise) / total {len(items)}"
    )
    print()
    print("per-list breakdown (skipped festival-class kinds; new / enriched / noise-skipped):")
    for title, (a, e, s) in sorted(per_list_stats.items(), key=lambda kv: -(kv[1][0] + kv[1][1])):
        print(f"  {title:35} +{a:4} new / {e:4} enriched / {s:4} skipped")
    print()

    # Per-pref propagation: pull in newly-added records and update existing ones with new tags
    pref_codes = set(by_pref_added) | set(by_pref_enriched_qids)
    for code in sorted(pref_codes):
        slug = CODE_TO_SLUG.get(code)
        if not slug:
            continue
        path = PREFS / f"{slug}.json"
        if not path.exists():
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
        for q in by_pref_enriched_qids.get(code, set()):
            entry = by_q_pref.get(q)
            master_entry = by_qid.get(q)
            if not entry or not master_entry:
                continue
            master_tags = list(master_entry.get("wikipedia_kind_tags") or [])
            entry_tags = list(entry.get("wikipedia_kind_tags") or [])
            merged = list(dict.fromkeys(entry_tags + master_tags))
            if merged != entry_tags:
                entry["wikipedia_kind_tags"] = merged
                enriched_pref += 1

        d["wikidata_attractions"] = existing
        tmp_p = path.with_suffix(".json.new")
        tmp_p.write_text(json.dumps(d, ensure_ascii=False, indent=2))
        tmp_p.replace(path)
        print(f"  {slug} (pref {code}): +{added_pref} new / {enriched_pref} enriched")


if __name__ == "__main__":
    main()
