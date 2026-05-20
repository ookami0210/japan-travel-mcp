# Tourism Agent Evaluation Scorecard — iter171-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 244/420 = **58.1%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 406/420 = **96.7%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.96 | 0 | 1 | 17 | 111 | 159 | 132 |
| groundedness | 4.63 | 0 | 0 | 0 | 8 | 138 | 274 |
| factual_accuracy | 4.60 | 0 | 0 | 0 | 9 | 151 | 260 |
| practical_usefulness | 3.72 | 0 | 0 | 34 | 129 | 178 | 79 |
| constraint_handling | 3.53 | 0 | 1 | 50 | 149 | 165 | 55 |
| travel_feasibility | 4.24 | 0 | 0 | 1 | 37 | 244 | 138 |
| specificity | 3.88 | 0 | 0 | 21 | 117 | 172 | 110 |
| expression_quality | 3.49 | 0 | 0 | 24 | 184 | 196 | 16 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.12 |
| get_festivals | 25 | 72.0% | 96.0% | 0.0% | 4.24 |
| get_hotels | 56 | 64.3% | 98.2% | 0.0% | 3.99 |
| get_japan_heritage | 9 | 66.7% | 88.9% | 0.0% | 4.10 |
| get_local_food | 35 | 51.4% | 97.1% | 0.0% | 3.90 |
| get_local_specialty | 22 | 54.5% | 100.0% | 0.0% | 4.05 |
| get_spots | 136 | 55.1% | 95.6% | 0.0% | 3.97 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.62 |
| get_transport | 34 | 61.8% | 100.0% | 0.0% | 4.01 |
| plan_feasibility_check | 5 | 60.0% | 100.0% | 0.0% | 4.38 |
| search_area | 30 | 63.3% | 93.3% | 0.0% | 3.95 |
| search_hybrid | 65 | 52.3% | 96.9% | 0.0% | 4.03 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 39 | 9.3% |
| B | Ranking Failure (buried below noise) | 72 | 17.1% |
| C | Reasoning Failure (synthesised wrong) | 11 | 2.6% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 4 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 79 | 18.8% |
| G | Coverage Failure (too few options) | 55 | 13.1% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 160 | 38.1% |

## Top improvement hints (sample of worst 10)

- **R-196** (sat 2.35, fail=B) — get_spots: Route koyo queries to canonical_kouyou_meisho cluster, not illuminations.
- **R-203** (sat 2.35, fail=B) — get_spots: Same as R-196 — route 紅葉 to kouyou cluster, not illuminations.
- **R-208** (sat 2.35, fail=B) — get_spots: Fix 紅葉 query routing — recurring bug across R-196/R-203/R-208.
- **R-369** (sat 2.50, fail=A) — search_area: Fire canonical_accessible_destinations cluster on search_area when wheelchair/バリアフリー terms detected.
- **R-080** (sat 2.65, fail=G) — get_spots: Add a 農泊 (agritourism) canonical cluster cross-prefecture using government 農泊 registry; route 農業体験 queries through it.
- **R-144** (sat 2.70, fail=B) — get_spots: Filter out municipal admin nav-chrome; add canonical_beppu_kashikiri_buro cluster.
- **R-166** (sat 2.70, fail=A) — get_local_food: Add canonical_ehime_citrus block with variety-level entries (most are brand-not-GI but defining).
- **R-280** (sat 2.75, fail=B) — search_area: Build canonical_kyoto_temple_fees cluster parallel to canonical_kamakura_temple_fees with explicit FREE status; rank pro
- **R-304** (sat 2.75, fail=A) — get_hotels: Extend canonical_luxury_ryokan coverage to Fukuoka/Saga/Oita Kyushu hot-spring region.
- **R-312** (sat 2.75, fail=A) — search_hybrid: Critical gap: add Fukuoka/Kyushu halal canonical entries.
