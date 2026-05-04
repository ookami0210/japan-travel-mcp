# Tourism Agent Evaluation Scorecard — iter5-heritage-arts-q (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 34/100 = **34.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 67/100 = **67.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.21 | 0 | 1 | 29 | 30 | 28 | 12 |
| groundedness | 4.60 | 0 | 0 | 0 | 4 | 32 | 64 |
| factual_accuracy | 4.29 | 0 | 0 | 1 | 13 | 42 | 44 |
| practical_usefulness | 2.54 | 0 | 23 | 24 | 29 | 24 | 0 |
| constraint_handling | 2.44 | 0 | 26 | 26 | 29 | 16 | 3 |
| travel_feasibility | 3.35 | 0 | 1 | 7 | 49 | 42 | 1 |
| specificity | 3.27 | 0 | 1 | 17 | 42 | 34 | 6 |
| expression_quality | 3.21 | 0 | 5 | 12 | 44 | 35 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 37.5% | 87.5% | 0.0% | 3.47 |
| get_hotels | 6 | 0.0% | 66.7% | 0.0% | 3.12 |
| get_japan_heritage | 11 | 27.3% | 72.7% | 0.0% | 3.49 |
| get_local_food | 6 | 33.3% | 100.0% | 0.0% | 3.88 |
| get_local_specialty | 10 | 80.0% | 100.0% | 0.0% | 4.08 |
| get_spots | 15 | 13.3% | 26.7% | 0.0% | 2.90 |
| get_traditional_arts | 4 | 0.0% | 75.0% | 0.0% | 3.12 |
| search_area | 40 | 40.0% | 62.5% | 0.0% | 3.29 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 19 | 19.0% |
| B | Ranking Failure (buried below noise) | 40 | 40.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 10 | 10.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 21 | 21.0% |

## Top improvement hints (sample of worst 10)

- **L3-26** (sat 1.80, fail=B) — search_area: Filter out cookie/privacy boilerplate; route lang=en queries to en-content; add a shukubo facility tag and prioritise Ko
- **L3-12** (sat 1.95, fail=A) — search_area: Add experience-type tag (wild_swim, captive_show, sighting_cruise) and source from Tokyo Islands and Amakusa DMOs.
- **L3-30** (sat 1.95, fail=B) — search_area: Filter out admin/utility pages from search index; add rail-line metadata so 'local train' queries can surface station-at
- **L3-28** (sat 2.05, fail=B) — search_area: Add activity tag (whale-watching) tied to coastal municipalities; honour lang=fr by translating descriptions or filterin
- **L4-15** (sat 2.05, fail=A) — search_area: Add architectural-style tag (giyo-fu, Meiji-Western, kominka) to Wikidata buildings; index by style not just name
- **L3-21** (sat 2.15, fail=B) — search_area: Drop cookie-policy/'travel planning' landing pages from search index; add quietness/remoteness scoring for beaches.
- **L3-16** (sat 2.20, fail=F) — search_area: Apply distance-from-origin filter when query specifies a base city; tag volcanos by access-time-from-Tokyo/Osaka.
- **L3-17** (sat 2.20, fail=B) — search_area: Tag tofu specialty by sub-type (yudofu/goma-dofu/frozen) and link to temples that serve them; ID translation needed.
- **L2-24** (sat 2.35, fail=C) — get_spots: Add 'historic_district' tag; surface preserved townscapes; support Kyushu region query.
- **L3-06** (sat 2.45, fail=B) — search_area: Filter out cookie-policy/landing pages from search results; add dedicated shukubo/zazen tag and EN translations.
