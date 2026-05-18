# Tourism Agent Evaluation Scorecard — iter161 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 73/100 = **73.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 100/100 = **100.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.19 | 0 | 0 | 2 | 14 | 47 | 37 |
| groundedness | 4.61 | 0 | 0 | 0 | 1 | 37 | 62 |
| factual_accuracy | 4.61 | 0 | 0 | 0 | 1 | 37 | 62 |
| practical_usefulness | 3.92 | 0 | 0 | 4 | 24 | 48 | 24 |
| constraint_handling | 3.64 | 0 | 0 | 8 | 39 | 34 | 19 |
| travel_feasibility | 4.31 | 0 | 0 | 0 | 4 | 61 | 35 |
| specificity | 3.99 | 0 | 0 | 0 | 27 | 47 | 26 |
| expression_quality | 3.86 | 0 | 0 | 0 | 26 | 62 | 12 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 50.0% | 100.0% | 0.0% | 4.21 |
| get_hotels | 13 | 69.2% | 100.0% | 0.0% | 3.86 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.56 |
| get_local_food | 8 | 62.5% | 100.0% | 0.0% | 3.81 |
| get_local_specialty | 6 | 83.3% | 100.0% | 0.0% | 4.54 |
| get_spots | 32 | 78.1% | 100.0% | 0.0% | 4.15 |
| get_transport | 9 | 77.8% | 100.0% | 0.0% | 4.01 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.88 |
| search_area | 7 | 85.7% | 100.0% | 0.0% | 4.41 |
| search_hybrid | 16 | 62.5% | 100.0% | 0.0% | 4.20 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 9 | 9.0% |
| B | Ranking Failure (buried below noise) | 8 | 8.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 32 | 32.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 42 | 42.0% |

## Top improvement hints (sample of worst 10)

- **R420v3-028** (sat 2.85, fail=A) — get_spots: Add canonical_depopulated_villages cluster keyed off ghost/abandoned/limited intent.
- **R420v3-033** (sat 3.05, fail=D) — search_hybrid: Suppress 聖地 r3 results when query is music-artist-pilgrimage.
- **R420v3-090** (sat 3.10, fail=A) — get_local_specialty: Add tool/branch for cheap-souvenir intent or route to search_area with 'お土産 安い'.
- **R420v3-041** (sat 3.35, fail=F) — search_hybrid: Add canonical_jr_scenic_trains cluster with pass_coverage field; filter out non-JR when JR Pass is in query.
- **R420v3-047** (sat 3.35, fail=A) — search_hybrid: Add canonical_fuji_viewpoints with named angle + best-month + snow-cap visibility window.
- **R420v3-049** (sat 3.35, fail=F) — get_hotels: Add canonical_luxury_ryokan + cross-prefecture multi-destination handling (Kyoto+Nara).
- **R420v3-051** (sat 3.35, fail=B) — get_hotels: Add canonical_romantic_lodging block keyed on Shodoshima (Olive Park, Angel Road area inns) and suppress henro shukubo w
- **R420v3-062** (sat 3.35, fail=E) — get_local_food: Pair get_spots(prefecture=Iwate, municipality=盛岡市) + canonical_family_iwate.
- **R420v3-064** (sat 3.35, fail=A) — get_local_food: Cross-link get_festivals(prefecture=Yamagata, keyword=芋煮会) and add canonical_imoni_festival block.
- **R420v3-072** (sat 3.35, fail=B) — get_transport: Add canonical_kanagawa_daytrip with Tokyo→Kamakura JR routes + Enoden 1-day pass + recommended station order.
