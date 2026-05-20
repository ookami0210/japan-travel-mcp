# Tourism Agent Evaluation Scorecard — iter144 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 43/100 = **43.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 78/100 = **78.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.70 | 0 | 3 | 14 | 23 | 30 | 30 |
| groundedness | 4.28 | 0 | 0 | 2 | 12 | 42 | 44 |
| factual_accuracy | 4.11 | 0 | 0 | 3 | 17 | 46 | 34 |
| practical_usefulness | 3.27 | 0 | 4 | 20 | 31 | 35 | 10 |
| constraint_handling | 3.01 | 0 | 6 | 32 | 26 | 27 | 9 |
| travel_feasibility | 3.97 | 0 | 1 | 4 | 20 | 47 | 28 |
| specificity | 3.46 | 0 | 2 | 18 | 31 | 30 | 19 |
| expression_quality | 3.20 | 0 | 0 | 13 | 54 | 33 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.21 |
| get_hotels | 13 | 53.8% | 84.6% | 0.0% | 3.88 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.75 |
| get_local_food | 8 | 50.0% | 62.5% | 0.0% | 3.53 |
| get_local_specialty | 5 | 40.0% | 80.0% | 0.0% | 3.65 |
| get_spots | 32 | 46.9% | 87.5% | 0.0% | 3.72 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.75 |
| get_transport | 8 | 12.5% | 37.5% | 0.0% | 3.06 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 1.50 |
| search_area | 7 | 57.1% | 85.7% | 0.0% | 3.75 |
| search_hybrid | 15 | 20.0% | 80.0% | 0.0% | 3.36 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 14 | 14.0% |
| B | Ranking Failure (buried below noise) | 16 | 16.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 3 | 3.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 30 | 30.0% |
| G | Coverage Failure (too few options) | 4 | 4.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 31 | 31.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 1.40, fail=A) — plan_feasibility_check: Accept 'stops':[toponym] form and resolve to qid+default-minutes internally; emit a feasibility verdict (impossible: min
- **R420-077** (sat 1.40, fail=A) — get_spots: Reject invalid prefecture and fall back; add seasonal advisory when query month conflicts with phenology of the requeste
- **R420-056** (sat 1.90, fail=A) — get_festivals: Add seasonal-anomaly cluster (October-blooming cherries) to canonical_endangered or a new cluster; intent classifier sho
- **R420-058** (sat 2.10, fail=B) — search_hybrid: Add prefecture-locked filter when query contains explicit place name (宮島→Hiroshima); avoid cross-prefecture spillover fo
- **R420-038** (sat 2.35, fail=B) — get_local_food: Add intent rule: when keyword is 日本酒/sake, route to get_traditional_arts (UNESCO 伝統的酒造り) + a sake-kura cluster. Filter o
- **R420-094** (sat 2.35, fail=B) — search_hybrid: Force canonical_kansai_sakura on q='京都 桜' regardless of additional modifier tokens like 'ロマンチック'.
- **R420-024** (sat 2.40, fail=A) — get_local_specialty: When MAFF/METI returns 0 hits, route to scraped_local_food or Wikipedia narrative rather than venue fallback.
- **R420-062** (sat 2.40, fail=A) — get_transport: Detect named entities in query and prioritize per-spot lookup; add JR Pass note ('Adachi not walkable from 安来駅; use free
- **R420-099** (sat 2.45, fail=F) — get_local_food: Add canonical_fukuoka_yatai cluster + price_band metadata; route 屋台/budget intent through search_area not get_local_food
- **R420-034** (sat 2.50, fail=F) — get_transport: Add a multi-prefecture transport mode to get_transport, or hoist a canonical_jr_passes block enumerating the JR Kyushu p
