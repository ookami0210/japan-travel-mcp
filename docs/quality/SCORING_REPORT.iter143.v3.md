# Tourism Agent Evaluation Scorecard — iter143 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 40/100 = **40.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 77/100 = **77.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.49 | 0 | 3 | 18 | 26 | 33 | 20 |
| groundedness | 4.28 | 1 | 0 | 2 | 7 | 47 | 43 |
| factual_accuracy | 4.20 | 1 | 0 | 2 | 13 | 43 | 41 |
| practical_usefulness | 3.19 | 0 | 3 | 24 | 33 | 31 | 9 |
| constraint_handling | 3.04 | 0 | 6 | 32 | 25 | 26 | 11 |
| travel_feasibility | 3.83 | 0 | 1 | 3 | 29 | 46 | 21 |
| specificity | 3.45 | 1 | 2 | 12 | 37 | 32 | 16 |
| expression_quality | 3.12 | 0 | 1 | 20 | 45 | 34 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.29 |
| get_hotels | 13 | 46.2% | 84.6% | 0.0% | 3.75 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.88 |
| get_local_food | 8 | 25.0% | 75.0% | 0.0% | 3.30 |
| get_local_specialty | 5 | 40.0% | 60.0% | 0.0% | 3.38 |
| get_spots | 32 | 43.8% | 87.5% | 3.1% | 3.73 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.62 |
| get_transport | 8 | 12.5% | 37.5% | 0.0% | 3.09 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.62 |
| search_area | 7 | 42.9% | 85.7% | 0.0% | 3.70 |
| search_hybrid | 15 | 33.3% | 73.3% | 0.0% | 3.36 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 11 | 11.0% |
| B | Ranking Failure (buried below noise) | 17 | 17.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 27 | 27.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 31 | 31.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.55, fail=A) — plan_feasibility_check: Accept both 'stops' and 'itinerary' parameter aliases OR return a feasibility verdict even on schema mismatch; pre-compu
- **R420-024** (sat 1.40, fail=A) — get_local_specialty: Add 鹿児島黒豚 / 松阪牛 / 神戸ビーフ etc. brand-meat entries even though they're not MAFF GI — sourced from prefectural livestock ass
- **R420-077** (sat 1.40, fail=A) — get_spots: When prefecture arg is unrecognised, fuzzy-match to nearest valid prefecture and return its spots + add an off-season ad
- **R420-032** (sat 2.35, fail=A) — search_hybrid: Index Himeji-jō official accessibility page (city.himeji.lg.jp/kanko/0000000131.html or equivalent); add accessibility-i
- **R420-038** (sat 2.35, fail=B) — get_local_food: Fix category classification for scraped_local_food: filter by body containing '酒造'/'sake' + '伏見'; surface Fushimi sake c
- **R420-058** (sat 2.35, fail=B) — search_hybrid: Add prefecture filter when toponym is unambiguous; surface canonical Miyajima ryokan cluster for 'romantic + island' int
- **R420-097** (sat 2.40, fail=A) — get_hotels: Filter hotels by municipality when query contains specific town name; add onsen-quality tags (alkali, 美肌, sulphur etc.).
- **R420-011** (sat 2.45, fail=F) — get_hotels: Surface OSM wheelchair=yes/limited for hotels; add 'accessibility' filter; restrict hotels-list to Hakone municipality w
- **R420-076** (sat 2.50, fail=B) — search_hybrid: Fire canonical_kansai_koyo_spots cluster when query contains both 京都 and 紅葉; prefecture-filter the hybrid corpus when to
- **R420-096** (sat 2.50, fail=A) — get_local_specialty: When category not specified, hoist METI crafts when present; add q-substring match on item names so 'kumejima-tsumugi' s
