# Tourism Agent Evaluation Scorecard — iter170-v9 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 40/100 = **40.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 88/100 = **88.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.68 | 0 | 0 | 8 | 31 | 46 | 15 |
| groundedness | 4.23 | 0 | 0 | 0 | 15 | 47 | 38 |
| factual_accuracy | 4.22 | 0 | 0 | 0 | 14 | 50 | 36 |
| practical_usefulness | 3.45 | 0 | 0 | 18 | 27 | 47 | 8 |
| constraint_handling | 3.29 | 0 | 3 | 19 | 29 | 44 | 5 |
| travel_feasibility | 3.82 | 0 | 0 | 2 | 23 | 66 | 9 |
| specificity | 3.42 | 0 | 0 | 16 | 37 | 36 | 11 |
| expression_quality | 3.34 | 0 | 0 | 3 | 60 | 37 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 3 | 33.3% | 66.7% | 0.0% | 3.42 |
| get_hotels | 14 | 21.4% | 57.1% | 0.0% | 3.23 |
| get_japan_heritage | 3 | 0.0% | 66.7% | 0.0% | 3.29 |
| get_local_food | 11 | 54.5% | 90.9% | 0.0% | 3.78 |
| get_local_specialty | 5 | 40.0% | 100.0% | 0.0% | 3.77 |
| get_spots | 35 | 45.7% | 97.1% | 0.0% | 3.83 |
| get_transport | 7 | 28.6% | 100.0% | 0.0% | 3.55 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| search_area | 6 | 33.3% | 66.7% | 0.0% | 3.29 |
| search_hybrid | 15 | 46.7% | 100.0% | 0.0% | 3.92 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 13 | 13.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 20 | 20.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 49 | 49.0% |

## Top improvement hints (sample of worst 10)

- **R420v9-082** (sat 2.35, fail=B) — search_area: Add anime-seichi canonical block keyed on title — Garupan→Oarai, SAO→Tokyo, Lucky Star→Washinomiya.
- **R420v9-044** (sat 2.40, fail=F) — get_hotels: Fire canonical_budget_lodging for Fukuoka; hard-filter price_band='low' + lodging_type IN (hostel, capsule) when budget 
- **R420v9-045** (sat 2.40, fail=F) — get_hotels: Fire canonical_budget_lodging when prefecture in coverage list AND budget keywords (5000円, cheap, du lịch bụi) detected.
- **R420v9-048** (sat 2.40, fail=F) — get_hotels: Fire canonical_budget_lodging when Osaka + budget keyword (murah/cheap/3000); hard-filter price_band/lodging_type.
- **R420v9-049** (sat 2.40, fail=F) — get_hotels: Fix budget cluster trigger to match localized budget terms (ราคาถูก, 5000円, cheap).
- **R420v9-094** (sat 2.60, fail=A) — get_festivals: Filter national_heritage by prefecture_code; add mountain-shrine matsuri data for 剣山 / 石鎚 / 大山.
- **R420v9-041** (sat 2.65, fail=G) — get_hotels: Add canonical_izu_family_ryokan with kashikiri-buro feature flagging.
- **R420v9-047** (sat 2.65, fail=G) — get_hotels: Add canonical_atami_kashikiri_buro cluster + honeymoon/蜜月 keyword routing.
- **R420v9-080** (sat 2.70, fail=B) — search_area: Tighten BM25/RRF for region-named queries — penalize cross-region results.
- **R420v9-060** (sat 2.75, fail=F) — get_local_food: Detect '安い/cheap/under ¥X' constraint and surface canonical_cheap_eats per region (markets, 立ち食い soba, B-grade gourmet).
