# Tourism Agent Evaluation Scorecard — iter137 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 18/100 = **18.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 64/100 = **64.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.01 | 1 | 7 | 19 | 40 | 29 | 4 |
| groundedness | 3.95 | 3 | 0 | 3 | 9 | 63 | 22 |
| factual_accuracy | 3.84 | 4 | 0 | 3 | 15 | 57 | 21 |
| practical_usefulness | 2.68 | 3 | 5 | 30 | 45 | 17 | 0 |
| constraint_handling | 2.48 | 1 | 12 | 42 | 28 | 17 | 0 |
| travel_feasibility | 3.44 | 3 | 2 | 4 | 32 | 57 | 2 |
| specificity | 2.80 | 4 | 3 | 25 | 47 | 19 | 2 |
| expression_quality | 2.79 | 0 | 3 | 31 | 50 | 16 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 0.0% | 0.0% | 0.0% | 0.50 |
| get_festivals | 6 | 33.3% | 66.7% | 0.0% | 3.58 |
| get_hotels | 13 | 23.1% | 84.6% | 0.0% | 3.39 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.75 |
| get_local_food | 8 | 12.5% | 62.5% | 0.0% | 3.20 |
| get_local_specialty | 5 | 20.0% | 100.0% | 0.0% | 3.73 |
| get_spots | 32 | 9.4% | 59.4% | 0.0% | 2.91 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.12 |
| get_transport | 8 | 0.0% | 37.5% | 0.0% | 2.92 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.12 |
| search_area | 7 | 57.1% | 85.7% | 14.3% | 3.55 |
| search_hybrid | 15 | 20.0% | 53.3% | 0.0% | 3.15 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 19 | 19.0% |
| B | Ranking Failure (buried below noise) | 23 | 23.0% |
| C | Reasoning Failure (synthesised wrong) | 5 | 5.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 28 | 28.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 13 | 13.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.05, fail=A) — plan_feasibility_check: Accept simpler {stops:[]} shape and map stop names to qids internally, or return a feasibility verdict with hard infeasi
- **R420-041** (sat 0.30, fail=A) — get_spots: Add fallback when count=0: drop city filter, retry q across whole prefecture; ensure 黒部峡谷 + 宇奈月 are canonical
- **R420-037** (sat 0.35, fail=A) — get_entity_full: Itsukushima Shrine is a canonical UNESCO WHS — must be present in wikidata corpus; investigate ingest gap
- **R420-077** (sat 0.80, fail=A) — get_spots: Validate prefecture arg against alias list (Nikko→Tochigi); add seasonal-mismatch advisory cluster for May+koyo.
- **R420-048** (sat 1.40, fail=A) — get_spots: Investigate why get_spots(Kumamoto, 熊本市) returns 0 — likely city-filter or restoration-related data gap; ensure 熊本城 surf
- **R420-043** (sat 1.65, fail=A) — get_spots: Add canonical 奈良公園/Nara Park cluster; suppress seasonal koyo/sakura clusters when query has no seasonal keyword
- **R420-066** (sat 1.75, fail=A) — get_spots: Recognize 'city' param as municipality; add HTB to Sasebo spot set; suppress fanout when explicit q has matching POI els
- **R420-039** (sat 2.05, fail=B) — get_spots: Dedup spot ids across municipality cross-listings; ingest 角島大橋 as Wikidata attraction
- **R420-002** (sat 2.25, fail=C) — get_spots: Add climate-impossibility detector for tropical/palm + Hokkaido/Tohoku combinations and return an advisory block.
- **R420-038** (sat 2.35, fail=B) — get_local_food: Fix scraped_local_food category — sakura content miscategorized; add sake-brewery entity layer for known sake regions
