# Tourism Agent Evaluation Scorecard — iter162-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 238/420 = **56.7%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 392/420 = **93.3%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.86 | 0 | 1 | 23 | 120 | 164 | 112 |
| groundedness | 4.55 | 1 | 0 | 4 | 17 | 140 | 258 |
| factual_accuracy | 4.43 | 1 | 0 | 3 | 23 | 179 | 214 |
| practical_usefulness | 3.72 | 0 | 2 | 27 | 140 | 168 | 83 |
| constraint_handling | 3.58 | 0 | 3 | 48 | 152 | 137 | 80 |
| travel_feasibility | 4.15 | 1 | 0 | 2 | 68 | 208 | 141 |
| specificity | 3.69 | 0 | 3 | 29 | 153 | 145 | 90 |
| expression_quality | 3.59 | 0 | 2 | 20 | 143 | 238 | 17 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 76.0% | 100.0% | 0.0% | 4.38 |
| get_hotels | 56 | 57.1% | 94.6% | 0.0% | 3.83 |
| get_japan_heritage | 9 | 44.4% | 100.0% | 0.0% | 3.96 |
| get_local_food | 35 | 37.1% | 85.7% | 0.0% | 3.69 |
| get_local_specialty | 22 | 40.9% | 90.9% | 0.0% | 3.89 |
| get_spots | 136 | 55.9% | 92.6% | 0.0% | 3.95 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_transport | 34 | 79.4% | 100.0% | 0.0% | 4.09 |
| plan_feasibility_check | 5 | 80.0% | 80.0% | 0.0% | 4.15 |
| search_area | 30 | 76.7% | 96.7% | 0.0% | 4.28 |
| search_hybrid | 65 | 46.2% | 90.8% | 0.0% | 3.80 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 65 | 15.5% |
| B | Ranking Failure (buried below noise) | 50 | 11.9% |
| C | Reasoning Failure (synthesised wrong) | 17 | 4.0% |
| D | Grounding Failure (made up content) | 1 | 0.2% |
| E | Practicality Failure (correct but unusable) | 5 | 1.2% |
| F | Constraint Failure (ignored explicit constraints) | 62 | 14.8% |
| G | Coverage Failure (too few options) | 33 | 7.9% |
| H | Safety / Cultural Failure | 1 | 0.2% |
| — | (no failure category, ≥4 across the board) | 186 | 44.3% |

## Top improvement hints (sample of worst 10)

- **R-040** (sat 0.70, fail=A) — get_spots: city='山形市' filter likely excluded 蔵王 (tagged 上山市 or 蔵王町). Add city-name expansion for famous resort areas.
- **R-267** (sat 1.70, fail=A) — plan_feasibility_check: Add city-qid alias map (Q11509 Tokyo, Q37643 Nara) to plan_feasibility_check or fallback to city_centroid lookup for kno
- **R-024** (sat 1.95, fail=B) — get_local_food: Strengthen body_paragraph dedup + nav-chrome filter; surface Hiroshima oyster MAFF GI record.
- **R-058** (sat 2.30, fail=A) — get_hotels: city='城崎' matches '城崎温泉' — verify slug normalization in get_hotels prefecture+city filter. Add canonical_onsen_towns hoi
- **R-070** (sat 2.30, fail=B) — search_area: Rank wikidata peace entities above municipal admin nav-pages for 平和 queries
- **R-171** (sat 2.30, fail=A) — get_local_specialty: Fix get_local_specialty q-filter so '茶' matches 宇治茶 GI record; add canonical_kyoto_tea block listing 宇治茶・玉露・抹茶 productio
- **R-284** (sat 2.35, fail=B) — search_hybrid: Dedupe hybrid results by spot id; boost nationally famous parks.
- **R-064** (sat 2.35, fail=B) — get_local_food: Switch to get_spots for olive-grove sightseeing; filter out nav-chrome names in scraped_local_food extractor
- **R-085** (sat 2.35, fail=D) — get_spots: Fix municipal_scrape municipality assignment — niigata-kankou.or.jp items must inherit per-event location, not feed-leve
- **R-094** (sat 2.35, fail=F) — get_local_food: Tighten get_local_food to honor Noto sub-region when prefecture=Ishikawa and query mentions 能登
