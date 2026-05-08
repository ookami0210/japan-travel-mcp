# Tourism Agent Evaluation Scorecard — iter100-anaba-region (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 36/100 = **36.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 76/100 = **76.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.40 | 0 | 2 | 23 | 28 | 27 | 20 |
| groundedness | 4.43 | 0 | 0 | 0 | 4 | 49 | 47 |
| factual_accuracy | 4.39 | 0 | 0 | 0 | 2 | 57 | 41 |
| practical_usefulness | 3.05 | 0 | 6 | 23 | 36 | 30 | 5 |
| constraint_handling | 2.83 | 0 | 19 | 29 | 15 | 24 | 13 |
| travel_feasibility | 4.10 | 0 | 0 | 1 | 17 | 53 | 29 |
| specificity | 3.41 | 0 | 1 | 15 | 41 | 28 | 15 |
| expression_quality | 3.44 | 0 | 0 | 5 | 51 | 39 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 75.0% | 0.0% | 3.39 |
| get_hotels | 6 | 33.3% | 50.0% | 0.0% | 3.48 |
| get_japan_heritage | 11 | 27.3% | 72.7% | 0.0% | 3.40 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.83 |
| get_local_specialty | 10 | 50.0% | 100.0% | 0.0% | 3.92 |
| get_spots | 15 | 20.0% | 53.3% | 0.0% | 3.27 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 3.16 |
| search_area | 40 | 52.5% | 85.0% | 0.0% | 3.84 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 3 | 3.0% |
| B | Ranking Failure (buried below noise) | 6 | 6.0% |
| C | Reasoning Failure (synthesised wrong) | 10 | 10.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 28 | 28.0% |
| G | Coverage Failure (too few options) | 2 | 2.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 51 | 51.0% |

## Top improvement hints (sample of worst 10)

- **L3-28** (sat 2.00, fail=B) — search_area: Add whale_watching kind tag to spots in Ogata (Kochi), Kerama (Okinawa), Ogasawara; support keyword synonyms (クジラウォッチング,
- **L2-03** (sat 2.20, fail=A) — get_spots: Scrape agri-tourism pages from Hokkaido official tourism sites; add farm-experience as a category/kind. Furano lavender 
- **L3-07** (sat 2.25, fail=C) — search_area: Add a no-match note when query intent is phenomena not found in Japan; or surface a clarification flag when オーロラ search 
- **L3-03** (sat 2.40, fail=F) — get_festivals: Add snow-festival kind tag or keyword; ensure get_festivals fallback doesn't surface geographically unrelated national h
- **L2-02** (sat 2.45, fail=F) — get_hotels: Add shukubo lodging_type to hotels data, or add a note that shukubo are available at many of the 88 Shikoku temples. Cur
- **L3-12** (sat 2.45, fail=B) — search_area: Deprioritize generic tourism portal pages that only tangentially mention イルカ; elevate specific wild-dolphin spots using 
- **L4-08** (sat 2.50, fail=A) — get_traditional_arts: Add itako, yamabushi, mountain_ascetic kind tags; improve keyword routing so 'shaman/山岳信仰' queries hit search_area(q='イタ
- **L2-23** (sat 2.65, fail=F) — get_spots: Add lavender/flower_garden kind tags; scrape Hokkaido flower farm pages for Biei, Nakafurano, Kami-Furano; add seasonal 
- **L1-03** (sat 2.75, fail=F) — get_japan_heritage: Route tea/village queries through search_area with municipality param or get_local_specialty with keyword, not get_japan
- **L2-11** (sat 2.75, fail=F) — get_spots: Add dark_sky or stargazing kind tag; link to remote island spots in Okinawa (Yaeyama, Miyako groups). Consider semantic 
