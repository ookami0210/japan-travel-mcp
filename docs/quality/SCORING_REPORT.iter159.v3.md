# Tourism Agent Evaluation Scorecard — iter159 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 40/100 = **40.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 94/100 = **94.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.75 | 0 | 0 | 5 | 37 | 36 | 22 |
| groundedness | 4.25 | 0 | 0 | 0 | 7 | 61 | 32 |
| factual_accuracy | 4.27 | 0 | 0 | 0 | 6 | 61 | 33 |
| practical_usefulness | 3.48 | 0 | 0 | 8 | 45 | 38 | 9 |
| constraint_handling | 3.22 | 0 | 0 | 23 | 39 | 31 | 7 |
| travel_feasibility | 4.06 | 0 | 0 | 0 | 17 | 60 | 23 |
| specificity | 3.64 | 0 | 0 | 6 | 43 | 32 | 19 |
| expression_quality | 3.42 | 0 | 0 | 3 | 56 | 37 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 50.0% | 100.0% | 0.0% | 3.90 |
| get_hotels | 13 | 7.7% | 100.0% | 0.0% | 3.44 |
| get_japan_heritage | 2 | 0.0% | 100.0% | 0.0% | 3.19 |
| get_local_food | 8 | 12.5% | 100.0% | 0.0% | 3.75 |
| get_local_specialty | 6 | 50.0% | 66.7% | 0.0% | 3.79 |
| get_spots | 32 | 53.1% | 93.8% | 0.0% | 3.97 |
| get_transport | 9 | 55.6% | 100.0% | 0.0% | 3.61 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| search_area | 7 | 71.4% | 100.0% | 0.0% | 3.88 |
| search_hybrid | 16 | 25.0% | 87.5% | 0.0% | 3.60 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 9 | 9.0% |
| B | Ranking Failure (buried below noise) | 6 | 6.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 33 | 33.0% |
| G | Coverage Failure (too few options) | 9 | 9.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 36 | 36.0% |

## Top improvement hints (sample of worst 10)

- **R420v3-022** (sat 2.35, fail=B) — get_spots: Distinguish 花 (flower) from compound terms 花織/花火/花澤; add flower-bloom calendar for Okinawa
- **R420v3-094** (sat 2.40, fail=A) — get_local_specialty: Add canonical_wagashi_regions block (Kyoto/Kanazawa/Matsue) + suppress unrelated kinds_match fallback.
- **R420v3-012** (sat 2.50, fail=B) — get_spots: Strict season×toponym filter; demote off-season events when query has specific season term
- **R420v3-045** (sat 2.65, fail=A) — search_hybrid: Expand anime cluster with sub-spots per title; for Evangelion list 仙石原 ススキ草原, Lake Ashi, 大涌谷.
- **R420v3-042** (sat 2.75, fail=F) — search_hybrid: Detect 長野県 in query body and apply prefecture filter even when not explicit kwarg.
- **R420v3-028** (sat 2.85, fail=A) — get_spots: Add cluster for 限界集落 / 廃村 with prefecture filter, or expose depopulation tag from municipal_scrape.
- **R420v3-090** (sat 2.85, fail=E) — get_local_specialty: Add cheap_souvenir cluster tagging mass-market regional snacks (Tokyo Banana, Shiroi-Koibito retail availability).
- **R420v3-098** (sat 3.00, fail=B) — search_hybrid: Suppress generic OSAKA-INFO pages when halal-canonical fires; expand canonical with named restaurants.
- **R420v3-008** (sat 3.05, fail=B) — get_spots: Demote municipal admin pages (現状変更/名刺/詐欺) globally; boost direct toponym matches
- **R420v3-047** (sat 3.15, fail=A) — search_hybrid: Build canonical Fuji Five Lakes cluster with photo viewpoints + best season note (Dec-Feb snow-cap).
