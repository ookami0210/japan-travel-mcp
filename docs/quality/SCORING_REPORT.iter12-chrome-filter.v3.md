# Tourism Agent Evaluation Scorecard — iter12-chrome-filter (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 25/100 = **25.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 71/100 = **71.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.06 | 0 | 3 | 32 | 28 | 30 | 7 |
| groundedness | 4.51 | 0 | 0 | 1 | 7 | 32 | 60 |
| factual_accuracy | 4.32 | 0 | 0 | 3 | 13 | 33 | 51 |
| practical_usefulness | 2.67 | 0 | 10 | 36 | 31 | 23 | 0 |
| constraint_handling | 2.32 | 0 | 31 | 31 | 15 | 21 | 2 |
| travel_feasibility | 3.35 | 0 | 2 | 8 | 43 | 47 | 0 |
| specificity | 3.18 | 0 | 2 | 18 | 43 | 34 | 3 |
| expression_quality | 3.43 | 0 | 5 | 11 | 29 | 46 | 9 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 50.0% | 0.0% | 3.25 |
| get_hotels | 6 | 0.0% | 66.7% | 0.0% | 3.19 |
| get_japan_heritage | 11 | 36.4% | 90.9% | 0.0% | 3.61 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.94 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.86 |
| get_spots | 15 | 0.0% | 80.0% | 0.0% | 3.12 |
| get_traditional_arts | 4 | 25.0% | 50.0% | 0.0% | 3.22 |
| search_area | 40 | 27.5% | 62.5% | 0.0% | 3.22 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 24 | 24.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 24 | 24.0% |
| G | Coverage Failure (too few options) | 11 | 11.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 20 | 20.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.35, fail=H) — search_area: Add infeasibility-aware response: when q has near-zero ground truth, surface adjacent intents (星空/観測/プラネタリウム) explicitly
- **L3-30** (sat 1.70, fail=B) — search_area: Aggressively filter the chrome filter is missing 'About This Page', 'About RSS', cookie banners; add rail-line dataset.
- **L3-12** (sat 1.85, fail=A) — search_area: Index island-tourism dolphin-swim activity pages (Mikurajima); add activity tag 'wild_dolphin_swim'.
- **L3-28** (sat 1.85, fail=A) — search_area: Add whale-watching tour data source; honor lang=fr by routing to translated content; filter out spots whose only relatio
- **L3-06** (sat 2.05, fail=B) — search_area: Drop top-page portal results from search ranks; index dedicated zazen/shukubo pages directly via spot-level body_paragra
- **L3-22** (sat 2.05, fail=B) — search_area: Index named Tokyo yokocho areas; add nightlife/izakaya category to spots.
- **L3-21** (sat 2.15, fail=B) — search_area: Hard-filter Kanagawa-kankou cookie/nav variants by URL pattern; rank actual beach Q-items above amusement parks.
- **L4-15** (sat 2.35, fail=A) — search_area: Index the wikidata 擬洋風 architecture category and surface buildings with that classification first.
- **L3-17** (sat 2.45, fail=B) — search_area: Add experience-cuisine tag (yudofu/shojin); index temple-restaurant body content not just place name.
- **L1-05** (sat 2.50, fail=A) — get_local_food: Add municipality/region keyword filtering to get_local_food, or include Nakagei area's yuzu specifically.
