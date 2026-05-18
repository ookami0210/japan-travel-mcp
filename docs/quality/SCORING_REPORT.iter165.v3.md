# Tourism Agent Evaluation Scorecard — iter165 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 66/100 = **66.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 96/100 = **96.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.06 | 0 | 0 | 4 | 23 | 36 | 37 |
| groundedness | 4.77 | 0 | 0 | 0 | 0 | 23 | 77 |
| factual_accuracy | 4.50 | 0 | 0 | 0 | 5 | 40 | 55 |
| practical_usefulness | 3.93 | 0 | 0 | 5 | 28 | 36 | 31 |
| constraint_handling | 3.67 | 0 | 1 | 17 | 23 | 32 | 27 |
| travel_feasibility | 4.29 | 0 | 0 | 0 | 13 | 45 | 42 |
| specificity | 4.03 | 0 | 0 | 3 | 24 | 40 | 33 |
| expression_quality | 3.74 | 0 | 0 | 2 | 27 | 66 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_festivals | 3 | 100.0% | 100.0% | 0.0% | 4.79 |
| get_hotels | 14 | 57.1% | 92.9% | 0.0% | 3.85 |
| get_japan_heritage | 3 | 100.0% | 100.0% | 0.0% | 4.83 |
| get_local_food | 14 | 85.7% | 100.0% | 0.0% | 4.42 |
| get_local_specialty | 6 | 33.3% | 100.0% | 0.0% | 3.98 |
| get_spots | 31 | 67.7% | 96.8% | 0.0% | 4.11 |
| get_transport | 4 | 75.0% | 100.0% | 0.0% | 4.28 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 3.75 |
| search_area | 5 | 60.0% | 80.0% | 0.0% | 4.08 |
| search_hybrid | 18 | 50.0% | 94.4% | 0.0% | 3.94 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 5 | 5.0% |
| B | Ranking Failure (buried below noise) | 18 | 18.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 23 | 23.0% |
| G | Coverage Failure (too few options) | 4 | 4.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 48 | 48.0% |

## Top improvement hints (sample of worst 10)

- **R420v5-049** (sat 2.45, fail=B) — search_hybrid: Pass prefecture_code='01' when query mentions Hokkaido; add canonical_hokkaido_indoor cluster.
- **R420v5-028** (sat 2.75, fail=F) — get_hotels: Auto-trigger canonical_budget_lodging when query contains '5000円' / 'cheap' / 'backpacker' / '青年旅館'.
- **R420v5-082** (sat 2.75, fail=B) — search_area: Add admission-fee filter; restrict prefecture_code in search.
- **R420v5-010** (sat 2.85, fail=A) — get_spots: Add canonical_ghost_villages / 限界集落 cluster; route abandoned-village queries to mining-heritage + depopulation data.
- **R420v5-002** (sat 2.90, fail=F) — get_local_specialty: Add canonical_cheap_souvenirs cluster covering Daiso/Don Quijote/supermarket gift staples nationwide.
- **R420v5-089** (sat 3.10, fail=B) — get_hotels: Add canonical_ise_okage_ryokan cluster + municipality-distance filter.
- **R420v5-097** (sat 3.10, fail=F) — get_hotels: Add canonical_kyoto_gion_ryokan + Spanish localization_directive.
- **R420v5-020** (sat 3.20, fail=B) — get_spots: Fix prefecture-portal event records that all share Niigata coords being assigned wrong municipality.
- **R420v5-023** (sat 3.30, fail=B) — get_local_food: Add canonical_noto_peninsula_seafood cluster; tighten Noto-region filter.
- **R420v5-003** (sat 3.35, fail=B) — search_hybrid: Add canonical_free_parks cluster + dedup by spot_id.
