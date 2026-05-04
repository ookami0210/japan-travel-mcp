# Tourism Agent Evaluation Scorecard — iter56-fullembedv2 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 67/100 = **67.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.99 | 0 | 3 | 36 | 31 | 19 | 11 |
| groundedness | 4.28 | 0 | 0 | 1 | 14 | 41 | 44 |
| factual_accuracy | 4.39 | 0 | 0 | 0 | 11 | 39 | 50 |
| practical_usefulness | 2.64 | 0 | 18 | 29 | 26 | 25 | 2 |
| constraint_handling | 2.39 | 0 | 33 | 26 | 18 | 15 | 8 |
| travel_feasibility | 3.66 | 0 | 2 | 6 | 35 | 38 | 19 |
| specificity | 3.21 | 0 | 5 | 20 | 33 | 33 | 9 |
| expression_quality | 3.40 | 0 | 0 | 14 | 37 | 44 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.27 |
| get_hotels | 6 | 0.0% | 33.3% | 0.0% | 2.75 |
| get_japan_heritage | 11 | 9.1% | 45.5% | 0.0% | 3.12 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.75 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.91 |
| get_spots | 15 | 13.3% | 60.0% | 0.0% | 3.15 |
| get_traditional_arts | 4 | 0.0% | 75.0% | 0.0% | 3.38 |
| search_area | 40 | 42.5% | 72.5% | 0.0% | 3.44 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 7 | 7.0% |
| B | Ranking Failure (buried below noise) | 14 | 14.0% |
| C | Reasoning Failure (synthesised wrong) | 5 | 5.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 40 | 40.0% |
| G | Coverage Failure (too few options) | 3 | 3.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 30 | 30.0% |

## Top improvement hints (sample of worst 10)

- **L3-28** (sat 1.65, fail=A) — search_area: Add 'whale watching' (ホエールウォッチング) as a structured activity tag in municipal scrape entries for Ogasawara, Kochi, and Oki
- **L3-07** (sat 1.75, fail=A) — search_area: Add an aurora/astronomical events data source; or return a graceful 'limited data' response rather than unrelated noise;
- **L3-30** (sat 2.00, fail=A) — search_area: Improve scrape filtering to exclude policy/navigation pages (link pages, cookie notices, congestion status pages). Index
- **L4-15** (sat 2.00, fail=A) — search_area: Add 擬洋風建築 and Meiji-era Western-style buildings as indexed tags in heritage and wikidata entries. When keyword matches a
- **L2-03** (sat 2.10, fail=A) — get_spots: Add agri-tourism/farm-experience as a category in the data model. get_spots with kind filter for 'farm' or 'agri_experie
- **L3-03** (sat 2.10, fail=A) — get_festivals: Index Hokkaido snow festivals as a distinct data source; ensure prefecture filter on national_heritage fallback also app
- **L3-12** (sat 2.10, fail=F) — search_area: Add marine wildlife activity data; filter municipal_scrape results that have zero semantic overlap with the query entity
- **L3-17** (sat 2.10, fail=A) — search_area: Index temple cuisine (精進料理) as a dedicated category; search_area({'q':'精進料理'}) would outperform '豆腐' here; add Indonesia
- **L3-22** (sat 2.10, fail=B) — search_area: Add nightlife/izakaya alley data source; distinguish 横丁 as 'alley district' concept from entities merely containing the 
- **L1-15** (sat 2.35, fail=B) — get_spots: Add Onomichi-specific wikidata and DMO scrape for core city attractions. Fix municipality assignment for Ōkunoshima. Fil
