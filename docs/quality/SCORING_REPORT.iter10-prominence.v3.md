# Tourism Agent Evaluation Scorecard — iter10-prominence (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 25/100 = **25.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 73/100 = **73.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.01 | 0 | 5 | 33 | 27 | 26 | 9 |
| groundedness | 4.78 | 0 | 0 | 0 | 2 | 18 | 80 |
| factual_accuracy | 4.45 | 0 | 0 | 1 | 12 | 28 | 59 |
| practical_usefulness | 2.60 | 0 | 11 | 35 | 37 | 17 | 0 |
| constraint_handling | 2.31 | 0 | 27 | 31 | 27 | 14 | 1 |
| travel_feasibility | 3.38 | 0 | 2 | 7 | 43 | 47 | 1 |
| specificity | 3.29 | 0 | 1 | 19 | 35 | 40 | 5 |
| expression_quality | 3.25 | 0 | 4 | 15 | 39 | 36 | 6 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.33 |
| get_hotels | 6 | 0.0% | 83.3% | 0.0% | 3.23 |
| get_japan_heritage | 11 | 18.2% | 81.8% | 0.0% | 3.45 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.65 |
| get_local_specialty | 10 | 60.0% | 90.0% | 0.0% | 3.94 |
| get_spots | 15 | 0.0% | 93.3% | 0.0% | 3.46 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 2.84 |
| search_area | 40 | 32.5% | 60.0% | 0.0% | 3.25 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 16 | 16.0% |
| B | Ranking Failure (buried below noise) | 34 | 34.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 22 | 22.0% |
| G | Coverage Failure (too few options) | 9 | 9.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 16 | 16.0% |

## Top improvement hints (sample of worst 10)

- **L4-15** (sat 1.55, fail=A) — search_area: Demote prefecture-portal pages that token-match by sidebar nav; require body-token match.
- **L1-16** (sat 2.05, fail=B) — search_area: Restrict q='那智' string match to records where 那智 is a token in the name, not anywhere in a body; or require prefecture/m
- **L3-07** (sat 2.05, fail=G) — search_area: Detect impossible-in-Japan queries and return an explanatory empty result + redirect to nearest realistic alternative; s
- **L3-12** (sat 2.05, fail=A) — search_area: Add experience-type tag (野生/captive); ingest 御蔵島観光 site; suppress bio pages from text matches.
- **L3-25** (sat 2.05, fail=A) — search_area: Disambiguate 鶴 (bird) vs Tsuru (place name); add wildlife-viewing dataset including 出水/釧路 crane sites.
- **L3-21** (sat 2.15, fail=B) — search_area: Filter out 'Cookie policy/privacy' nav-chrome content; tag actual beach/swim spots vs theme parks; add crowd-level metad
- **L3-30** (sat 2.15, fail=B) — search_area: Filter out boilerplate spots (titles like 'About This Page', 'Travel Planning', 'Privacy Policy') before ranking.
- **L3-22** (sat 2.20, fail=B) — search_area: Add nightlife/izakaya category; promote known yokocho clusters in Tokyo/Yokohama/Osaka.
- **L3-28** (sat 2.20, fail=A) — search_area: Add whale-watching synonym expansion (ホエールウォッチング, ザトウクジラ) and bias toward coastal municipalities.
- **L2-27** (sat 2.35, fail=A) — get_festivals: Hanabi/fireworks need a separate ingestion; suppress unrelated fallback when count=0 or label clearly.
