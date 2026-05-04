# Tourism Agent Evaluation Scorecard — deep-scrape (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 12/100 = **12.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 32/100 = **32.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.53 | 0 | 13 | 42 | 27 | 15 | 3 |
| groundedness | 3.17 | 0 | 2 | 19 | 44 | 30 | 5 |
| factual_accuracy | 3.32 | 0 | 2 | 17 | 35 | 39 | 7 |
| practical_usefulness | 2.14 | 0 | 33 | 31 | 25 | 11 | 0 |
| constraint_handling | 2.05 | 0 | 42 | 29 | 14 | 12 | 3 |
| travel_feasibility | 2.91 | 0 | 6 | 25 | 44 | 22 | 3 |
| specificity | 2.45 | 0 | 21 | 32 | 30 | 15 | 2 |
| expression_quality | 2.75 | 0 | 1 | 42 | 38 | 19 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 50.0% | 0.0% | 2.69 |
| get_hotels | 6 | 0.0% | 0.0% | 0.0% | 2.46 |
| get_japan_heritage | 11 | 9.1% | 54.5% | 0.0% | 3.08 |
| get_local_food | 6 | 33.3% | 33.3% | 0.0% | 3.35 |
| get_local_specialty | 10 | 30.0% | 80.0% | 0.0% | 3.41 |
| get_spots | 15 | 0.0% | 0.0% | 0.0% | 1.73 |
| get_traditional_arts | 4 | 0.0% | 0.0% | 0.0% | 2.34 |
| search_area | 40 | 15.0% | 30.0% | 2.5% | 2.67 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 24 | 24.0% |
| B | Ranking Failure (buried below noise) | 25 | 25.0% |
| C | Reasoning Failure (synthesised wrong) | 5 | 5.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 19 | 19.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 16 | 16.0% |

## Top improvement hints (sample of worst 10)

- **L1-06** (sat 1.05, fail=A) — get_spots: Prioritize scraping for high-profile tourism destinations; Hirosaki city tourism website should be in the crawl list.
- **L1-14** (sat 1.05, fail=A) — get_spots: Add Senboku city tourism website to crawl list; Kakunodate is a major inbound destination and must be covered.
- **L3-07** (sat 1.35, fail=H) — search_area: Add intent-classification layer to flag queries where Japan cannot satisfy the intent (aurora, Antarctic, etc.) and retu
- **L1-08** (sat 1.40, fail=A) — search_area: Improve full-text search relevance; 厳島 should strongly match Hiroshima/Miyajima pages. Consider prefecture-boosting when
- **L2-03** (sat 1.40, fail=A) — get_spots: Add an activity/experience category to spots; scrape agritourism-specific pages (農業体験, グリーンツーリズム) and tag them with cate
- **L2-23** (sat 1.40, fail=A) — get_spots: Add theme/keyword index for natural landscape features (lavender, sunflowers, tulips) so flower-field queries return rel
- **L3-28** (sat 1.40, fail=A) — search_area: Index whale watching (ホエールウォッチング) explicitly as a category. Map クジラ keyword to known whale-watching destinations: Ogasaw
- **L2-27** (sat 1.45, fail=A) — get_festivals: Add fireworks/hanabi as a festival subtype in the data model; currently get_festivals only returns intangible heritage d
- **L1-16** (sat 1.65, fail=A) — search_area: Improve geographic relevance scoring; municipality match should strongly boost spots from that exact prefecture/municipa
- **L2-06** (sat 1.65, fail=A) — get_spots: Add keyword-filtered spot retrieval or a seasonal/theme index so queries for 'sakura' return relevant named viewpoints r
