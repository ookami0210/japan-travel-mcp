# Tourism Agent Evaluation Scorecard — iter169 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 40/100 = **40.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 87/100 = **87.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.62 | 0 | 1 | 9 | 34 | 39 | 17 |
| groundedness | 4.58 | 0 | 0 | 0 | 4 | 34 | 62 |
| factual_accuracy | 4.45 | 0 | 0 | 0 | 10 | 35 | 55 |
| practical_usefulness | 3.22 | 0 | 1 | 21 | 44 | 23 | 11 |
| constraint_handling | 3.09 | 0 | 2 | 25 | 42 | 24 | 7 |
| travel_feasibility | 3.88 | 0 | 0 | 3 | 20 | 63 | 14 |
| specificity | 3.43 | 0 | 0 | 13 | 46 | 26 | 15 |
| expression_quality | 3.16 | 0 | 0 | 18 | 49 | 32 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 2 | 0.0% | 100.0% | 0.0% | 3.50 |
| get_hotels | 16 | 62.5% | 93.8% | 0.0% | 3.91 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.94 |
| get_local_food | 11 | 45.5% | 72.7% | 0.0% | 3.64 |
| get_local_specialty | 3 | 0.0% | 66.7% | 0.0% | 3.21 |
| get_spots | 40 | 37.5% | 92.5% | 0.0% | 3.70 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.50 |
| get_transport | 4 | 75.0% | 100.0% | 0.0% | 4.19 |
| search_area | 5 | 20.0% | 60.0% | 0.0% | 3.08 |
| search_hybrid | 16 | 31.2% | 81.2% | 0.0% | 3.57 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 27 | 27.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 22 | 22.0% |
| G | Coverage Failure (too few options) | 18 | 18.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 24 | 24.0% |

## Top improvement hints (sample of worst 10)

- **R420v8-087** (sat 2.25, fail=F) — get_local_specialty: Add an intent classifier route 'cheap souvenirs' → return canonical generic-budget-souvenir guidance instead of GI deep-
- **R420v8-004** (sat 2.35, fail=B) — search_hybrid: Pass prefecture_code filter when prefecture is explicit; add canonical Hokkaido all-weather cluster.
- **R420v8-011** (sat 2.35, fail=B) — get_local_food: Add city-scope filter (city='能登' / municipality match) for get_local_food; clean nav-chrome from body_paragraphs.
- **R420v8-016** (sat 2.35, fail=A) — search_hybrid: Add canonical_jr_east_scenic_trains cluster + filter by operator=JR; intent should detect 'JR Pass'.
- **R420v8-082** (sat 2.45, fail=B) — search_area: Constrain search_area by prefecture when toponym is unambiguous; add anime-pilgrimage canonical block for major sites.
- **R420v8-007** (sat 2.70, fail=B) — get_spots: Filter out municipal admin/utility/fraud notice pages from get_spots; apply quality_relevance threshold.
- **R420v8-017** (sat 2.70, fail=F) — get_hotels: Detect 背包/低预算/5000日元 trigger and fire canonical_budget_lodging cluster; filter by lodging_type=hostel/capsule.
- **R420v8-001** (sat 2.75, fail=B) — search_area: Filter results strictly by prefecture_code=26 and surface fee=no entries; promote canonical Kyoto free shrines.
- **R420v8-077** (sat 2.75, fail=F) — get_local_food: Filter by city='札幌市' when prefecture covers wide area; add canonical_budget_eats / market blocks for major cities.
- **R420v8-010** (sat 2.80, fail=B) — get_spots: Suppress non-matching canonical blocks; promote Kushimoto-specific family cluster (橋杭岩, 海中公園).
