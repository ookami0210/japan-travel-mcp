# Tourism Agent Evaluation Scorecard — bigday-0508-pre-e5 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 54/100 = **54.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 95/100 = **95.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.53 | 0 | 2 | 21 | 24 | 28 | 25 |
| groundedness | 4.93 | 0 | 0 | 0 | 0 | 7 | 93 |
| factual_accuracy | 4.81 | 0 | 0 | 0 | 3 | 13 | 84 |
| practical_usefulness | 3.34 | 0 | 2 | 20 | 30 | 38 | 10 |
| constraint_handling | 3.08 | 0 | 11 | 23 | 24 | 31 | 11 |
| travel_feasibility | 3.91 | 0 | 0 | 1 | 23 | 60 | 16 |
| specificity | 4.06 | 0 | 0 | 0 | 20 | 54 | 26 |
| expression_quality | 3.85 | 0 | 0 | 1 | 20 | 72 | 7 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 50.0% | 100.0% | 0.0% | 3.77 |
| get_hotels | 6 | 50.0% | 83.3% | 0.0% | 3.81 |
| get_japan_heritage | 11 | 27.3% | 100.0% | 0.0% | 3.75 |
| get_local_food | 6 | 66.7% | 100.0% | 0.0% | 4.12 |
| get_local_specialty | 10 | 70.0% | 100.0% | 0.0% | 4.20 |
| get_spots | 15 | 26.7% | 100.0% | 0.0% | 3.80 |
| get_traditional_arts | 4 | 50.0% | 100.0% | 0.0% | 3.50 |
| search_area | 40 | 67.5% | 90.0% | 0.0% | 4.05 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 11 | 11.0% |
| B | Ranking Failure (buried below noise) | 18 | 18.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 6 | 6.0% |
| F | Constraint Failure (ignored explicit constraints) | 20 | 20.0% |
| G | Coverage Failure (too few options) | 0 | 0.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 42 | 42.0% |

## Top improvement hints (sample of worst 10)

- **L3-12** (sat 2.05, fail=C) — search_area: Tag wild-dolphin-swim destinations explicitly (Mikurajima, Amakusa) and demote noisy DMO PR pages from search.
- **L3-07** (sat 2.10, fail=C) — search_area: For zero-match exotic queries, return an explicit empty + nearest-substitute note (planetariums, Hokkaido winter night s
- **L3-28** (sat 2.60, fail=A) — search_area: Map 'whale watching' intent to coordinates of confirmed whale-watching ports; suppress unrelated municipal_scrape titles
- **L3-22** (sat 2.85, fail=A) — search_area: Add a yokocho/izakaya-alley tag pointing to the famous Tokyo/Osaka/Sapporo alleys.
- **L1-05** (sat 2.95, fail=A) — get_local_food: Index Japan Heritage stories by keyword; suppress nav-chrome scraped paragraphs from get_local_food output. Add 中芸 alias
- **L2-02** (sat 2.95, fail=F) — get_hotels: Add lodging_type='shukubo' tag derivable from Wikidata P31 Q1281643 or scraped pilgrimage shukubo lists; expose henro-co
- **L3-03** (sat 2.95, fail=A) — get_festivals: Add a yuki/snow kind_tag to the festival index and surface Sapporo/Asahikawa/Otaru events when query intent is snow.
- **L1-03** (sat 3.00, fail=A) — get_japan_heritage: Route tea-field intent to get_local_food/specialty + search_area on '南山城' or '宇治茶'; the Japan Heritage 'A Walk Through t
- **L4-08** (sat 3.00, fail=A) — get_traditional_arts: Add 'shugendo'/'shamanic' tags and link to mountain-village locations
- **L3-04** (sat 3.05, fail=A) — get_japan_heritage: Route 'rural life' / 'inaka' queries to satoyama/farm-stay tags or DMO records rather than 日本遺産 program.
