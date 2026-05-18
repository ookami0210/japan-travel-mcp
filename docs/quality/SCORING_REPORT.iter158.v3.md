# Tourism Agent Evaluation Scorecard — iter158 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 59/100 = **59.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 97/100 = **97.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.13 | 0 | 0 | 5 | 20 | 32 | 43 |
| groundedness | 4.71 | 0 | 0 | 0 | 0 | 29 | 71 |
| factual_accuracy | 4.60 | 0 | 0 | 0 | 1 | 38 | 61 |
| practical_usefulness | 3.80 | 0 | 1 | 4 | 31 | 42 | 22 |
| constraint_handling | 3.76 | 0 | 1 | 14 | 18 | 42 | 25 |
| travel_feasibility | 4.36 | 0 | 0 | 1 | 4 | 53 | 42 |
| specificity | 3.91 | 0 | 0 | 5 | 30 | 34 | 31 |
| expression_quality | 3.36 | 0 | 0 | 3 | 59 | 37 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.62 |
| get_entity_full | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.40 |
| get_hotels | 13 | 61.5% | 100.0% | 0.0% | 4.12 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.81 |
| get_local_food | 8 | 50.0% | 100.0% | 0.0% | 3.88 |
| get_local_specialty | 5 | 60.0% | 100.0% | 0.0% | 4.28 |
| get_spots | 32 | 50.0% | 96.9% | 0.0% | 3.91 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.62 |
| get_transport | 8 | 62.5% | 100.0% | 0.0% | 4.14 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.75 |
| search_area | 7 | 71.4% | 100.0% | 0.0% | 4.16 |
| search_hybrid | 15 | 73.3% | 100.0% | 0.0% | 4.38 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 9 | 9.0% |
| B | Ranking Failure (buried below noise) | 11 | 11.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 13 | 13.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 56 | 56.0% |

## Top improvement hints (sample of worst 10)

- **R420-056** (sat 2.50, fail=A) — get_festivals: Add canonical_offseason_sakura block for 10月/11月/12月 cherry queries with juugatsu-zakura / fuyu-zakura / himalaya-zakura
- **R420-072** (sat 2.75, fail=A) — get_spots: Parse negative constraints in query ('not X, not Y') and exclude/demote those QIDs; surface Tokara/Mishima village islan
- **R420-006** (sat 2.85, fail=A) — get_dmo: Add a disaster_advisory_pointer block with JNTO Safety Tips / 国土交通省 道路情報 / 気象庁 + tokushima DMO disaster-info URLs when q
- **R420-027** (sat 2.85, fail=F) — get_hotels: Trigger canonical_budget_lodging cluster when query contains '5000円以下' / 'hostel' / '青年旅馆' / '背包'; suppress 秘湯 ryokan in
- **R420-010** (sat 3.10, fail=E) — get_transport: Add canonical_intercity_routes block (top 50 city pairs) with JR/private-rail times and JR-Pass coverage for daytrip que
- **R420-077** (sat 3.10, fail=F) — get_spots: When season query is impossible, surface the off-season-redirect block before any prefecture-specific canonical entries.
- **R420-009** (sat 3.25, fail=A) — get_spots: Add canonical_accessible_beaches block with sand-mat / boardwalk access tagging for Okinawa, Chiba, Shonan, Fukui.
- **R420-075** (sat 3.30, fail=F) — get_spots: On 'heat / hot / 暑い / 夏' queries fire canonical_summer_indoor_attractions filtering by indoor_capable='indoor'; demote k
- **R420-026** (sat 3.35, fail=B) — get_japan_heritage: Detect 白川郷/合掌造り keywords and hoist Q35073 + Gokayama as canonical_unesco_whs cluster top-of-response.
- **R420-034** (sat 3.35, fail=F) — get_transport: Detect multi-prefecture rail-pass intent and fan out get_transport across listed destinations; add canonical_jr_pass_rou
