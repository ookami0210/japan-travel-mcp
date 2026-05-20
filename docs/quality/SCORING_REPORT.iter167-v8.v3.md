# Tourism Agent Evaluation Scorecard — iter167-v8 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 33/100 = **33.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 81/100 = **81.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.48 | 0 | 1 | 7 | 44 | 39 | 9 |
| groundedness | 4.22 | 0 | 0 | 1 | 10 | 55 | 34 |
| factual_accuracy | 4.19 | 0 | 0 | 1 | 12 | 54 | 33 |
| practical_usefulness | 3.16 | 0 | 1 | 21 | 44 | 29 | 5 |
| constraint_handling | 2.98 | 0 | 2 | 30 | 37 | 30 | 1 |
| travel_feasibility | 3.66 | 0 | 0 | 3 | 31 | 63 | 3 |
| specificity | 3.33 | 0 | 1 | 13 | 44 | 36 | 6 |
| expression_quality | 3.04 | 0 | 1 | 17 | 59 | 23 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 2 | 50.0% | 100.0% | 0.0% | 3.56 |
| get_hotels | 16 | 25.0% | 87.5% | 0.0% | 3.34 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_local_food | 11 | 27.3% | 72.7% | 0.0% | 3.55 |
| get_local_specialty | 3 | 33.3% | 66.7% | 0.0% | 3.50 |
| get_spots | 40 | 32.5% | 85.0% | 0.0% | 3.48 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_transport | 4 | 75.0% | 100.0% | 0.0% | 4.16 |
| search_area | 5 | 40.0% | 60.0% | 0.0% | 3.33 |
| search_hybrid | 16 | 25.0% | 68.8% | 6.2% | 3.53 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 4 | 4.0% |
| B | Ranking Failure (buried below noise) | 25 | 25.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 23 | 23.0% |
| G | Coverage Failure (too few options) | 18 | 18.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 25 | 25.0% |

## Top improvement hints (sample of worst 10)

- **R420v8-042** (sat 1.35, fail=B) — get_spots: Fix the extractor that overwrites entity name with og:site_name for hot-ishikawa.jp; add Kenroku-en to canonical Hokurik
- **R420v8-004** (sat 2.35, fail=B) — search_hybrid: Honor prefecture inference (Hokkaido in query); fire hokkaido_climate_pointer indoor_options as canonical block.
- **R420v8-011** (sat 2.35, fail=B) — get_local_food: Add Noto Peninsula sub-region filter; if keyword='魚介' + Ishikawa, surface 輪島/七尾/珠洲 fisher's-market entries first.
- **R420v8-043** (sat 2.35, fail=B) — get_spots: Same extractor fix as 042 (yamaguchi-tourism.jp); add 萩 to canonical preservation_districts; build romantic-ryokan clust
- **R420v8-082** (sat 2.35, fail=B) — search_area: Strict toponym prefecture filter (08 Ibaraki) before returning; hoist Oarai-specific entities.
- **R420v8-015** (sat 2.60, fail=B) — get_spots: Add canonical_oze_hiking block with bloom calendar (水芭蕉 5/下-6/中, ニッコウキスゲ 7月, 草紅葉 9-10月) and trailhead info.
- **R420v8-050** (sat 2.60, fail=F) — get_hotels: Ensure name fallback to name_en when name is null; return canonical_budget_lodging cluster on budget/hostel/murah/cheap;
- **R420v8-070** (sat 2.60, fail=G) — search_hybrid: Boost Nikko-area koyo content in corpus; surface peak-window field (mid-Oct to early-Nov for 中禅寺湖).
- **R420v8-066** (sat 2.65, fail=B) — search_hybrid: Geo-filter results to ±2km of Asakusa toponym; add canonical_accessible_routes for major tourist zones.
- **R420v8-087** (sat 2.75, fail=F) — get_local_specialty: Surface a budget-souvenir canonical block; route 100均 queries away from prefecture-locked GI tool.
