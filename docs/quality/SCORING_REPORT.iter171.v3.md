# Tourism Agent Evaluation Scorecard — iter171 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 38/100 = **38.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 88/100 = **88.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.58 | 0 | 0 | 10 | 35 | 42 | 13 |
| groundedness | 4.45 | 0 | 0 | 0 | 5 | 45 | 50 |
| factual_accuracy | 4.28 | 0 | 0 | 0 | 8 | 56 | 36 |
| practical_usefulness | 3.35 | 0 | 1 | 14 | 40 | 39 | 6 |
| constraint_handling | 3.17 | 0 | 3 | 20 | 39 | 33 | 5 |
| travel_feasibility | 3.75 | 0 | 0 | 0 | 31 | 63 | 6 |
| specificity | 3.49 | 0 | 0 | 6 | 48 | 37 | 9 |
| expression_quality | 3.19 | 0 | 0 | 13 | 56 | 30 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 3 | 33.3% | 100.0% | 0.0% | 3.71 |
| get_hotels | 14 | 42.9% | 78.6% | 0.0% | 3.66 |
| get_japan_heritage | 3 | 66.7% | 100.0% | 0.0% | 3.92 |
| get_local_food | 11 | 63.6% | 100.0% | 0.0% | 3.92 |
| get_local_specialty | 5 | 40.0% | 100.0% | 0.0% | 3.73 |
| get_spots | 35 | 22.9% | 85.7% | 0.0% | 3.55 |
| get_transport | 7 | 14.3% | 100.0% | 0.0% | 3.61 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.12 |
| search_area | 6 | 50.0% | 100.0% | 0.0% | 3.83 |
| search_hybrid | 15 | 46.7% | 73.3% | 0.0% | 3.56 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 12 | 12.0% |
| B | Ranking Failure (buried below noise) | 15 | 15.0% |
| C | Reasoning Failure (synthesised wrong) | 11 | 11.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 20 | 20.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 36 | 36.0% |

## Top improvement hints (sample of worst 10)

- **R420v9-005** (sat 2.35, fail=B) — search_hybrid: add canonical_indoor_attractions block per prefecture; filter results by query prefecture
- **R420v9-018** (sat 2.35, fail=A) — get_spots: add canonical_oku_aizu_villages cluster (大内宿, 前沢, 三島町宮下, 只見)
- **R420v9-015** (sat 2.40, fail=G) — get_spots: add canonical_agritourism block (fruit-picking + farm-stay) per prefecture
- **R420v9-009** (sat 2.60, fail=B) — search_hybrid: fix municipality assignment for 中禅寺湖 + dedupe; add Nikko koyo canonical block
- **R420v9-048** (sat 2.60, fail=F) — get_hotels: Add canonical_osaka_budget_hostels cluster; detect murah/cheap/budget tokens in id/ms/vi/th and invert ranking.
- **R420v9-069** (sat 2.75, fail=A) — search_hybrid: Add canonical_film_locations cluster with Sekachu, Twenty-four Eyes, Daughter of the Samurai mapping
- **R420v9-023** (sat 2.80, fail=F) — get_spots: add canonical_indoor_museums per major prefecture; filter spots by indoor_capable=indoor when query has 雨/屋内
- **R420v9-006** (sat 2.85, fail=A) — get_spots: add canonical_depopulated_villages / 限界集落 cluster
- **R420v9-045** (sat 2.85, fail=F) — get_hotels: Detect 'du lịch bụi/backpacker/cheap/under 5000' tokens across languages; INVERT ranking — drop luxury cluster, surface 
- **R420v9-049** (sat 2.85, fail=F) — get_hotels: Cross-language budget-token dictionary (ราคาถูก/murah/budget/便宜/cheap/格安) → invert toward canonical_budget_lodging clust
