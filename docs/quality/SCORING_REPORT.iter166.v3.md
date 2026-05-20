# Tourism Agent Evaluation Scorecard — iter166 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 42/100 = **42.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 96/100 = **96.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.59 | 0 | 0 | 4 | 38 | 53 | 5 |
| groundedness | 4.12 | 0 | 0 | 0 | 5 | 78 | 17 |
| factual_accuracy | 4.07 | 0 | 0 | 0 | 4 | 85 | 11 |
| practical_usefulness | 3.42 | 0 | 0 | 6 | 46 | 48 | 0 |
| constraint_handling | 3.21 | 0 | 0 | 27 | 27 | 44 | 2 |
| travel_feasibility | 3.88 | 0 | 0 | 1 | 11 | 87 | 1 |
| specificity | 3.50 | 0 | 0 | 4 | 44 | 50 | 2 |
| expression_quality | 3.67 | 0 | 0 | 0 | 36 | 61 | 3 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.50 |
| get_festivals | 3 | 66.7% | 66.7% | 0.0% | 3.54 |
| get_hotels | 17 | 17.6% | 100.0% | 0.0% | 3.51 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 4.06 |
| get_local_food | 11 | 9.1% | 100.0% | 0.0% | 3.76 |
| get_local_specialty | 4 | 50.0% | 100.0% | 0.0% | 3.69 |
| get_spots | 29 | 51.7% | 100.0% | 0.0% | 3.71 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 4 | 25.0% | 75.0% | 0.0% | 3.38 |
| search_area | 7 | 57.1% | 85.7% | 0.0% | 3.68 |
| search_hybrid | 21 | 61.9% | 100.0% | 0.0% | 3.86 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 2 | 2.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 28 | 28.0% |
| G | Coverage Failure (too few options) | 10 | 10.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 45 | 45.0% |

## Top improvement hints (sample of worst 10)

- **R420v6-085** (sat 2.40, fail=E) — get_festivals: Detect off-season bloom queries; surface known 10gatsu-zakura sites
- **R420v6-086** (sat 2.40, fail=E) — get_dmo: Surface 'real-time info not in scope; check JR West / muni site' hint
- **R420v6-003** (sat 2.65, fail=F) — search_area: Boost prefecture=Hiroshima and toponym=宮島 when query mentions Miyajima
- **R420v6-080** (sat 2.80, fail=F) — get_transport: region_fanout for Kyushu queries; suggest hub stations comparison
- **R420v6-077** (sat 2.90, fail=F) — get_local_specialty: Add cheap-souvenir intent route; specialty tool can't answer 100yen-shop questions
- **R420v6-042** (sat 3.05, fail=A) — search_hybrid: Add no_data_advisory for K-pop pilgrimage queries
- **R420v6-001** (sat 3.35, fail=F) — get_spots: Add indoor_capable=indoor filter when query contains 屋内/雨/台風
- **R420v6-002** (sat 3.35, fail=F) — get_spots: Filter indoor_capable=indoor|mixed when typhoon/rain detected
- **R420v6-007** (sat 3.35, fail=C) — search_hybrid: Add jr_pass_covered boolean to transport entries
- **R420v6-013** (sat 3.35, fail=F) — get_spots: Trigger th localization + indoor filter on rain/雨 queries
