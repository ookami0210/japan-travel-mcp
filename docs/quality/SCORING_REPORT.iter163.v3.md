# Tourism Agent Evaluation Scorecard — iter163 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 44/100 = **44.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 89/100 = **89.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.63 | 0 | 1 | 13 | 31 | 32 | 23 |
| groundedness | 4.45 | 0 | 0 | 0 | 6 | 43 | 51 |
| factual_accuracy | 4.37 | 0 | 0 | 0 | 7 | 49 | 44 |
| practical_usefulness | 3.55 | 0 | 1 | 13 | 36 | 30 | 20 |
| constraint_handling | 3.40 | 0 | 0 | 17 | 41 | 27 | 15 |
| travel_feasibility | 3.92 | 0 | 0 | 2 | 26 | 50 | 22 |
| specificity | 3.65 | 0 | 1 | 8 | 40 | 27 | 24 |
| expression_quality | 3.46 | 0 | 0 | 5 | 45 | 49 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.88 |
| get_festivals | 3 | 66.7% | 66.7% | 0.0% | 4.12 |
| get_hotels | 14 | 28.6% | 100.0% | 0.0% | 3.65 |
| get_japan_heritage | 3 | 66.7% | 100.0% | 0.0% | 4.25 |
| get_local_food | 14 | 57.1% | 92.9% | 0.0% | 3.87 |
| get_local_specialty | 6 | 33.3% | 66.7% | 0.0% | 3.71 |
| get_spots | 31 | 38.7% | 93.5% | 0.0% | 3.86 |
| get_transport | 4 | 100.0% | 100.0% | 0.0% | 4.34 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 2.38 |
| search_area | 5 | 60.0% | 100.0% | 0.0% | 4.10 |
| search_hybrid | 18 | 38.9% | 83.3% | 0.0% | 3.61 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 21 | 21.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 15 | 15.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 39 | 39.0% |

## Top improvement hints (sample of worst 10)

- **R420v5-011** (sat 1.75, fail=E) — search_hybrid: Return early scope_out_of_dataset stub for medical-tourism / surgery queries with redirect to JNTO/MEDJ.
- **R420v5-012** (sat 2.35, fail=B) — get_local_food: Add canonical_hiroshima_oyster block; filter body_paragraphs to substantive oyster mentions.
- **R420v5-049** (sat 2.35, fail=B) — search_hybrid: Apply prefecture filter when query mentions explicit prefecture; for 全天候/all-weather + Hokkaido add canonical_hokkaido_i
- **R420v5-024** (sat 2.40, fail=A) — get_spots: Add canonical_tokyo_kids_park cluster; route 公園 + 遊び to toddler-park list not skyline icons.
- **R420v5-027** (sat 2.40, fail=A) — plan_feasibility_check: Add name-based fallback resolver for plan_feasibility when qid_not_found, or return a hint listing correct QIDs.
- **R420v5-052** (sat 2.40, fail=A) — search_hybrid: Add canonical_accessible_attractions block keyed by ベビーカー / 車椅子 / 段差 / accessible / stroller across major Kyoto sites.
- **R420v5-074** (sat 2.75, fail=A) — get_local_specialty: Auto-infer category=craft when query contains 工芸/craft/làng nghề/공예/手工艺.
- **R420v5-083** (sat 2.75, fail=A) — get_festivals: Add Tokyo illumination cluster (青の洞窟 / 表参道 / 丸の内 / Caretta); honor keyword filter on canonical_festivals
- **R420v5-002** (sat 2.85, fail=F) — get_local_specialty: Add canonical_budget_omiyage block (Don Quijote / 100yen / supermarket konbini sweets) independent of prefecture.
- **R420v5-006** (sat 2.85, fail=B) — get_hotels: Add canonical_luxury_honeymoon block + filter by lodging_type=luxury_ryokan.
