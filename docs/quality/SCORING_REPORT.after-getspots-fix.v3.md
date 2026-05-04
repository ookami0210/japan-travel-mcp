# Tourism Agent Evaluation Scorecard — after-getspots-fix (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 11/100 = **11.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 44/100 = **44.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 2/100 = **2.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.63 | 0 | 11 | 40 | 26 | 21 | 2 |
| groundedness | 3.54 | 0 | 0 | 9 | 40 | 39 | 12 |
| factual_accuracy | 3.65 | 0 | 0 | 4 | 39 | 45 | 12 |
| practical_usefulness | 2.29 | 0 | 31 | 24 | 30 | 15 | 0 |
| constraint_handling | 2.32 | 0 | 28 | 30 | 24 | 18 | 0 |
| travel_feasibility | 3.22 | 0 | 2 | 13 | 46 | 39 | 0 |
| specificity | 2.44 | 0 | 17 | 39 | 27 | 17 | 0 |
| expression_quality | 2.92 | 0 | 4 | 27 | 44 | 23 | 2 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 50.0% | 25.0% | 2.69 |
| get_hotels | 6 | 0.0% | 0.0% | 0.0% | 2.33 |
| get_japan_heritage | 11 | 9.1% | 45.5% | 0.0% | 3.03 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.69 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.74 |
| get_spots | 15 | 0.0% | 20.0% | 0.0% | 2.48 |
| get_traditional_arts | 4 | 0.0% | 25.0% | 0.0% | 2.69 |
| search_area | 40 | 10.0% | 42.5% | 0.0% | 2.78 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 15 | 15.0% |
| B | Ranking Failure (buried below noise) | 21 | 21.0% |
| C | Reasoning Failure (synthesised wrong) | 6 | 6.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 26 | 26.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 25 | 25.0% |

## Top improvement hints (sample of worst 10)

- **L3-03** (sat 1.40, fail=A) — get_festivals: Fix prefecture filter logic in get_festivals — items without Hokkaido prefecture codes should not appear when prefecture
- **L3-28** (sat 1.40, fail=A) — search_area: Keyword クジラ in municipal scrape data is too sparse; add dedicated marine wildlife / whale watching activity tags or a ge
- **L3-30** (sat 1.40, fail=A) — search_area: Search ローカル線 as a compound term; add a transport-mode tag for scenic rural railways so they can be queried via a dedicat
- **L4-15** (sat 1.40, fail=A) — search_area: Add architectural style tags (擬洋風, 洋館, 明治建築) to historical building entries; supplement search_area with a get_architect
- **L3-07** (sat 1.60, fail=A) — search_area: For queries about phenomena very rarely seen in Japan (オーロラ), return a factual disclaimer + the geographically closest r
- **L3-12** (sat 1.60, fail=A) — search_area: Add 野生 (wild) + イルカ + 遊泳 as compound query; tag eco-marine experiences; Mikurajima should be a top result for this query
- **L4-08** (sat 1.75, fail=A) — get_traditional_arts: Add search_area('山岳信仰') or get_traditional_arts with a spiritual_practice filter; corpus needs better coverage of Shugen
- **L3-01** (sat 1.85, fail=A) — get_festivals: Add a fireworks (花火) category or tag to festival data; alternatively surface a search_area fallback with q=花火 when get_f
- **L3-02** (sat 1.85, fail=A) — get_festivals: Same as L3-01: tag or filter fireworks events separately, or fall back to keyword search for 花火.
- **L1-08** (sat 1.90, fail=A) — search_area: Critical ranking bug: 'strict' keyword match for '厳島' should surface Q10512 (Itsukushima Shrine) as top wikidata result;
