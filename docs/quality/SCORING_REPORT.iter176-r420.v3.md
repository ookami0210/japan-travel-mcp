# Tourism Agent Evaluation Scorecard — iter176-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 279/420 = **66.4%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 411/420 = **97.9%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.18 | 0 | 0 | 8 | 81 | 159 | 172 |
| groundedness | 4.74 | 0 | 0 | 1 | 4 | 99 | 316 |
| factual_accuracy | 4.66 | 0 | 0 | 0 | 6 | 130 | 284 |
| practical_usefulness | 3.98 | 0 | 0 | 19 | 106 | 161 | 134 |
| constraint_handling | 3.79 | 0 | 0 | 34 | 114 | 178 | 94 |
| travel_feasibility | 4.68 | 0 | 0 | 0 | 12 | 111 | 297 |
| specificity | 4.06 | 0 | 0 | 14 | 98 | 158 | 150 |
| expression_quality | 3.58 | 0 | 0 | 14 | 169 | 217 | 20 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.88 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 84.0% | 100.0% | 0.0% | 4.46 |
| get_hotels | 56 | 71.4% | 92.9% | 0.0% | 4.11 |
| get_japan_heritage | 9 | 77.8% | 100.0% | 0.0% | 4.19 |
| get_local_food | 35 | 40.0% | 100.0% | 0.0% | 3.92 |
| get_local_specialty | 22 | 45.5% | 100.0% | 0.0% | 4.13 |
| get_spots | 136 | 64.0% | 97.1% | 0.0% | 4.17 |
| get_traditional_arts | 1 | 100.0% | 100.0% | 0.0% | 4.12 |
| get_transport | 34 | 79.4% | 100.0% | 0.0% | 4.43 |
| plan_feasibility_check | 5 | 80.0% | 100.0% | 0.0% | 4.30 |
| search_area | 30 | 73.3% | 100.0% | 0.0% | 4.20 |
| search_hybrid | 65 | 67.7% | 98.5% | 0.0% | 4.34 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 55 | 13.1% |
| B | Ranking Failure (buried below noise) | 45 | 10.7% |
| C | Reasoning Failure (synthesised wrong) | 4 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 4 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 38 | 9.0% |
| G | Coverage Failure (too few options) | 33 | 7.9% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 241 | 57.4% |

## Top improvement hints (sample of worst 10)

- **R-136** (sat 2.50, fail=A) — get_hotels: Add canonical_matsumoto_castle cluster with city-center ryokan + 縄手通り walk.
- **R-066** (sat 2.65, fail=B) — get_spots: Filter out government-service pages (還付金詐欺, 水道届出) from spots; add accessibility canonical block for elderly.
- **R-080** (sat 2.65, fail=G) — get_spots: Add canonical_agritourism block for Akita/Tohoku rural farmstay.
- **R-334** (sat 2.70, fail=B) — search_hybrid: agent should pass prefecture_code=01 when query mentions Hokkaido; backend could clamp prefecture from query toponyms
- **R-097** (sat 2.75, fail=A) — get_hotels: Add canonical_tdr_hotels cluster covering official Disney + partner hotels.
- **R-098** (sat 2.75, fail=A) — get_hotels: Add canonical_usj_hotels cluster with USJ official partner hotels.
- **R-147** (sat 2.75, fail=A) — get_hotels: Add canonical_aso_couple_ryokan cluster + 火口 viewing constraint + safety/eruption-status note.
- **R-257** (sat 2.80, fail=A) — get_transport: Add canonical_inter_city_routes block for major Kyushu pairs to Fukuoka (and to Beppu / Nagasaki / Kumamoto).
- **R-280** (sat 2.85, fail=B) — search_area: Add canonical_kyoto_free_shrines cluster with Fushimi Inari etc; filter prefecture leak
- **R-142** (sat 2.85, fail=F) — get_hotels: Add canonical_atami_ito_couple cluster + Korean translation.
