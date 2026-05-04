# Tourism Agent Evaluation Scorecard — iter19-hotel-corrections (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 22/100 = **22.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 61/100 = **61.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.84 | 0 | 9 | 37 | 22 | 25 | 7 |
| groundedness | 4.35 | 0 | 0 | 2 | 15 | 29 | 54 |
| factual_accuracy | 4.10 | 0 | 0 | 4 | 21 | 36 | 39 |
| practical_usefulness | 2.51 | 0 | 15 | 38 | 29 | 17 | 1 |
| constraint_handling | 2.31 | 0 | 24 | 38 | 21 | 17 | 0 |
| travel_feasibility | 3.27 | 0 | 0 | 4 | 67 | 27 | 2 |
| specificity | 3.03 | 0 | 2 | 32 | 32 | 29 | 5 |
| expression_quality | 3.11 | 0 | 3 | 23 | 38 | 32 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 50.0% | 12.5% | 2.80 |
| get_hotels | 6 | 0.0% | 33.3% | 0.0% | 2.81 |
| get_japan_heritage | 11 | 18.2% | 72.7% | 0.0% | 3.33 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.98 |
| get_local_specialty | 10 | 60.0% | 90.0% | 0.0% | 3.83 |
| get_spots | 15 | 0.0% | 66.7% | 0.0% | 3.11 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 3.03 |
| search_area | 40 | 20.0% | 52.5% | 0.0% | 3.06 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 19 | 19.0% |
| B | Ranking Failure (buried below noise) | 34 | 34.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 11 | 11.0% |
| F | Constraint Failure (ignored explicit constraints) | 13 | 13.0% |
| G | Coverage Failure (too few options) | 5 | 5.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 17 | 17.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.35, fail=H) — search_area: Add a fact-anchor or note when query is a known impossibility/rarity (オーロラ/北極圏現象) rather than dumping fuzzy keyword matc
- **L3-03** (sat 1.40, fail=A) — get_festivals: Apply the prefecture filter to national_heritage as well, and add a snow-festival category/tag so winter requests can hi
- **L2-27** (sat 1.85, fail=A) — get_festivals: Index hanabi/firework events as a festival subcategory; suppress national_heritage fallback when prefecture has no actua
- **L3-01** (sat 1.85, fail=A) — get_festivals: Add a fireworks (花火) tag/category to festival data, or fall back to search_area q='花火' when get_festivals has no firewor
- **L3-02** (sat 1.85, fail=A) — get_festivals: Same as L3-01: tag fireworks separately or auto-fallback to keyword search for 花火.
- **L3-12** (sat 1.85, fail=A) — search_area: Add an activity tag 'wild_dolphin_swim' or surface known islands/programs by name. Distinguish aquarium/captive vs wild 
- **L3-25** (sat 1.85, fail=A) — search_area: Disambiguate 鶴 (place-name vs bird) — query expansion to bird/wildlife terms (タンチョウ, ツル渡来地, crane sanctuary). Tag wildli
- **L2-03** (sat 2.00, fail=F) — get_spots: get_spots needs a category/theme filter (e.g. theme='farm_experience','agritourism'); current pure prominence ranking su
- **L3-06** (sat 2.05, fail=B) — search_area: Filter out portal landing/cookie pages; boost shukubo/zazen-tagged municipal pages and DMO chunks specifically containin
- **L3-21** (sat 2.05, fail=B) — search_area: De-duplicate identical 'cookie-policy' pages; filter out theme parks/pools from beach results; tag remote-island beaches
