# Tourism Agent Evaluation Scorecard — iter160 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 48/100 = **48.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 93/100 = **93.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.75 | 0 | 0 | 5 | 34 | 42 | 19 |
| groundedness | 4.48 | 0 | 0 | 0 | 3 | 46 | 51 |
| factual_accuracy | 4.38 | 0 | 0 | 0 | 7 | 48 | 45 |
| practical_usefulness | 3.63 | 0 | 0 | 8 | 37 | 39 | 16 |
| constraint_handling | 3.37 | 0 | 1 | 15 | 39 | 36 | 9 |
| travel_feasibility | 4.24 | 0 | 0 | 0 | 13 | 50 | 37 |
| specificity | 3.63 | 0 | 0 | 7 | 37 | 42 | 14 |
| expression_quality | 3.45 | 0 | 0 | 7 | 45 | 44 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 50.0% | 100.0% | 0.0% | 4.06 |
| get_hotels | 13 | 15.4% | 92.3% | 0.0% | 3.57 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.19 |
| get_local_food | 8 | 0.0% | 100.0% | 0.0% | 3.44 |
| get_local_specialty | 6 | 83.3% | 83.3% | 0.0% | 4.08 |
| get_spots | 32 | 56.2% | 96.9% | 0.0% | 3.90 |
| get_transport | 9 | 0.0% | 77.8% | 0.0% | 3.39 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.88 |
| search_area | 7 | 85.7% | 85.7% | 0.0% | 4.05 |
| search_hybrid | 16 | 68.8% | 93.8% | 0.0% | 4.18 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 16 | 16.0% |
| C | Reasoning Failure (synthesised wrong) | 4 | 4.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 24 | 24.0% |
| G | Coverage Failure (too few options) | 12 | 12.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 35 | 35.0% |

## Top improvement hints (sample of worst 10)

- **R420v3-060** (sat 2.40, fail=F) — get_hotels: For 関東 + バリアフリー, fan out to all 7 Kanto prefectures with hotel_type='accessible'
- **R420v3-098** (sat 2.65, fail=B) — search_hybrid: Curate halal-certified restaurant entries with JHA/JMA cert; fix 岬町 municipality mis-tagging.
- **R420v3-080** (sat 2.70, fail=B) — search_area: Bias search_area toward toponym match: '宮島' should pin Hiroshima/Hatsukaichi results above generic barrier-free pages.
- **R420v3-017** (sat 2.75, fail=F) — get_spots: Add accessibility filter + lang=vi pass-through; never lead with seasonal flower clusters on accessibility queries.
- **R420v3-076** (sat 2.75, fail=A) — get_transport: Add canonical inter-city route comparison block keyed on '東京→日光' with Tobu/JR operator + fare + time.
- **R420v3-090** (sat 2.75, fail=A) — get_local_specialty: Add advisory: 100yen/super souvenir category not in official scope; defer to LLM client.
- **R420v3-099** (sat 2.75, fail=F) — get_transport: Add accessibility/barrier-free advisory for Nikko Toshogu (steep approach + slope alternative).
- **R420v3-061** (sat 2.95, fail=B) — get_local_food: Filter scraped_local_food for query keyword in name/description, suppress generic 屋内観光 pages
- **R420v3-009** (sat 3.10, fail=F) — get_spots: Add accessibility tag; surface 出島, 平和公園 which have wheelchair routes documented.
- **R420v3-041** (sat 3.10, fail=F) — search_hybrid: Add canonical_jr_pass_eligible_scenic_rail cluster with explicit pass-coverage flag.
