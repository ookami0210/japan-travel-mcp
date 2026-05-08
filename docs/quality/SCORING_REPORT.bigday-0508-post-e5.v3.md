# Tourism Agent Evaluation Scorecard — bigday-0508-post-e5 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 55/100 = **55.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 94/100 = **94.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.72 | 0 | 1 | 16 | 24 | 28 | 31 |
| groundedness | 4.86 | 0 | 0 | 0 | 0 | 14 | 86 |
| factual_accuracy | 4.64 | 0 | 0 | 0 | 6 | 24 | 70 |
| practical_usefulness | 3.34 | 0 | 2 | 18 | 31 | 42 | 7 |
| constraint_handling | 3.20 | 0 | 5 | 26 | 24 | 34 | 11 |
| travel_feasibility | 4.14 | 0 | 0 | 3 | 11 | 55 | 31 |
| specificity | 4.00 | 0 | 0 | 4 | 23 | 42 | 31 |
| expression_quality | 3.73 | 0 | 0 | 2 | 29 | 63 | 6 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 50.0% | 100.0% | 0.0% | 3.78 |
| get_hotels | 6 | 50.0% | 83.3% | 0.0% | 3.85 |
| get_japan_heritage | 11 | 27.3% | 90.9% | 0.0% | 3.60 |
| get_local_food | 6 | 66.7% | 100.0% | 0.0% | 4.19 |
| get_local_specialty | 10 | 70.0% | 100.0% | 0.0% | 4.25 |
| get_spots | 15 | 26.7% | 93.3% | 0.0% | 3.75 |
| get_traditional_arts | 4 | 50.0% | 100.0% | 0.0% | 3.69 |
| search_area | 40 | 70.0% | 92.5% | 0.0% | 4.09 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 4 | 4.0% |
| B | Ranking Failure (buried below noise) | 21 | 21.0% |
| C | Reasoning Failure (synthesised wrong) | 4 | 4.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 7 | 7.0% |
| F | Constraint Failure (ignored explicit constraints) | 17 | 17.0% |
| G | Coverage Failure (too few options) | 1 | 1.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 46 | 46.0% |

## Top improvement hints (sample of worst 10)

- **L3-12** (sat 1.95, fail=B) — search_area: Add wild_dolphin_watching kind; route 'swim with' to specific known sites
- **L3-07** (sat 2.35, fail=C) — search_area: Detect impossible-in-Japan queries; return advisory + closest-match (e.g., Hokkaido nightsky / observatories)
- **L3-28** (sat 2.60, fail=A) — search_area: Boost coastal kind=whale_watching / dolphin tags; cross-reference with municipal scrape ホエールウォッチング keyword; honor lang=f
- **L2-02** (sat 2.75, fail=F) — get_hotels: Add lodging_type='shukubo' filter to get_hotels and ingest a shukubo source (e.g. 四国八十八ヶ所霊場会 official directory). Also f
- **L1-03** (sat 2.80, fail=A) — get_japan_heritage: Route this query through search_area or get_japan_heritage with q='茶' / 'Yamashiro' so the 日本茶800年の歴史散歩 story (which exp
- **L2-03** (sat 2.80, fail=F) — get_spots: Add a kinds tag for 'agritourism' / 'farm_stay' and filter on it; or route this query to a future activity-experience to
- **L3-03** (sat 2.95, fail=A) — get_festivals: Ensure get_festivals with prefecture=Hokkaido returns Sapporo Snow Festival; add seasonal/winter classification
- **L4-08** (sat 2.95, fail=A) — get_traditional_arts: Add keyword routing: when query mentions shaman/yamabushi/itako, hit search_hybrid with 修験道/恐山/イタコ rather than generic t
- **L4-12** (sat 2.95, fail=C) — get_japan_heritage: Route religion-diversity queries to a multi-faith composite: get_traditional_arts + heritage joined on religion kinds; h
- **L4-20** (sat 2.95, fail=C) — get_japan_heritage: Auto-route pilgrimage queries to search_hybrid with 巡礼/霊場 keyword across heritage + traditional arts; auto-filter herita
