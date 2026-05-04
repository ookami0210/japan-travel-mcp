# Tourism Agent Evaluation Scorecard — iter8-jp-hotels-only (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 27/100 = **27.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 56/100 = **56.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.97 | 0 | 4 | 37 | 26 | 24 | 9 |
| groundedness | 4.44 | 0 | 0 | 0 | 6 | 44 | 50 |
| factual_accuracy | 4.18 | 0 | 0 | 3 | 12 | 49 | 36 |
| practical_usefulness | 2.44 | 0 | 23 | 29 | 29 | 19 | 0 |
| constraint_handling | 2.27 | 0 | 29 | 31 | 24 | 16 | 0 |
| travel_feasibility | 3.10 | 0 | 1 | 24 | 39 | 36 | 0 |
| specificity | 3.15 | 0 | 3 | 22 | 35 | 37 | 3 |
| expression_quality | 3.22 | 0 | 1 | 13 | 52 | 31 | 3 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 50.0% | 0.0% | 3.25 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.98 |
| get_japan_heritage | 11 | 9.1% | 63.6% | 0.0% | 3.34 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.77 |
| get_local_specialty | 10 | 50.0% | 90.0% | 0.0% | 3.89 |
| get_spots | 15 | 0.0% | 6.7% | 0.0% | 2.58 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 2.84 |
| search_area | 40 | 37.5% | 62.5% | 0.0% | 3.25 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 27 | 27.0% |
| B | Ranking Failure (buried below noise) | 31 | 31.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 12 | 12.0% |
| G | Coverage Failure (too few options) | 9 | 9.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 19 | 19.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.50, fail=H) — search_area: When match relevance is low, return empty + advisory rather than noisy nav pages.
- **L4-15** (sat 1.50, fail=A) — search_area: Phrase-match 擬洋風 (require contiguous string in name/description) instead of substring tokens; index 文化庁 重要文化財 building l
- **L3-12** (sat 1.95, fail=A) — search_area: Index dolphin-watching/swim activity providers; current data covers aquariums only.
- **L3-21** (sat 2.05, fail=B) — search_area: Deduplicate near-identical municipal landing pages and demote cookie-only descriptions.
- **L3-22** (sat 2.10, fail=B) — search_area: Tag yokocho-style izakaya districts; current keyword match is too literal.
- **L2-27** (sat 2.15, fail=A) — get_festivals: Add fireworks dataset; suppress national_heritage fallback when query topic doesn't match.
- **L2-03** (sat 2.20, fail=A) — get_spots: Add an experiences/activity category to get_spots; or build a get_experiences tool that surfaces 体験 keyword spots
- **L3-17** (sat 2.20, fail=B) — search_area: Index temple cuisine experiences; demote cookie/policy boilerplate from results.
- **L3-28** (sat 2.20, fail=B) — search_area: For animal-encounter queries, prioritise spots whose description actually mentions ホエールウォッチング/ウォッチング over name-token mat
- **L3-30** (sat 2.35, fail=B) — search_area: Suppress boilerplate-only spots; consider a railway/transport tag and link to ローカル線 designation list.
