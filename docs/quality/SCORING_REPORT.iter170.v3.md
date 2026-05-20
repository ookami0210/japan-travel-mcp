# Tourism Agent Evaluation Scorecard — iter170 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 49/100 = **49.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 90/100 = **90.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.70 | 0 | 0 | 8 | 32 | 42 | 18 |
| groundedness | 4.49 | 0 | 0 | 0 | 2 | 47 | 51 |
| factual_accuracy | 4.37 | 0 | 0 | 0 | 9 | 45 | 46 |
| practical_usefulness | 3.49 | 0 | 1 | 12 | 34 | 43 | 10 |
| constraint_handling | 3.24 | 0 | 2 | 15 | 45 | 33 | 5 |
| travel_feasibility | 3.80 | 0 | 0 | 1 | 23 | 71 | 5 |
| specificity | 3.59 | 0 | 0 | 8 | 39 | 39 | 14 |
| expression_quality | 3.36 | 0 | 0 | 7 | 50 | 43 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 2 | 0.0% | 50.0% | 0.0% | 3.25 |
| get_hotels | 16 | 50.0% | 93.8% | 0.0% | 3.78 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 4.00 |
| get_local_food | 11 | 45.5% | 100.0% | 0.0% | 3.84 |
| get_local_specialty | 3 | 33.3% | 66.7% | 0.0% | 3.54 |
| get_spots | 40 | 60.0% | 92.5% | 0.0% | 3.83 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.62 |
| get_transport | 4 | 75.0% | 100.0% | 0.0% | 4.16 |
| search_area | 5 | 20.0% | 60.0% | 0.0% | 3.27 |
| search_hybrid | 16 | 37.5% | 87.5% | 0.0% | 3.62 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 4 | 4.0% |
| B | Ranking Failure (buried below noise) | 15 | 15.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 24 | 24.0% |
| G | Coverage Failure (too few options) | 18 | 18.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 36 | 36.0% |

## Top improvement hints (sample of worst 10)

- **R420v8-050** (sat 2.25, fail=F) — get_hotels: On 'hostel/budget/cheap/murah/安い + price ceiling' filter hotels by lodging_type=hostel/capsule and demote 4-5★ luxury.
- **R420v8-004** (sat 2.35, fail=B) — search_hybrid: Filter search_hybrid by prefecture when toponym is in query; add canonical_hokkaido_indoor cluster.
- **R420v8-066** (sat 2.35, fail=A) — search_hybrid: Trigger canonical_accessible cluster on ベビーカー keyword; fix Asakusa municipality tags.
- **R420v8-082** (sat 2.50, fail=A) — search_area: Add canonical_anime_pilgrimage block; filter by toponym before semantic fallback.
- **R420v8-005** (sat 2.60, fail=A) — get_spots: Build canonical_abandoned_villages or depopulation tag from MIC depopulation-area designations.
- **R420v8-001** (sat 2.85, fail=F) — search_area: Add canonical_kyoto_free_shrines cluster + admission_fee filter on get_spots/search_area.
- **R420v8-027** (sat 2.85, fail=B) — get_spots: Boost nagisa_100 + beach kinds; emit canonical_family_friendly_beaches cluster for Miyazaki.
- **R420v8-087** (sat 2.85, fail=F) — get_local_specialty: Detect 'budget souvenir' / '100均' intent and route to a canonical_budget_souvenir block instead of GI list.
- **R420v8-003** (sat 3.00, fail=G) — search_hybrid: Add canonical_kanazawa_indoor_culture cluster; expand wikidata pull for Kanazawa museums.
- **R420v8-093** (sat 3.00, fail=F) — get_festivals: Filter national_heritage by prefecture_codes; add canonical_accessible_viewing block for major festivals.
