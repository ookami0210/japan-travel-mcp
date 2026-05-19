# Tourism Agent Evaluation Scorecard — iter167-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 150/420 = **35.7%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 399/420 = **95.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.77 | 0 | 0 | 4 | 175 | 155 | 86 |
| groundedness | 4.25 | 0 | 0 | 0 | 26 | 263 | 131 |
| factual_accuracy | 4.25 | 0 | 0 | 0 | 22 | 270 | 128 |
| practical_usefulness | 3.46 | 0 | 0 | 22 | 221 | 137 | 40 |
| constraint_handling | 3.36 | 0 | 0 | 69 | 169 | 144 | 38 |
| travel_feasibility | 3.81 | 0 | 0 | 3 | 164 | 164 | 89 |
| specificity | 3.74 | 0 | 0 | 15 | 162 | 160 | 83 |
| expression_quality | 3.39 | 0 | 0 | 16 | 230 | 169 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 60.0% | 100.0% | 0.0% | 4.13 |
| get_hotels | 56 | 25.0% | 100.0% | 0.0% | 3.60 |
| get_japan_heritage | 9 | 0.0% | 88.9% | 0.0% | 3.39 |
| get_local_food | 35 | 25.7% | 100.0% | 0.0% | 3.69 |
| get_local_specialty | 22 | 36.4% | 95.5% | 0.0% | 3.93 |
| get_spots | 136 | 31.6% | 99.3% | 0.0% | 3.72 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.12 |
| get_transport | 34 | 26.5% | 100.0% | 0.0% | 3.69 |
| plan_feasibility_check | 5 | 100.0% | 100.0% | 0.0% | 4.55 |
| search_area | 30 | 60.0% | 96.7% | 0.0% | 3.96 |
| search_hybrid | 65 | 43.1% | 75.4% | 0.0% | 3.73 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 78 | 18.6% |
| B | Ranking Failure (buried below noise) | 43 | 10.2% |
| C | Reasoning Failure (synthesised wrong) | 1 | 0.2% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 20 | 4.8% |
| F | Constraint Failure (ignored explicit constraints) | 104 | 24.8% |
| G | Coverage Failure (too few options) | 41 | 9.8% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 133 | 31.7% |

## Top improvement hints (sample of worst 10)

- **R-261** (sat 2.40, fail=B) — search_hybrid: Add curated canonical_scenic_trains block per region with JR/non-JR flag
- **R-306** (sat 2.65, fail=F) — search_hybrid: Add halal-certification authoritative source (JHA / Muslim Pro listings).
- **R-307** (sat 2.65, fail=F) — search_hybrid: Index halal-certification authoritative registries.
- **R-308** (sat 2.65, fail=A) — search_hybrid: Add halal source + proximity-to-landmark spatial join.
- **R-309** (sat 2.65, fail=F) — search_hybrid: Add halal certification dataset.
- **R-312** (sat 2.65, fail=F) — search_hybrid: Add halal certification source.
- **R-313** (sat 2.65, fail=F) — search_hybrid: Ingest OSM opening_hours; add halal source.
- **R-316** (sat 2.65, fail=A) — search_hybrid: Halal-cert data ingestion.
- **R-318** (sat 2.65, fail=F) — search_hybrid: Multi-prefecture halal aggregator.
- **R-320** (sat 2.65, fail=F) — search_hybrid: Add halal certification + multi-pref aggregation.
