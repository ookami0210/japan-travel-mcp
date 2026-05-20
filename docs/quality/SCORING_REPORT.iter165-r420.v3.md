# Tourism Agent Evaluation Scorecard — iter165-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 270/420 = **64.3%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 413/420 = **98.3%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.06 | 0 | 0 | 5 | 89 | 202 | 124 |
| groundedness | 4.59 | 0 | 0 | 0 | 6 | 159 | 255 |
| factual_accuracy | 4.57 | 0 | 0 | 1 | 6 | 166 | 247 |
| practical_usefulness | 3.80 | 0 | 0 | 18 | 126 | 199 | 77 |
| constraint_handling | 3.72 | 0 | 0 | 28 | 131 | 191 | 70 |
| travel_feasibility | 4.38 | 0 | 0 | 1 | 20 | 218 | 181 |
| specificity | 3.90 | 0 | 0 | 6 | 125 | 196 | 93 |
| expression_quality | 3.65 | 0 | 0 | 14 | 132 | 261 | 13 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.00 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.38 |
| get_festivals | 25 | 88.0% | 100.0% | 0.0% | 4.45 |
| get_hotels | 56 | 58.9% | 100.0% | 0.0% | 3.88 |
| get_japan_heritage | 9 | 55.6% | 100.0% | 0.0% | 3.94 |
| get_local_food | 35 | 45.7% | 97.1% | 0.0% | 3.92 |
| get_local_specialty | 22 | 68.2% | 100.0% | 0.0% | 4.16 |
| get_spots | 136 | 65.4% | 98.5% | 0.0% | 4.12 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.50 |
| get_transport | 34 | 88.2% | 100.0% | 0.0% | 4.36 |
| plan_feasibility_check | 5 | 80.0% | 100.0% | 0.0% | 4.20 |
| search_area | 30 | 83.3% | 93.3% | 0.0% | 4.22 |
| search_hybrid | 65 | 46.2% | 96.9% | 0.0% | 3.92 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 45 | 10.7% |
| B | Ranking Failure (buried below noise) | 52 | 12.4% |
| C | Reasoning Failure (synthesised wrong) | 2 | 0.5% |
| D | Grounding Failure (made up content) | 1 | 0.2% |
| E | Practicality Failure (correct but unusable) | 14 | 3.3% |
| F | Constraint Failure (ignored explicit constraints) | 63 | 15.0% |
| G | Coverage Failure (too few options) | 36 | 8.6% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 207 | 49.3% |

## Top improvement hints (sample of worst 10)

- **R-261** (sat 2.50, fail=B) — search_hybrid: Add scenic_train kind filter + JR-operator filter; build a canonical_tohoku_jr_scenic_trains block (Resort Shirakami / P
- **R-070** (sat 2.60, fail=B) — search_area: Boost wikidata heritage hits over municipal index pages in search_area ranking.
- **R-064** (sat 2.70, fail=B) — get_local_food: Strip nav-chrome from body_paragraphs; surface canonical_olive_destinations block for Kagawa.
- **R-369** (sat 2.75, fail=A) — search_area: Region-fan-out to Hiroshima for Miyajima toponym; add canonical_miyajima_accessibility cluster.
- **R-283** (sat 2.85, fail=A) — get_local_specialty: Add canonical_budget_omiyage cluster (Daiso, 100yen, supermarket regional snacks).
- **R-325** (sat 2.85, fail=B) — get_spots: Detect 雨/台風/室内 intent; filter spots by indoor_capable='indoor'; suppress sakura cluster.
- **R-326** (sat 2.85, fail=B) — get_spots: Indoor-capable filter + typhoon advisory message when typhoon keyword detected.
- **R-220** (sat 2.85, fail=B) — search_hybrid: dedup search_hybrid results and add canonical_nikko_koyo block (mid-Oct lake to mid-Nov city)
- **R-267** (sat 2.90, fail=C) — plan_feasibility_check: Replace haversine-only fallback with a Shinkansen-pair lookup table for major-city OD pairs (Tokyo↔Kyoto↔Osaka↔Hakata et
- **R-322** (sat 3.00, fail=G) — search_hybrid: Expand canonical_halal_food with Nagoya entries.
