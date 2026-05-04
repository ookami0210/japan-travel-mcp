# Tourism Agent Evaluation Scorecard — iter15-region (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 24/100 = **24.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 75/100 = **75.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.97 | 0 | 4 | 36 | 28 | 23 | 9 |
| groundedness | 4.77 | 0 | 0 | 0 | 4 | 15 | 81 |
| factual_accuracy | 4.55 | 0 | 0 | 1 | 7 | 28 | 64 |
| practical_usefulness | 2.56 | 0 | 15 | 32 | 36 | 16 | 1 |
| constraint_handling | 2.28 | 0 | 34 | 26 | 21 | 16 | 3 |
| travel_feasibility | 3.36 | 0 | 2 | 0 | 58 | 40 | 0 |
| specificity | 3.30 | 0 | 3 | 13 | 39 | 41 | 4 |
| expression_quality | 3.39 | 0 | 0 | 10 | 47 | 37 | 6 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 75.0% | 0.0% | 3.34 |
| get_hotels | 6 | 0.0% | 100.0% | 0.0% | 3.15 |
| get_japan_heritage | 11 | 9.1% | 72.7% | 0.0% | 3.39 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.71 |
| get_local_specialty | 10 | 50.0% | 100.0% | 0.0% | 4.03 |
| get_spots | 15 | 13.3% | 93.3% | 0.0% | 3.41 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 2.78 |
| search_area | 40 | 30.0% | 60.0% | 0.0% | 3.30 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 14 | 14.0% |
| B | Ranking Failure (buried below noise) | 39 | 39.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 7 | 7.0% |
| F | Constraint Failure (ignored explicit constraints) | 17 | 17.0% |
| G | Coverage Failure (too few options) | 10 | 10.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 13 | 13.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.60, fail=G) — search_area: Return empty + advisory when query has near-zero corpus match instead of forcing low-relevance hits.
- **L4-15** (sat 1.75, fail=A) — search_area: Don't return zero-match-quality fallbacks; instead enrich corpus with NHK / 文化庁 architectural-heritage data for 擬洋風建築 de
- **L3-30** (sat 2.00, fail=B) — search_area: Filter out generic boilerplate pages (cookie banners, link policy, 'About this page') from search corpus; add tag for 'l
- **L3-26** (sat 2.10, fail=B) — search_area: Add a shukubo / temple-lodging tag in scrape pipeline; deprioritize duplicate zh/tw cookie-stub pages when lang=en; surf
- **L3-28** (sat 2.10, fail=B) — search_area: Tag whale-watching tour spots; downrank statues/fountains for activity intents; build an activity-type filter (whale_wat
- **L3-06** (sat 2.20, fail=B) — search_area: Penalize portal-homepage chrome; index shukubo/zazen experiences as a typed category.
- **L4-08** (sat 2.25, fail=B) — get_traditional_arts: Expose keyword arg on get_traditional_arts and rerank by description match; tag Shugendo / itako / yamabushi / shaman en
- **L2-08** (sat 2.50, fail=A) — get_spots: Filter out municipal navigation pages (観光課/観光商工係) at scrape time; add ski_resort and onsen tags from OSM amenity=ski_res
- **L3-27** (sat 2.50, fail=B) — search_area: Penalize Wikidata attraction name-keyword matches when query semantically targets towns/villages; boost municipal_scrape
- **L4-03** (sat 2.50, fail=B) — get_traditional_arts: Expose category filter at tool level (allow category='craft'); reorder by category match before qid; provide a 'craft_li
