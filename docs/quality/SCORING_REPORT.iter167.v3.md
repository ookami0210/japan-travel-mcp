# Tourism Agent Evaluation Scorecard — iter167 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 58/100 = **58.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 97/100 = **97.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.03 | 0 | 0 | 2 | 28 | 35 | 35 |
| groundedness | 4.63 | 0 | 0 | 0 | 1 | 35 | 64 |
| factual_accuracy | 4.63 | 0 | 0 | 0 | 1 | 35 | 64 |
| practical_usefulness | 3.70 | 0 | 0 | 9 | 35 | 33 | 23 |
| constraint_handling | 3.51 | 0 | 2 | 16 | 31 | 31 | 20 |
| travel_feasibility | 3.78 | 0 | 0 | 1 | 25 | 69 | 5 |
| specificity | 3.96 | 0 | 0 | 3 | 32 | 31 | 34 |
| expression_quality | 3.66 | 0 | 0 | 1 | 36 | 59 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 83.3% | 100.0% | 0.0% | 4.19 |
| get_hotels | 11 | 0.0% | 90.9% | 0.0% | 3.16 |
| get_japan_heritage | 2 | 0.0% | 100.0% | 0.0% | 3.44 |
| get_local_food | 11 | 63.6% | 100.0% | 0.0% | 3.94 |
| get_local_specialty | 6 | 33.3% | 100.0% | 0.0% | 3.98 |
| get_spots | 35 | 60.0% | 97.1% | 0.0% | 3.98 |
| get_transport | 7 | 85.7% | 100.0% | 0.0% | 4.34 |
| plan_feasibility_check | 2 | 100.0% | 100.0% | 0.0% | 4.94 |
| search_area | 7 | 71.4% | 85.7% | 0.0% | 4.14 |
| search_hybrid | 13 | 76.9% | 100.0% | 0.0% | 4.33 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 6 | 6.0% |
| B | Ranking Failure (buried below noise) | 9 | 9.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 6 | 6.0% |
| F | Constraint Failure (ignored explicit constraints) | 21 | 21.0% |
| G | Coverage Failure (too few options) | 12 | 12.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 45 | 45.0% |

## Top improvement hints (sample of worst 10)

- **R420v7-002** (sat 2.75, fail=A) — search_area: Add canonical_accessibility cluster keyed on toponym (Miyajima → 宮島観光協会 barrier-free page)
- **R420v7-034** (sat 2.75, fail=B) — get_spots: Implement negative-constraint regex (not X, except Y) in intent classifier
- **R420v7-035** (sat 3.10, fail=F) — get_spots: Add a11y enrichment from OSM tags (wheelchair=yes/limited)
- **R420v7-040** (sat 3.10, fail=F) — get_hotels: Add hostel/guesthouse hotel_type + OSM price tag enrichment
- **R420v7-042** (sat 3.10, fail=F) — get_hotels: Add hostel hotel_type filter + OSM price enrichment
- **R420v7-043** (sat 3.10, fail=F) — get_hotels: Add Arabic translation + price_band attribute
- **R420v7-059** (sat 3.10, fail=B) — search_hybrid: Filter search_hybrid by prefecture when toponym detected; add canonical_accessibility cluster
- **R420v7-086** (sat 3.10, fail=A) — get_japan_heritage: Detect 神宮 / shrine queries → route to get_entity_full or search_area; trim browse_advisory.
- **R420v7-033** (sat 3.25, fail=F) — get_spots: Add price_band cross-cut filter + Arabic (ar) translation
- **R420v7-026** (sat 3.35, fail=F) — get_spots: Add shitamachi-themed cluster (Yanaka/Asakusa/Kappabashi/Tsukishima) or enrich get_spots q='下町' matching against neighbo
