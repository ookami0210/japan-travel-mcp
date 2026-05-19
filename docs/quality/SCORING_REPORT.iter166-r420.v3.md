# Tourism Agent Evaluation Scorecard — iter166-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 218/420 = **51.9%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 414/420 = **98.6%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.95 | 0 | 0 | 3 | 115 | 203 | 99 |
| groundedness | 4.52 | 0 | 0 | 0 | 5 | 190 | 225 |
| factual_accuracy | 4.48 | 0 | 0 | 1 | 6 | 204 | 209 |
| practical_usefulness | 3.80 | 0 | 0 | 5 | 134 | 221 | 60 |
| constraint_handling | 3.56 | 0 | 0 | 40 | 142 | 201 | 37 |
| travel_feasibility | 4.16 | 0 | 0 | 1 | 49 | 253 | 117 |
| specificity | 3.85 | 0 | 0 | 6 | 124 | 218 | 72 |
| expression_quality | 3.53 | 0 | 0 | 18 | 184 | 195 | 23 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.38 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_festivals | 25 | 64.0% | 100.0% | 0.0% | 4.20 |
| get_hotels | 56 | 51.8% | 100.0% | 0.0% | 3.77 |
| get_japan_heritage | 9 | 55.6% | 100.0% | 0.0% | 3.88 |
| get_local_food | 35 | 25.7% | 100.0% | 0.0% | 3.78 |
| get_local_specialty | 22 | 45.5% | 100.0% | 0.0% | 4.03 |
| get_spots | 136 | 45.6% | 100.0% | 0.0% | 3.93 |
| get_traditional_arts | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_transport | 34 | 70.6% | 94.1% | 0.0% | 4.30 |
| plan_feasibility_check | 5 | 80.0% | 80.0% | 0.0% | 4.30 |
| search_area | 30 | 53.3% | 96.7% | 0.0% | 3.98 |
| search_hybrid | 65 | 61.5% | 96.9% | 0.0% | 4.08 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 49 | 11.7% |
| B | Ranking Failure (buried below noise) | 43 | 10.2% |
| C | Reasoning Failure (synthesised wrong) | 13 | 3.1% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 5 | 1.2% |
| F | Constraint Failure (ignored explicit constraints) | 94 | 22.4% |
| G | Coverage Failure (too few options) | 17 | 4.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 199 | 47.4% |

## Top improvement hints (sample of worst 10)

- **R-261** (sat 2.40, fail=B) — search_hybrid: boost prefecture filter when query includes regional name like '東北', or use get_transport with region-fan-out instead.
- **R-253** (sat 2.50, fail=A) — get_transport: add canonical_inter_city_routes.tokyo_to_hakone with Odakyu Romancecar vs JR routes.
- **R-267** (sat 2.50, fail=C) — plan_feasibility_check: add transit_mode='shinkansen' speed coefficient or call out shinkansen corridor explicitly when distance >200km on Tokai
- **R-283** (sat 2.90, fail=A) — get_local_specialty: Add generic cheap-souvenir advisory or chain-store pointer when query mentions 100均/スーパー.
- **R-323** (sat 2.90, fail=A) — search_hybrid: Add canonical_kosher_destinations cluster (Chabad Tokyo).
- **R-369** (sat 2.90, fail=A) — search_area: Trigger canonical_accessible_destinations on 宮島/Miyajima/fauteuil queries.
- **R-249** (sat 3.00, fail=A) — get_transport: add canonical_kumano_kodo_iseji block to Mie prefecture (Owase, Kumano-shi entry points).
- **R-313** (sat 3.25, fail=G) — search_hybrid: Surface mosque iftar dinner programs (Tokyo Camii Ramadan).
- **R-370** (sat 3.25, fail=A) — search_hybrid: Add canonical_hearing_impaired_tours or surface Ise 手話 volunteer guide more prominently.
- **R-034** (sat 3.30, fail=B) — search_area: filter nav-chrome scrape entries; prioritize the actual 平和記念公園 entity first
