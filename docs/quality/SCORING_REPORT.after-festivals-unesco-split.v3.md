# Tourism Agent Evaluation Scorecard — after-festivals-unesco-split (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 22/100 = **22.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 61/100 = **61.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.02 | 0 | 2 | 39 | 24 | 25 | 10 |
| groundedness | 4.46 | 0 | 0 | 0 | 8 | 38 | 54 |
| factual_accuracy | 4.14 | 0 | 0 | 1 | 14 | 55 | 30 |
| practical_usefulness | 2.50 | 0 | 20 | 26 | 38 | 16 | 0 |
| constraint_handling | 2.49 | 0 | 18 | 38 | 24 | 17 | 3 |
| travel_feasibility | 3.38 | 0 | 0 | 11 | 41 | 47 | 1 |
| specificity | 3.04 | 0 | 1 | 32 | 32 | 32 | 3 |
| expression_quality | 3.24 | 0 | 1 | 14 | 50 | 30 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.30 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.92 |
| get_japan_heritage | 11 | 0.0% | 72.7% | 0.0% | 3.30 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.75 |
| get_local_specialty | 10 | 50.0% | 90.0% | 0.0% | 3.94 |
| get_spots | 15 | 6.7% | 26.7% | 0.0% | 2.80 |
| get_traditional_arts | 4 | 0.0% | 25.0% | 0.0% | 3.00 |
| search_area | 40 | 30.0% | 65.0% | 0.0% | 3.31 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 25 | 25.0% |
| B | Ranking Failure (buried below noise) | 31 | 31.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 19 | 19.0% |
| G | Coverage Failure (too few options) | 11 | 11.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 12 | 12.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.60, fail=A) — search_area: Server can't say 'no'; but should better filter — drop pure-cookie/privacy pages from results, surface relevant Hokkaido
- **L2-27** (sat 1.85, fail=A) — get_festivals: Add a fireworks (hanabi taikai) dataset; scope national_heritage strictly to the requested prefecture or relabel as 'rel
- **L3-30** (sat 2.00, fail=B) — search_area: Filter out chrome/cookie/'About this page' results; add a local-line index keyed to JR/private rural lines.
- **L3-21** (sat 2.05, fail=B) — search_area: Aggressively dedupe and filter cookie/privacy/notice pages; add 'remote/穴場' beach tagging.
- **L3-28** (sat 2.10, fail=B) — search_area: Use semantic match: cluster 'whale-watching' to coastal-tour spots; filter out monuments/statues when intent is activity
- **L4-15** (sat 2.10, fail=A) — search_area: Add architecture-style index (giyofu/Meiji-modern) using Wikidata architectural-style claim.
- **L3-25** (sat 2.20, fail=B) — search_area: Disambiguate 鶴 as bird vs place-name; route bird/wildlife queries to a wildlife dataset (タンチョウ/ナベヅル).
- **L3-17** (sat 2.35, fail=B) — search_area: Combine 'temple' and 'tofu' filters; add 精進料理 and 湯豆腐 as searchable categories.
- **L3-22** (sat 2.35, fail=B) — search_area: Index named yokocho explicitly; cross-reference izakaya/nightlife tags.
- **L1-16** (sat 2.45, fail=A) — search_area: Add explicit name-match for famous landmarks ('那智の滝', '那智滝') and de-prioritise unrelated kanji-substring matches.
