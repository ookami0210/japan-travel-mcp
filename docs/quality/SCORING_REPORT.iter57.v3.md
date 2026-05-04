# Tourism Agent Evaluation Scorecard — iter57 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 30/100 = **30.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 61/100 = **61.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.95 | 0 | 5 | 36 | 30 | 17 | 12 |
| groundedness | 4.14 | 0 | 0 | 3 | 13 | 51 | 33 |
| factual_accuracy | 4.24 | 0 | 0 | 0 | 9 | 58 | 33 |
| practical_usefulness | 2.71 | 0 | 16 | 30 | 26 | 23 | 5 |
| constraint_handling | 2.51 | 0 | 27 | 29 | 17 | 20 | 7 |
| travel_feasibility | 3.50 | 0 | 0 | 5 | 49 | 37 | 9 |
| specificity | 3.15 | 0 | 5 | 23 | 35 | 26 | 11 |
| expression_quality | 3.47 | 0 | 0 | 14 | 32 | 47 | 7 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 62.5% | 0.0% | 3.08 |
| get_hotels | 6 | 0.0% | 16.7% | 0.0% | 2.67 |
| get_japan_heritage | 11 | 9.1% | 36.4% | 0.0% | 2.99 |
| get_local_food | 6 | 33.3% | 66.7% | 0.0% | 3.46 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.80 |
| get_spots | 15 | 13.3% | 40.0% | 0.0% | 3.08 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.28 |
| search_area | 40 | 47.5% | 72.5% | 0.0% | 3.54 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 12 | 12.0% |
| B | Ranking Failure (buried below noise) | 12 | 12.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 34 | 34.0% |
| G | Coverage Failure (too few options) | 5 | 5.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 32 | 32.0% |

## Top improvement hints (sample of worst 10)

- **L3-03** (sat 1.75, fail=A) — get_festivals: Populate Hokkaido festival data; add keyword search within get_festivals; ensure fallback logic returns topically releva
- **L3-07** (sat 1.75, fail=A) — search_area: Improve embedding/BM25 recall for オーロラ to find actual relevant content; consider a fallback message when fewer than N hi
- **L3-28** (sat 1.90, fail=A) — search_area: Add a whale-watching activity category to municipal_scrape ingestion; create a keyword alias mapping 'クジラ' → 'ホエールウォッチング
- **L3-30** (sat 1.90, fail=A) — search_area: Map 'ローカル線' and 'ローカル鉄道' as compound terms; add railway/transportation metadata to municipal_scrape ingestion; suppress 
- **L4-15** (sat 1.90, fail=A) — search_area: Add 擬洋風 as a named architecture style tag in scraping; suppress multilingual homepage navigation pages that match on cha
- **L2-15** (sat 2.15, fail=A) — get_hotels: Add Koyasan shukubo as a lodging_type or kind. Consider adding municipality-level filtering to get_hotels. Koyasan wikid
- **L4-08** (sat 2.15, fail=A) — get_traditional_arts: Add a keyword filter to get_traditional_arts for '山岳信仰' or 'shaman'; enrich Hayachine Kagura and similar entries with th
- **L2-03** (sat 2.20, fail=F) — get_spots: Add an experience/activity category to get_spots or create get_agri_experience tool; tag farms and agricultural tourism 
- **L2-24** (sat 2.25, fail=A) — get_spots: For historic townscape queries, use search_area(q=重要伝統的建造物群保存地区) or filter by heritage_designations including Q850649 (I
- **L3-12** (sat 2.35, fail=B) — search_area: Index dolphin-watching/swimming activity pages specifically; add activity_type metadata; disambiguate 'captive display' 
