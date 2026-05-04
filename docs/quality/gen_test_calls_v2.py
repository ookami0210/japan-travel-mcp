#!/usr/bin/env python3
"""
Generate test_calls_v2.json from test_calls.json by adding expected_entities
for each case.

The expected_entities list serves as ground-truth recall for the v4-data
rubric (build_v4data_prompts.py). For each case the list should contain the
canonical entity name(s) plus close synonyms so the judge can evaluate
recall_of_known objectively.

Strategy:
  - The `topic` field of each L1 case is already the primary entity (e.g.
    "出雲大社", "姫路城"). For L1 cases we use topic as the primary expected
    entity; we add known multilingual or synonym variants from a small
    EXPLICIT map.
  - For L2/L3/L4 cases the topic is more abstract (e.g. "北海道 農業体験",
    "東北 祭り"). We can't derive single canonical entities from the topic.
    For these we leave expected_entities empty — the judge will rely on the
    other dimensions (data_completeness via topic semantic match).

Run:
  python3 docs/quality/gen_test_calls_v2.py
"""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent

# Manual map of L1 topics → expected_entities (canonical names + synonyms).
# Only add entries here when the topic is a single concrete asset whose
# canonical names are unambiguous. Wildcards / themes (e.g. "東北 祭り")
# do not belong here.
TOPIC_EXPECTED: dict[str, list[str]] = {
    # L1 — single-entity famous landmarks (target for recall_of_known)
    "但馬牛": ["但馬牛", "Tajima beef", "Tajima-gyu", "但馬ビーフ"],
    "南山城村 茶畑": ["南山城村", "南山城茶", "Minami-Yamashiro", "宇治茶 南山城"],
    "吉田の火祭り": ["吉田の火祭り", "吉田火祭り", "Yoshida Fire Festival", "Yoshida no Hi-Matsuri", "北口本宮冨士浅間神社"],
    "中芸ゆず": ["中芸ゆず", "馬路村ゆず", "中芸地区", "中芸 柚子", "Nakagei yuzu"],
    "弘前公園桜": ["弘前公園", "弘前城", "Hirosaki Castle", "Hirosaki Park", "弘前さくらまつり"],
    "出雲大社": ["出雲大社", "Izumo-taisha", "Izumo Grand Shrine", "Izumo Oyashiro"],
    "厳島神社": ["厳島神社", "Itsukushima Shrine", "Itsukushima-jinja", "宮島", "Miyajima"],
    "熊野古道": ["熊野古道", "Kumano Kodo", "中辺路", "小辺路", "大辺路", "伊勢路", "熊野三山"],
    "姫路城": ["姫路城", "Himeji Castle", "Himeji-jo", "白鷺城"],
    "文楽": ["文楽", "人形浄瑠璃", "Bunraku", "国立文楽劇場", "Ningyo Joruri"],
    "弓浜絣": ["弓浜絣", "Yumihama-gasuri", "弓ヶ浜絣", "弓浜カスリ"],
    "直島": ["直島", "Naoshima", "ベネッセ", "地中美術館", "李禹煥美術館", "Naoshima Art Island"],
    "角館 武家屋敷": ["角館", "武家屋敷", "Kakunodate", "石黒家", "青柳家", "samurai district"],
    "尾道": ["尾道", "Onomichi", "千光寺", "尾道市", "Onomichi city"],
    "那智の滝": ["那智の滝", "Nachi Falls", "Nachi-no-taki", "飛瀧神社", "熊野那智大社"],
    "知床半島": ["知床半島", "Shiretoko", "知床国立公園", "Shiretoko Peninsula", "Shiretoko Goko"],
    "出羽三山": ["出羽三山", "Dewa Sanzan", "羽黒山", "月山", "湯殿山"],
    "屋久島": ["屋久島", "Yakushima", "縄文杉", "Yakushima Island"],
    "佐渡島": ["佐渡島", "佐渡", "Sado", "Sado Island", "金山", "Sado Gold Mine"],

    # L2 — multi-entity / regional
    "東北 秘湯ranges": ["乳頭温泉", "玉川温泉", "鶴の湯", "酸ヶ湯", "Nyuto onsen", "Tsuru-no-yu"],
    "四国遍路 宿坊": ["金剛峯寺", "Ekoin", "Fukuchiin", "Rengejoin", "宿坊", "shukubo", "高野山"],
    "高野山宿坊": ["高野山", "Koyasan", "金剛峯寺", "Kongobuji", "Ekoin", "Fukuchiin", "shukubo", "宿坊"],
    "新潟 酒蔵": ["八海山", "久保田", "越乃寒梅", "Hakkaisan", "sake brewery", "酒蔵"],
    "白馬 スキー場+温泉": ["白馬", "Hakuba", "白馬八方尾根", "Goryu", "白馬大池", "Happo-One"],
    "東北 桜": ["弘前公園", "Hirosaki", "三春滝桜", "北上展勝地", "角館"],
    "関西 桜": ["吉野山", "Yoshino", "醍醐寺", "Daigoji", "嵐山", "哲学の道"],
    "関西 紅葉": ["嵐山", "東福寺", "永観堂", "Tofukuji", "Eikando"],

    # L4 — broad themes
    "浮世絵風景": ["富士山", "Mt. Fuji", "Hokusai", "三保松原", "Miho no Matsubara"],
    "戦争遺跡 日常": ["原爆ドーム", "Atomic Bomb Dome", "原爆の子の像", "広島平和記念公園", "Hiroshima Peace Memorial Park", "長崎原爆資料館"],
    "震災復興 沿岸": ["気仙沼", "陸前高田", "南三陸", "東日本大震災", "Rikuzentakata", "Kesennuma"],
    "縄文文化 現代": ["北海道・北東北の縄文遺跡群", "三内丸山遺跡", "Sannai-Maruyama", "Jomon"],
    "産業遺産": ["富岡製糸場", "Tomioka Silk Mill", "明治日本の産業革命遺産", "八幡製鐵所", "Tomioka"],
    "工芸の町": ["越前", "輪島塗", "Wajima", "備前焼", "Bizen", "九谷焼", "Kutani"],
    "街道 宿場町": ["中山道", "Nakasendo", "妻籠宿", "Tsumago", "馬籠宿", "Magome", "宿場"],
    "隠れキリシタン": ["長崎と天草地方の潜伏キリシタン関連遺産", "大浦天主堂", "Oura Cathedral", "Hidden Christian"],
    "UNESCO 知られざる": ["佐渡金山", "Sado Gold Mine", "石見銀山", "Iwami Ginzan", "百舌鳥・古市古墳群", "Mozu-Furuichi"],
}


def main() -> None:
    src = REPO / "docs" / "quality" / "test_calls.json"
    dst = REPO / "docs" / "quality" / "test_calls_v2.json"

    cases = json.loads(src.read_text())
    out = []
    annotated_count = 0
    for c in cases:
        new = dict(c)
        topic = c.get("topic", "")
        expected = TOPIC_EXPECTED.get(topic)
        if expected:
            new["expected_entities"] = expected
            annotated_count += 1
        else:
            new["expected_entities"] = []
        out.append(new)

    dst.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    print(f"wrote {dst} with {len(out)} cases ({annotated_count} have expected_entities)")


if __name__ == "__main__":
    main()
