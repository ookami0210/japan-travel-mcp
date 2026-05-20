# Tourism Agent Evaluation Scorecard — iter162 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 73/100 = **73.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 97/100 = **97.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.13 | 0 | 0 | 3 | 22 | 34 | 41 |
| groundedness | 4.93 | 0 | 0 | 0 | 1 | 5 | 94 |
| factual_accuracy | 4.90 | 0 | 0 | 0 | 0 | 10 | 90 |
| practical_usefulness | 3.82 | 0 | 0 | 6 | 28 | 44 | 22 |
| constraint_handling | 3.63 | 0 | 0 | 11 | 40 | 24 | 25 |
| travel_feasibility | 4.47 | 0 | 0 | 0 | 4 | 45 | 51 |
| specificity | 4.03 | 0 | 0 | 5 | 19 | 44 | 32 |
| expression_quality | 3.69 | 0 | 1 | 4 | 29 | 57 | 9 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 100.0% | 100.0% | 0.0% | 4.29 |
| get_hotels | 14 | 35.7% | 100.0% | 0.0% | 3.79 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.69 |
| get_local_food | 9 | 55.6% | 88.9% | 0.0% | 3.92 |
| get_local_specialty | 5 | 100.0% | 100.0% | 0.0% | 4.40 |
| get_spots | 33 | 78.8% | 100.0% | 0.0% | 4.31 |
| get_transport | 8 | 100.0% | 100.0% | 0.0% | 4.25 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| search_area | 7 | 100.0% | 100.0% | 0.0% | 4.71 |
| search_hybrid | 15 | 53.3% | 86.7% | 0.0% | 4.06 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 3 | 3.0% |
| B | Ranking Failure (buried below noise) | 9 | 9.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 26 | 26.0% |
| G | Coverage Failure (too few options) | 14 | 14.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 45 | 45.0% |

## Top improvement hints (sample of worst 10)

- **R420v4-066** (sat 2.80, fail=E) — get_local_food: Filter scraped items to prefecture_code match (this leaked 山口 tours into Hiroshima); add canonical_oyster_destinations (
- **R420v4-035** (sat 2.95, fail=B) — search_hybrid: Deduplicate spot keys across municipalities; add free-park canonical
- **R420v4-047** (sat 3.00, fail=C) — search_hybrid: Detect conflicting modifiers and return advisory block
- **R420v4-060** (sat 3.10, fail=F) — get_hotels: Add Spanish/Portuguese/French wheelchair synonyms to accessible-block trigger; add Oita-specific accessible_onsen entrie
- **R420v4-058** (sat 3.20, fail=F) — get_hotels: Extend budget_lodging coverage to Okinawa (Naha/Ishigaki guesthouses); suppress luxury_ryokan when budget keywords detec
- **R420v4-061** (sat 3.20, fail=F) — get_hotels: Wire canonical_budget_lodging trigger on Thai 'ราคาถูก' / 'ราคาประหยัด' / '5000 เยน' tokens; populate Kyoto budget entri
- **R420v4-043** (sat 3.25, fail=A) — search_hybrid: Add canonical_live_action_film_locations distinct from anime pilgrimage
- **R420v4-038** (sat 3.40, fail=G) — search_hybrid: Add canonical_kanazawa_landmarks; fire indoor_capable filter for rain queries
- **R420v4-034** (sat 3.45, fail=F) — search_hybrid: Add canonical_deaf_friendly_destinations with 手話 ガイド venues
- **R420v4-041** (sat 3.45, fail=B) — search_hybrid: Add prefecture-filter when city is specified in query
