#!/usr/bin/env python3
"""
Inject canonical-landmark records that the upstream Wikidata fetch missed.
These are well-known entities that Q-typed as something other than our
ATTRACTION_TYPES list (e.g. さっぽろ雪まつり is Q132241 'recurring event'
which we don't fetch). Adding them with full multilingual names + heritage
labels + specific kind_tags lets the runtime ranker surface them at the top.

Each record carries 4-language names so langCount=4 (max prominence boost),
heritage_designations where applicable, and a kind_tag that intent
dictionary can gate on.

Targets:
  Q1023167  さっぽろ雪まつり (Hokkaido) — snow_festival kind
  Q11264960 長岡まつり大花火大会 (Niigata) — hanabi kind
  Q21156974 ファーム富田 (Hokkaido, Nakafurano) — lavender_field kind
  Q1056108  縄文杉 (Kagoshima, Yakushima) — UNESCO + Special Natural Monument
  Q11538134 大曲の花火 (Akita) — hanabi kind
  Q11247714 隅田川花火大会 (Tokyo) — hanabi kind  (already in master? verify)
"""
import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
MASTER = REPO / "data/_state/wikidata_attractions.json"
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

LANDMARKS = [
    {
        "qid": "Q1023167",
        "wikidata_url": "https://www.wikidata.org/wiki/Q1023167",
        "name_ja": "さっぽろ雪まつり",
        "name_en": "Sapporo Snow Festival",
        "name_zh": "札幌雪祭",
        "name_ko": "삿포로 눈축제",
        "description_en": "Annual snow festival held every February in Sapporo, Hokkaido. One of Japan's largest winter events with hundreds of snow and ice sculptures.",
        "coordinates": {"lat": 43.0586, "lng": 141.3556},
        "prefecture_code": "01",
        "admin_code": "011002",
        "admin_name": "札幌市",
        "types": [],
        "wikipedia_kind_tags": ["yuki_matsuri", "snow_festival", "winter_event"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q21156974",
        "wikidata_url": "https://www.wikidata.org/wiki/Q21156974",
        "name_ja": "ファーム富田",
        "name_en": "Farm Tomita",
        "name_zh": "富田农场",
        "name_ko": "팜 도미타",
        "description_en": "Lavender farm in Nakafurano, Hokkaido. Iconic destination for summer lavender viewing (mid-June through July).",
        "coordinates": {"lat": 43.4156, "lng": 142.4667},
        "prefecture_code": "01",
        "admin_code": "01459",
        "admin_name": "中富良野町",
        "types": [],
        "wikipedia_kind_tags": ["lavender_field", "lavender", "flower_garden"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q11247714",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11247714",
        "name_ja": "隅田川花火大会",
        "name_en": "Sumida River Fireworks Festival",
        "name_zh": "隅田川花火大会",
        "name_ko": "스미다강 불꽃축제",
        "description_en": "Annual fireworks festival held in late July along the Sumida River, Tokyo. One of Japan's most famous summer fireworks events.",
        "coordinates": {"lat": 35.7167, "lng": 139.8000},
        "prefecture_code": "13",
        "admin_code": "13107",
        "admin_name": "墨田区",
        "types": [],
        "wikipedia_kind_tags": ["hanabi", "fireworks", "summer_festival"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q11538134",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11538134",
        "name_ja": "大曲の花火",
        "name_en": "Omagari National Fireworks Competition",
        "name_zh": "大曲花火大会",
        "name_ko": "오마가리 전국 불꽃경기대회",
        "description_en": "National fireworks competition held annually in late August in Daisen, Akita Prefecture. One of Japan's three great fireworks festivals.",
        "coordinates": {"lat": 39.4500, "lng": 140.4833},
        "prefecture_code": "05",
        "admin_code": "05212",
        "admin_name": "大仙市",
        "types": [],
        "wikipedia_kind_tags": ["hanabi", "fireworks", "summer_festival"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q11264960",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11264960",
        "name_ja": "長岡まつり大花火大会",
        "name_en": "Nagaoka Festival Grand Fireworks",
        "name_zh": "长冈祭大花火大会",
        "name_ko": "나가오카 마쓰리 대불꽃대회",
        "description_en": "Annual fireworks festival held in early August in Nagaoka, Niigata. One of Japan's three great fireworks festivals, commemorating WWII air raids.",
        "coordinates": {"lat": 37.4500, "lng": 138.8500},
        "prefecture_code": "15",
        "admin_code": "15202",
        "admin_name": "長岡市",
        "types": [],
        "wikipedia_kind_tags": ["hanabi", "fireworks", "summer_festival"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q1056108",
        "wikidata_url": "https://www.wikidata.org/wiki/Q1056108",
        "name_ja": "縄文杉",
        "name_en": "Jōmon Sugi",
        "name_zh": "绳文杉",
        "name_ko": "조몬스기",
        "description_en": "Ancient Japanese cedar tree on Yakushima, Kagoshima Prefecture, estimated 2,000-7,200 years old. Designated as a Special Natural Monument.",
        "coordinates": {"lat": 30.3556, "lng": 130.5453},
        "prefecture_code": "46",
        "admin_code": "46505",
        "admin_name": "屋久島町",
        "types": [],
        "heritage_designations": ["Q9259", "Q96207459", "Q43113623"],
        "wikipedia_kind_tags": ["sacred_tree", "yakusugi", "ancient_tree"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q11514108",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11514108",
        "name_ja": "西瀬戸自動車道",
        "name_en": "Shimanami Kaidō",
        "name_zh": "島波海道",
        "name_ko": "시마나미카이도",
        "description_en": "Cycling expressway connecting Honshu (Onomichi, Hiroshima) and Shikoku (Imabari, Ehime) via 6 islands and 7 bridges across the Seto Inland Sea. Japan's most iconic cycling route.",
        "coordinates": {"lat": 34.3167, "lng": 133.0833},
        "prefecture_code": "34",
        "admin_code": "34205",
        "admin_name": "尾道市",
        "types": [],
        "wikipedia_kind_tags": ["cycling_route", "shimanami", "bridge"],
        "source_anchor": "manual_canonical_injection",
    },
    # Also add Ehime side
    {
        "qid": "Q11514108-imabari",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11514108",
        "name_ja": "しまなみ海道 (今治)",
        "name_en": "Shimanami Kaidō (Imabari side)",
        "name_zh": "島波海道（今治）",
        "name_ko": "시마나미카이도 (이마바리)",
        "description_en": "Imabari, Ehime end of the Shimanami Kaidō cycling route. Most famous cycling route in Japan, 70km Honshu-Shikoku via 6 islands.",
        "coordinates": {"lat": 34.0667, "lng": 132.9833},
        "prefecture_code": "38",
        "admin_code": "38202",
        "admin_name": "今治市",
        "types": [],
        "wikipedia_kind_tags": ["cycling_route", "shimanami", "bridge"],
        "source_anchor": "manual_canonical_injection",
    },
    {
        "qid": "Q11635566",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11635566",
        "name_ja": "長岡まつり",
        "name_en": "Nagaoka Festival",
        "name_zh": "长冈祭",
        "name_ko": "나가오카 마쓰리",
        "description_en": "Annual festival in Nagaoka, Niigata. Features the Nagaoka Grand Fireworks Festival.",
        "coordinates": {"lat": 37.4500, "lng": 138.8500},
        "prefecture_code": "15",
        "admin_code": "15202",
        "admin_name": "長岡市",
        "types": [],
        "wikipedia_kind_tags": ["matsuri", "summer_festival"],
        "source_anchor": "manual_canonical_injection",
    },
    # 越乃寒梅 sake brewery (Niigata)
    {
        "qid": "Q11663091",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11663091",
        "name_ja": "越乃寒梅",
        "name_en": "Koshi no Kanbai",
        "name_zh": "越乃寒梅",
        "name_ko": "고시노 칸바이",
        "description_en": "Famous sake brand from Niigata Prefecture, brewed by Ishimoto Shuzo since 1907. One of Niigata's three great sake brands (越の三梅).",
        "coordinates": None,
        "prefecture_code": "15",
        "admin_code": "15202",
        "admin_name": "新潟市",
        "types": [],
        "wikipedia_kind_tags": ["sake_brand", "sake_brewery", "japanese_sake"],
        "source_anchor": "manual_canonical_injection",
    },
    # 八海山 sake brewery
    {
        "qid": "Q11342987",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11342987",
        "name_ja": "八海山 (酒)",
        "name_en": "Hakkaisan (sake)",
        "name_zh": "八海山（酒）",
        "name_ko": "핫카이산 (술)",
        "description_en": "Premium sake brewed by Hakkaisan Brewery in Minamiuonuma, Niigata since 1922. Named after Mount Hakkai.",
        "coordinates": {"lat": 37.0667, "lng": 138.8667},
        "prefecture_code": "15",
        "admin_code": "15226",
        "admin_name": "南魚沼市",
        "types": [],
        "wikipedia_kind_tags": ["sake_brand", "sake_brewery", "japanese_sake"],
        "source_anchor": "manual_canonical_injection",
    },
    # 久保田 sake brand
    {
        "qid": "Q11399030",
        "wikidata_url": "https://www.wikidata.org/wiki/Q11399030",
        "name_ja": "久保田 (酒)",
        "name_en": "Kubota (sake)",
        "name_zh": "久保田（酒）",
        "name_ko": "쿠보타 (술)",
        "description_en": "Premium sake brand from Asahi Shuzo in Nagaoka, Niigata. One of Niigata's three great sake brands (越の三梅).",
        "coordinates": {"lat": 37.4500, "lng": 138.8500},
        "prefecture_code": "15",
        "admin_code": "15202",
        "admin_name": "長岡市",
        "types": [],
        "wikipedia_kind_tags": ["sake_brand", "sake_brewery", "japanese_sake"],
        "source_anchor": "manual_canonical_injection",
    },
]


def main() -> None:
    master = json.loads(MASTER.read_text())
    items = master.get("attractions", [])
    existing_qids = {a.get("qid") for a in items if a.get("qid")}

    added = 0
    by_pref: dict[str, list[dict]] = {}
    for rec in LANDMARKS:
        if rec["qid"] in existing_qids:
            print(f'  skip {rec["qid"]} ({rec["name_ja"]}) — already in master')
            continue
        items.append(rec)
        added += 1
        by_pref.setdefault(rec["prefecture_code"], []).append(rec)

    master["attractions"] = items
    master["total_attractions"] = len(items)
    tmp = MASTER.with_suffix(".json.new")
    tmp.write_text(json.dumps(master, ensure_ascii=False, indent=2))
    tmp.replace(MASTER)
    print(f'wrote master: +{added} entries, total {len(items)}')

    # Write to per-prefecture files
    for code, recs in by_pref.items():
        slug = CODE_TO_SLUG.get(code)
        if not slug:
            continue
        path = PREFS / f"{slug}.json"
        if not path.exists():
            print(f'  skip {slug} (no pref file)')
            continue
        d = json.loads(path.read_text())
        existing = d.get("wikidata_attractions") or []
        existing_q = {a.get("qid") for a in existing}
        added_pref = 0
        for r in recs:
            if r["qid"] in existing_q:
                continue
            existing.append(r)
            added_pref += 1
        d["wikidata_attractions"] = existing
        tmp_p = path.with_suffix(".json.new")
        tmp_p.write_text(json.dumps(d, ensure_ascii=False, indent=2))
        tmp_p.replace(path)
        print(f'  {slug}: +{added_pref}')


if __name__ == "__main__":
    main()
