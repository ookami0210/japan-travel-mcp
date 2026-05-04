# Tourism Agent Evaluation Scorecard — iter17-naoshima (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 74/100 = **74.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.97 | 0 | 6 | 33 | 28 | 24 | 9 |
| groundedness | 4.88 | 0 | 0 | 0 | 3 | 6 | 91 |
| factual_accuracy | 4.55 | 0 | 0 | 4 | 4 | 25 | 67 |
| practical_usefulness | 2.59 | 0 | 11 | 39 | 30 | 20 | 0 |
| constraint_handling | 2.20 | 0 | 32 | 33 | 20 | 13 | 2 |
| travel_feasibility | 3.34 | 0 | 1 | 4 | 55 | 40 | 0 |
| specificity | 3.27 | 0 | 0 | 17 | 45 | 32 | 6 |
| expression_quality | 3.31 | 0 | 0 | 11 | 51 | 34 | 4 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 62.5% | 0.0% | 3.20 |
| get_hotels | 6 | 0.0% | 33.3% | 0.0% | 3.00 |
| get_japan_heritage | 11 | 18.2% | 100.0% | 0.0% | 3.51 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 4.12 |
| get_local_specialty | 10 | 60.0% | 90.0% | 0.0% | 3.86 |
| get_spots | 15 | 6.7% | 80.0% | 0.0% | 3.17 |
| get_traditional_arts | 4 | 25.0% | 50.0% | 0.0% | 3.16 |
| search_area | 40 | 35.0% | 70.0% | 0.0% | 3.33 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 23 | 23.0% |
| B | Ranking Failure (buried below noise) | 31 | 31.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 25 | 25.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 10 | 10.0% |

## Top improvement hints (sample of worst 10)

- **L3-28** (sat 1.85, fail=A) — search_area: Map activity intents (whale watching) to canonical wikidata classes; expand to ホエールウォッチング tag.
- **L3-30** (sat 1.85, fail=A) — search_area: Strengthen nav-chrome/landing-page filter; add rail-line entity type and station frequency metadata.
- **L4-15** (sat 1.85, fail=A) — search_area: Add architectural-style entity tagging; lang filter to avoid CN/TW boilerplate when lang=en.
- **L3-22** (sat 2.05, fail=B) — search_area: Add yokocho-district entries with izakaya cluster tagging; demote substring matches like 横丁公園.
- **L1-16** (sat 2.20, fail=A) — search_area: Require 那智 token, not 那 alone; ingest Nachi Falls wikidata; promote prefecture 30 results.
- **L2-24** (sat 2.20, fail=C) — get_spots: Add historic-preservation district (juyo dentoteki kenzobutsu-gun) classification.
- **L2-27** (sat 2.25, fail=A) — get_festivals: Add fireworks-festival dataset (hanabi-taikai); fix prefecture=Niigata festival emptiness.
- **L3-26** (sat 2.45, fail=B) — search_area: Filter by lang param strictly; deprioritize boilerplate landing pages and nav-chrome spots; promote actual shukubo recor
- **L3-06** (sat 2.55, fail=B) — search_area: Boost shukubo (宿坊) entities and add zazen/shojin experience tagging; demote portal landing pages where 修行 appears only i
- **L3-07** (sat 2.55, fail=C) — search_area: Add empty-result + disclaimer path for impossible queries; suppress nav-chrome substring matches.
