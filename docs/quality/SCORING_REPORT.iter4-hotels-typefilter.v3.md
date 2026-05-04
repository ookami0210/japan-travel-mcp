# Tourism Agent Evaluation Scorecard — iter4-hotels-typefilter (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 60/100 = **60.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.04 | 0 | 2 | 36 | 27 | 26 | 9 |
| groundedness | 4.39 | 0 | 0 | 1 | 8 | 42 | 49 |
| factual_accuracy | 4.12 | 0 | 0 | 4 | 17 | 42 | 37 |
| practical_usefulness | 2.33 | 0 | 27 | 27 | 32 | 14 | 0 |
| constraint_handling | 2.29 | 0 | 29 | 31 | 24 | 14 | 2 |
| travel_feasibility | 3.50 | 0 | 2 | 4 | 42 | 46 | 6 |
| specificity | 3.03 | 0 | 3 | 27 | 37 | 30 | 3 |
| expression_quality | 3.03 | 0 | 3 | 21 | 52 | 18 | 6 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.22 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 3.00 |
| get_japan_heritage | 11 | 18.2% | 81.8% | 0.0% | 3.36 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.90 |
| get_local_specialty | 10 | 70.0% | 100.0% | 0.0% | 4.04 |
| get_spots | 15 | 6.7% | 13.3% | 0.0% | 2.68 |
| get_traditional_arts | 4 | 25.0% | 50.0% | 0.0% | 3.06 |
| search_area | 40 | 27.5% | 60.0% | 0.0% | 3.12 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 25 | 25.0% |
| B | Ranking Failure (buried below noise) | 34 | 34.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 15 | 15.0% |
| G | Coverage Failure (too few options) | 10 | 10.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 11 | 11.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.40, fail=H) — search_area: When zero topical matches, return empty + advisory instead of unrelated nav-chrome.
- **L3-28** (sat 1.85, fail=A) — search_area: Treat 'クジラ' as activity intent → cross-link to whale-watching DMO experiences; honor lang=fr or fall back to en.
- **L2-03** (sat 1.95, fail=A) — get_spots: Add a category/theme parameter or experience-type filter; integrate green-tourism / 農泊 datasets.
- **L3-30** (sat 2.00, fail=A) — search_area: Use stronger query expansion ('ローカル線','秘境駅') or add a railway/transport entity layer linking station to municipality.
- **L4-15** (sat 2.00, fail=A) — search_area: Add architecture-type tagging (giyofu, modern Japanese, sukiya); index registered Important Cultural Properties under ar
- **L3-06** (sat 2.05, fail=B) — search_area: Penalize portal/landing pages dominated by cookie text; add shukubo/zazen-focused source; respect lang=en for descriptio
- **L3-21** (sat 2.05, fail=B) — search_area: Heavily dedupe Kanagawa portal pages; add tourist-density signal; promote 離島 beaches.
- **L3-22** (sat 2.05, fail=B) — search_area: Add curated nightlife-yokocho dataset; demote pages whose description is mostly cookie-policy text.
- **L3-12** (sat 2.10, fail=B) — search_area: Add 'wildlife encounter' source or filter; aquariums should be tagged distinctly from wild-dolphin spots.
- **L1-16** (sat 2.20, fail=A) — search_area: Restrict search_area scoring so name-token matches dominate over body-text fuzzy matches when query is a short proper-na
