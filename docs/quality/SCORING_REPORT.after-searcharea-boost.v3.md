# Tourism Agent Evaluation Scorecard — after-searcharea-boost (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 17/100 = **17.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 50/100 = **50.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 3/100 = **3.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.71 | 0 | 12 | 34 | 28 | 23 | 3 |
| groundedness | 3.73 | 0 | 0 | 6 | 35 | 39 | 20 |
| factual_accuracy | 3.70 | 0 | 0 | 5 | 37 | 41 | 17 |
| practical_usefulness | 2.44 | 0 | 23 | 28 | 31 | 18 | 0 |
| constraint_handling | 2.36 | 0 | 28 | 29 | 22 | 21 | 0 |
| travel_feasibility | 3.17 | 0 | 0 | 22 | 42 | 33 | 3 |
| specificity | 2.74 | 0 | 8 | 36 | 33 | 20 | 3 |
| expression_quality | 2.86 | 0 | 1 | 35 | 41 | 23 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 50.0% | 12.5% | 2.75 |
| get_hotels | 6 | 0.0% | 0.0% | 0.0% | 2.44 |
| get_japan_heritage | 11 | 9.1% | 45.5% | 9.1% | 2.98 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.75 |
| get_local_specialty | 10 | 40.0% | 80.0% | 0.0% | 3.65 |
| get_spots | 15 | 0.0% | 20.0% | 0.0% | 2.34 |
| get_traditional_arts | 4 | 0.0% | 25.0% | 0.0% | 2.69 |
| search_area | 40 | 25.0% | 60.0% | 2.5% | 3.05 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 22 | 22.0% |
| B | Ranking Failure (buried below noise) | 19 | 19.0% |
| C | Reasoning Failure (synthesised wrong) | 7 | 7.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 24 | 24.0% |
| G | Coverage Failure (too few options) | 2 | 2.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 25 | 25.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.40, fail=H) — search_area: Add a safety/reality-check layer for queries about phenomena not reliably available in Japan. Return factual scarcity st
- **L3-28** (sat 1.40, fail=A) — search_area: Index dedicated whale-watching pages from Ogasawara, Kochi, Okinawa DMOs; add 'ホエールウォッチング' as synonym expansion for クジラ 
- **L4-15** (sat 1.40, fail=A) — search_area: Index architectural heritage spots explicitly; add architecture_style tag; route via get_japan_heritage with theme_filte
- **L3-03** (sat 1.50, fail=A) — get_festivals: Fix prefecture filter on get_festivals — non-Hokkaido items should not appear in Hokkaido results. Add snow-festival tag
- **L1-16** (sat 1.60, fail=A) — search_area: Critical retrieval failure: 那智 keyword matching irrelevant content across all prefectures. Fix search_area to apply stro
- **L2-03** (sat 1.75, fail=A) — get_spots: Add agritourism category to spot corpus; scrape Hokkaido prefectural agritourism pages and JA Hokkaido experience progra
- **L2-06** (sat 1.85, fail=A) — get_spots: Add category/theme filter supporting 'sakura' or seasonal tags; broaden query to all Tohoku prefectures when region name
- **L2-24** (sat 1.85, fail=A) — get_spots: Add 'traditional townscape' (重要伝統的建造物群保存地区) designation as a searchable tag; expand Kyushu-region queries across all 7 p
- **L2-29** (sat 1.85, fail=A) — get_spots: Add cycling route as a spot/attraction type; ingest Shimanami Kaido as a landmark; consider get_activities or get_outdoo
- **L4-08** (sat 1.85, fail=A) — get_traditional_arts: Index shamanic/shugendo content explicitly; add 'mountain_worship' or 'shugendo' as a category in get_traditional_arts; 
