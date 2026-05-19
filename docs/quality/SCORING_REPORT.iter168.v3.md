# Tourism Agent Evaluation Scorecard — iter168 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 85/100 = **85.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.51 | 0 | 1 | 6 | 47 | 33 | 13 |
| groundedness | 4.14 | 0 | 0 | 0 | 12 | 62 | 26 |
| factual_accuracy | 4.15 | 0 | 0 | 0 | 9 | 67 | 24 |
| practical_usefulness | 3.12 | 0 | 1 | 24 | 45 | 22 | 8 |
| constraint_handling | 2.93 | 0 | 2 | 30 | 44 | 21 | 3 |
| travel_feasibility | 3.90 | 0 | 0 | 1 | 21 | 65 | 13 |
| specificity | 3.28 | 0 | 0 | 15 | 52 | 23 | 10 |
| expression_quality | 3.06 | 0 | 0 | 25 | 46 | 27 | 2 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 2 | 0.0% | 100.0% | 0.0% | 3.31 |
| get_hotels | 16 | 25.0% | 62.5% | 0.0% | 3.34 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 4.06 |
| get_local_food | 11 | 27.3% | 90.9% | 0.0% | 3.55 |
| get_local_specialty | 3 | 0.0% | 66.7% | 0.0% | 3.08 |
| get_spots | 40 | 30.0% | 92.5% | 0.0% | 3.57 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 4 | 50.0% | 100.0% | 0.0% | 3.78 |
| search_area | 5 | 20.0% | 80.0% | 0.0% | 3.15 |
| search_hybrid | 16 | 31.2% | 81.2% | 0.0% | 3.59 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 24 | 24.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 22 | 22.0% |
| G | Coverage Failure (too few options) | 20 | 20.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 23 | 23.0% |

## Top improvement hints (sample of worst 10)

- **R420v8-087** (sat 2.15, fail=F) — get_local_specialty: Route '100均' / '安い土産' queries to a generic budget-souvenir advisory block, not GI registry
- **R420v8-004** (sat 2.35, fail=B) — search_hybrid: Detect prefecture from query topic; for ambiguous all-weather queries fan-out canonical_hokkaido_indoor.
- **R420v8-032** (sat 2.35, fail=A) — get_spots: Drop kyushu_fanout when prefecture=Okinawa; add naha_kids_spots block
- **R420v8-082** (sat 2.35, fail=B) — search_area: Add canonical_anime_pilgrimage cluster keyed on ガルパン/Oarai; tighten search_area lexical match
- **R420v8-016** (sat 2.45, fail=A) — search_hybrid: Add region_prefecture_codes filter to search_hybrid when region name in query; add canonical_tohoku_scenic_rail block.
- **R420v8-046** (sat 2.60, fail=B) — get_spots: Add nara_walking_course + couple-ryokan canonical (奈良ホテル, 古都の宿むさし野, 飛鳥荘)
- **R420v8-011** (sat 2.70, fail=B) — get_local_food: Filter scraped_local_food by region/municipality if query contains regional name (能登).
- **R420v8-013** (sat 2.70, fail=B) — get_hotels: Add canonical_kurokawa_onsen cluster with the 湯巡り手形 system and 28 member-ryokan.
- **R420v8-050** (sat 2.75, fail=F) — get_hotels: Implement hotel_type='budget'/'hostel' filtering on get_hotels; surface canonical_budget_lodging block populated
- **R420v8-005** (sat 2.85, fail=A) — get_spots: Add canonical_abandoned_villages or 廃村 / 限界集落 cluster for Shimane (e.g. Hayasaki, Mukago).
