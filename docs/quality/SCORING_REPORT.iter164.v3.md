# Tourism Agent Evaluation Scorecard — iter164 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 57/100 = **57.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 94/100 = **94.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.83 | 0 | 0 | 6 | 31 | 37 | 26 |
| groundedness | 4.73 | 0 | 0 | 0 | 3 | 21 | 76 |
| factual_accuracy | 4.51 | 0 | 0 | 0 | 6 | 37 | 57 |
| practical_usefulness | 3.68 | 0 | 0 | 11 | 30 | 39 | 20 |
| constraint_handling | 3.45 | 0 | 0 | 19 | 32 | 34 | 15 |
| travel_feasibility | 4.19 | 0 | 0 | 0 | 12 | 57 | 31 |
| specificity | 3.74 | 0 | 0 | 7 | 35 | 35 | 23 |
| expression_quality | 3.45 | 0 | 0 | 7 | 42 | 50 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.50 |
| get_festivals | 3 | 66.7% | 66.7% | 0.0% | 4.04 |
| get_hotels | 14 | 50.0% | 92.9% | 0.0% | 3.77 |
| get_japan_heritage | 3 | 66.7% | 66.7% | 0.0% | 3.75 |
| get_local_food | 14 | 57.1% | 92.9% | 0.0% | 4.07 |
| get_local_specialty | 6 | 50.0% | 100.0% | 0.0% | 4.04 |
| get_spots | 31 | 64.5% | 100.0% | 0.0% | 4.07 |
| get_transport | 4 | 75.0% | 100.0% | 0.0% | 4.03 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.12 |
| search_area | 5 | 80.0% | 100.0% | 0.0% | 4.03 |
| search_hybrid | 18 | 38.9% | 94.4% | 0.0% | 3.80 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 13 | 13.0% |
| B | Ranking Failure (buried below noise) | 16 | 16.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 18 | 18.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 43 | 43.0% |

## Top improvement hints (sample of worst 10)

- **R420v5-087** (sat 2.40, fail=A) — get_dmo: Add disaster-advisory disclaimer in get_dmo response.
- **R420v5-083** (sat 2.50, fail=A) — get_festivals: Add seasonal illumination corpus separate from matsuri.
- **R420v5-060** (sat 2.75, fail=F) — get_hotels: When hotel_type='hostel' OR 'budget' keyword in query, return canonical_budget_lodging block instead of luxury hotels; r
- **R420v5-085** (sat 2.75, fail=A) — get_japan_heritage: Add post-town (宿場) kind tag + Nakasendo route filter.
- **R420v5-002** (sat 2.85, fail=F) — get_local_specialty: Add canonical_budget_souvenir cluster (Daiso/Seria travel-snack picks) and route 100均/お土産 queries away from MAFF GI.
- **R420v5-049** (sat 2.85, fail=B) — search_hybrid: Add prefecture-aware boost; when query mentions Hokkaido, filter results to prefecture_code=01 and add canonical_hokkaid
- **R420v5-063** (sat 2.85, fail=F) — get_hotels: Trigger canonical_budget_lodging when query has 'hostel', 'backpacker', '¥3000', '¥5000/day' tokens; filter hotels list 
- **R420v5-021** (sat 2.95, fail=A) — get_local_food: Add canonical_yamagata_imoni cluster with 馬見ヶ崎 event + style differences + family booking links.
- **R420v5-055** (sat 2.95, fail=A) — search_hybrid: Add canonical_nikko_koyo block with elevation-tiered peak dates; filter results to prefecture when toponym is explicit.
- **R420v5-053** (sat 3.05, fail=B) — search_hybrid: Add canonical_koyo_meisho block (志賀高原, 大雪山, 嵐山suppressed, 香嵐渓, 那智, etc.) with crowd-tier; dedupe results by spot_id.
