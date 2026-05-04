#!/usr/bin/env python3
"""
Stratified random test-case generator.

Reads stratification_scheme.json and an optional seed corpus (existing
test_calls.json). Picks a tool + plausible args for each slot in the
stratification. The query text itself is left for a Sonnet 4.5 subagent
to write naturally — this script outputs a SCAFFOLD with a `query: null`
field that the LLM will fill in.

Two-stage so the heavy LLM call is one batched prompt instead of 100.

Usage:
  python3 docs/quality/gen_random_tests.py --seed 42 --out test_calls_random.scaffold.json
"""
import argparse, json, random
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
SCHEME = REPO / "docs" / "quality" / "stratification_scheme.json"

# ── tool argument templates by category ─────────────────────────────────
# Each entry: (tool, args-dict-template). prefecture/municipality/q are
# placeholders chosen at sample time.

PREFECTURES = [
    "Hokkaido","Aomori","Iwate","Miyagi","Akita","Yamagata","Fukushima",
    "Ibaraki","Tochigi","Gunma","Saitama","Chiba","Tokyo","Kanagawa",
    "Niigata","Toyama","Ishikawa","Fukui","Yamanashi","Nagano","Gifu",
    "Shizuoka","Aichi","Mie","Shiga","Kyoto","Osaka","Hyogo","Nara",
    "Wakayama","Tottori","Shimane","Okayama","Hiroshima","Yamaguchi",
    "Tokushima","Kagawa","Ehime","Kochi","Fukuoka","Saga","Nagasaki",
    "Kumamoto","Oita","Miyazaki","Kagoshima","Okinawa",
]

POPULAR_CITIES = {
    "Tokyo": ["浅草", "新宿", "渋谷", "上野", "銀座"],
    "Kyoto": ["嵐山", "東山", "祇園", "宇治", "伏見"],
    "Osaka": ["道頓堀", "難波", "梅田"],
    "Hokkaido": ["札幌", "函館", "小樽", "富良野", "知床"],
    "Hiroshima": ["宮島", "尾道", "福山"],
    "Nagano": ["軽井沢", "松本", "白馬"],
    "Aomori": ["弘前", "青森"],
    "Akita": ["角館"],
    "Wakayama": ["熊野", "高野山"],
    "Nara": ["奈良市", "斑鳩"],
    "Kagoshima": ["屋久島"],
    "Kanagawa": ["鎌倉", "箱根", "横浜"],
}

POPULAR_QUERIES = [
    "富士山", "京都 紅葉", "嵐山", "金閣寺", "清水寺", "厳島神社", "出雲大社",
    "屋久島", "白川郷", "兼六園", "松本城", "姫路城", "東大寺", "高野山",
    "熊野古道", "奥入瀬", "知床", "尾瀬", "上高地", "立山", "竹田城",
    "縄文遺跡", "原爆ドーム", "明治神宮", "鶴岡八幡宮",
]

# Tool selection per category — weighted: how often each tool fits the
# category's intent.
CATEGORY_TOOL_WEIGHTS = {
    "classic":      {"search_area": 5, "get_spots": 4, "search_hybrid": 3, "get_japan_heritage": 1, "get_multilingual": 2},
    "family":       {"get_spots": 4, "search_area": 3, "search_hybrid": 3},
    "couple":       {"get_hotels": 3, "search_area": 3, "get_spots": 2, "search_hybrid": 2},
    "rainy":        {"search_area": 3, "search_hybrid": 3, "get_spots": 2},
    "seasonal":     {"get_events": 2, "get_festivals": 2, "search_area": 3, "get_spots": 2},
    "transport":    {"get_transport": 4, "get_spots": 2},
    "budget":       {"get_hotels": 3, "search_area": 2, "get_spots": 2},
    "food_culture": {"get_local_food": 3, "get_local_specialty": 3, "get_traditional_arts": 2},
    "remote_niche": {"get_japan_heritage": 2, "get_local_specialty": 2, "get_dmo": 2, "search_area": 2},
}


def pick_lang(scheme, rng):
    weights = scheme["language_weights"]
    langs, ws = list(weights.keys()), list(weights.values())
    return rng.choices(langs, weights=ws, k=1)[0]


def pick_pref(rng):
    return rng.choice(PREFECTURES)


def pick_city_for_pref(pref, rng):
    cities = POPULAR_CITIES.get(pref, [])
    if not cities:
        return None
    return rng.choice(cities)


def pick_q(rng):
    return rng.choice(POPULAR_QUERIES)


def build_args(tool, lang, rng):
    """Build args dict for a given tool. Some args are tool-specific."""
    if tool == "search_area":
        args = {"q": pick_q(rng), "lang": lang}
        return args
    if tool == "search_hybrid":
        return {"q": pick_q(rng), "lang": lang}
    if tool == "search_semantic":
        return {"q": pick_q(rng), "lang": lang}
    if tool == "get_spots":
        pref = pick_pref(rng)
        city = pick_city_for_pref(pref, rng)
        args = {"prefecture": pref}
        if city:
            args["municipality"] = city
        return args
    if tool == "get_hotels":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_transport":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_events":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_multilingual":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_description":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_local_specialty":
        return {"prefecture": pick_pref(rng), "lang": lang, "category": rng.choice(["food", "craft", "industrial"])}
    if tool == "get_traditional_arts":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_local_food":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_festivals":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_japan_heritage":
        return {"prefecture": pick_pref(rng), "lang": lang}
    if tool == "get_dmo":
        return {"prefecture": pick_pref(rng), "lang": lang}
    return {"lang": lang}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--out", default="test_calls_random.scaffold.json")
    args = ap.parse_args()

    rng = random.Random(args.seed)
    scheme = json.loads(SCHEME.read_text())

    cases = []
    counter = 1
    for cat in scheme["categories"]:
        weights = CATEGORY_TOOL_WEIGHTS[cat["id"]]
        tools, ws = list(weights.keys()), list(weights.values())
        for _ in range(cat["count"]):
            tool = rng.choices(tools, weights=ws, k=1)[0]
            lang = pick_lang(scheme, rng)
            tool_args = build_args(tool, lang, rng)
            cases.append({
                "id": f"R{args.seed}-{counter:03d}",
                "category": cat["id"],
                "category_label": cat["label"],
                "intent": cat["intent"],
                "lang": lang,
                "tool": tool,
                "args": tool_args,
                "query": None,  # Sonnet 4.5 to fill in
            })
            counter += 1

    # Append adversarial set verbatim
    for adv in scheme["adversarial_set"]:
        cases.append({
            "id": adv["id"],
            "category": "adversarial",
            "category_label": "敵対的テスト",
            "intent": adv["intent"],
            "trap": adv["trap"],
            "lang": "ja",  # adversarial defaults to JA — agent must catch in any lang
            "tool": "search_area",  # fallback; LLM may rewrite
            "args": {"q": adv["intent"], "lang": "ja"},
            "query": None,
        })

    out = REPO / "docs" / "quality" / args.out
    out.write_text(json.dumps(cases, ensure_ascii=False, indent=2))
    print(f"wrote {len(cases)} scaffold cases ({100} stratified + {len(scheme['adversarial_set'])} adversarial) → {out}")


if __name__ == "__main__":
    main()
