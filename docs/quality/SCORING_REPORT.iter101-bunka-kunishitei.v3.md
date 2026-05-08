# Tourism Agent Evaluation Scorecard — iter101-bunka-kunishitei (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 30/100 = **30.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 73/100 = **73.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.16 | 0 | 6 | 27 | 25 | 29 | 13 |
| groundedness | 4.53 | 0 | 0 | 0 | 2 | 43 | 55 |
| factual_accuracy | 4.35 | 0 | 0 | 0 | 4 | 57 | 39 |
| practical_usefulness | 2.84 | 0 | 9 | 29 | 33 | 27 | 2 |
| constraint_handling | 2.85 | 0 | 14 | 34 | 15 | 27 | 10 |
| travel_feasibility | 3.65 | 0 | 0 | 5 | 28 | 64 | 3 |
| specificity | 3.24 | 0 | 3 | 17 | 41 | 31 | 8 |
| expression_quality | 3.30 | 0 | 0 | 8 | 56 | 34 | 2 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 75.0% | 0.0% | 3.16 |
| get_hotels | 6 | 33.3% | 83.3% | 0.0% | 3.52 |
| get_japan_heritage | 11 | 9.1% | 54.5% | 0.0% | 3.14 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.48 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.84 |
| get_spots | 15 | 13.3% | 40.0% | 0.0% | 3.12 |
| get_traditional_arts | 4 | 0.0% | 75.0% | 0.0% | 3.06 |
| search_area | 40 | 47.5% | 82.5% | 0.0% | 3.75 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 11 | 11.0% |
| B | Ranking Failure (buried below noise) | 9 | 9.0% |
| C | Reasoning Failure (synthesised wrong) | 7 | 7.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 30 | 30.0% |
| G | Coverage Failure (too few options) | 2 | 2.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 37 | 37.0% |

## Top improvement hints (sample of worst 10)

- **L3-28** (sat 1.75, fail=A) — search_area: Index whale-watching activity under a dedicated kind tag (e.g. 'whale_watching') or add semantic embedding for whale-wat
- **L3-07** (sat 1.95, fail=C) — search_area: For physically-implausible queries (aurora in Japan), the server should surface a metadata flag or the agent should be a
- **L2-03** (sat 2.10, fail=A) — get_spots: Add agri_tourism and farm_stay as lodging/activity types; scrape MAFF Green Tourism registry or Hokkaido's official agri
- **L3-03** (sat 2.10, fail=F) — get_festivals: Add 'yuki_matsuri' kind tag; ensure Hokkaido snow festival entries exist in the festivals corpus. When festivals count=0
- **L4-08** (sat 2.10, fail=A) — get_traditional_arts: Route shamanic/religious-practice queries to search_area with terms like 山伏, 修験道, イタコ, 霊場; get_traditional_arts without 
- **L3-12** (sat 2.20, fail=B) — search_area: Add kind tags 'wildlife_encounter' and 'dolphin_swim' to Mikurajima/Ogasawara entries. Penalise low-relevance keyword-on
- **L4-05** (sat 2.25, fail=A) — get_japan_heritage: Intercept 'UNESCO' queries before routing to get_japan_heritage; redirect to search_area with 'UNESCO' or add a UNESCO_W
- **L4-12** (sat 2.25, fail=A) — get_japan_heritage: Route religious diversity queries to search_area or get_traditional_arts with relevant keywords; get_japan_heritage is u
- **L2-23** (sat 2.50, fail=A) — get_spots: Add lavender, flower_field, shikisai kind tags. Scrape Hokkaido flower tourism pages from official prefecture portal. Co
- **L1-05** (sat 2.70, fail=F) — get_local_food: Apply keyword filter when q is implicitly present in the intent; add category guard to exclude scraped_local_food items 
