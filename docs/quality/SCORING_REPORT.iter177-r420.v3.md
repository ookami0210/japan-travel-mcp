# Tourism Agent Evaluation Scorecard — iter177-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 285/420 = **67.9%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 416/420 = **99.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.30 | 0 | 0 | 2 | 78 | 134 | 206 |
| groundedness | 4.70 | 0 | 0 | 0 | 3 | 118 | 299 |
| factual_accuracy | 4.65 | 0 | 0 | 0 | 5 | 135 | 280 |
| practical_usefulness | 4.07 | 0 | 0 | 6 | 121 | 132 | 161 |
| constraint_handling | 3.83 | 0 | 0 | 27 | 138 | 134 | 121 |
| travel_feasibility | 4.58 | 0 | 0 | 0 | 17 | 144 | 259 |
| specificity | 4.12 | 0 | 0 | 8 | 113 | 119 | 180 |
| expression_quality | 3.54 | 0 | 0 | 17 | 168 | 225 | 10 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 84.0% | 100.0% | 0.0% | 4.54 |
| get_hotels | 56 | 73.2% | 96.4% | 0.0% | 4.17 |
| get_japan_heritage | 9 | 66.7% | 100.0% | 0.0% | 4.38 |
| get_local_food | 35 | 48.6% | 100.0% | 0.0% | 4.10 |
| get_local_specialty | 22 | 68.2% | 100.0% | 0.0% | 4.16 |
| get_spots | 136 | 66.2% | 100.0% | 0.0% | 4.16 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.75 |
| get_transport | 34 | 61.8% | 100.0% | 0.0% | 4.29 |
| plan_feasibility_check | 5 | 100.0% | 100.0% | 0.0% | 4.60 |
| search_area | 30 | 76.7% | 100.0% | 0.0% | 4.27 |
| search_hybrid | 65 | 67.7% | 96.9% | 0.0% | 4.25 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 52 | 12.4% |
| B | Ranking Failure (buried below noise) | 57 | 13.6% |
| C | Reasoning Failure (synthesised wrong) | 1 | 0.2% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 0.7% |
| F | Constraint Failure (ignored explicit constraints) | 60 | 14.3% |
| G | Coverage Failure (too few options) | 17 | 4.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 230 | 54.8% |

## Top improvement hints (sample of worst 10)

- **R-098** (sat 2.40, fail=A) — get_hotels: Add canonical_usj_family_hotels (8 official + partner hotels) triggered by 'Universal Studios' / 'USJ' tokens.
- **R-400** (sat 2.50, fail=A) — search_hybrid: Add canonical_live_action_movie_locations cluster with Sekachu Shodoshima sub-spots; fanout 小豆島 film tourism content.
- **R-097** (sat 2.65, fail=A) — get_hotels: Add canonical_tokyo_disney_hotels cluster covering the 6 official + partner hotels; ensure city='浦安' filter returns Maih
- **R-334** (sat 2.95, fail=B) — search_hybrid: Detect 'Hokkaido' in NL query and inject prefecture_code=01 into search_hybrid call; add canonical_hokkaido_indoor block
- **R-312** (sat 3.05, fail=B) — search_hybrid: Filter canonical_halal_food_destinations by prefecture/region when query specifies Kyushu; add Fukuoka-Masjid + halal-Ha
- **R-313** (sat 3.05, fail=E) — search_hybrid: Add canonical_ramadan_advisory block with mosque iftar schedule + sightseeing-hours pointer (note Japan venues are not a
- **R-035** (sat 3.10, fail=A) — get_hotels: Augment hotel master with general 下呂 onsen ryokan; or auto-trigger canonical_gero_onsen block analogous to canonical_kin
- **R-224** (sat 3.10, fail=G) — search_hybrid: Add canonical_less_crowded_koyo cluster fired by '〜以外 / besides / less crowded / alternative' negative-constraint keywor
- **R-073** (sat 3.20, fail=G) — get_spots: Add Miyazaki canonical_beach_destinations cluster (Aoshima / Hyuga / Hi-no-misaki / Tsuno) to compensate for sparse beac
- **R-147** (sat 3.25, fail=G) — get_hotels: Build canonical_aso_couple cluster including 内牧温泉, 黒川温泉 cross-link, and crater-eruption-advisory note.
