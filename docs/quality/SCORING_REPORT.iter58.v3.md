# Tourism Agent Evaluation Scorecard — iter58 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 24/100 = **24.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 63/100 = **63.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 2/100 = **2.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.04 | 0 | 5 | 28 | 35 | 22 | 10 |
| groundedness | 4.07 | 0 | 0 | 4 | 14 | 53 | 29 |
| factual_accuracy | 3.99 | 0 | 0 | 5 | 15 | 56 | 24 |
| practical_usefulness | 2.61 | 0 | 15 | 30 | 34 | 21 | 0 |
| constraint_handling | 2.36 | 0 | 24 | 35 | 22 | 19 | 0 |
| travel_feasibility | 3.52 | 0 | 2 | 6 | 30 | 62 | 0 |
| specificity | 3.11 | 0 | 1 | 20 | 46 | 33 | 0 |
| expression_quality | 3.11 | 0 | 1 | 20 | 46 | 33 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 0.0% | 50.0% | 0.0% | 3.05 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.92 |
| get_japan_heritage | 11 | 9.1% | 72.7% | 0.0% | 3.24 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.65 |
| get_local_specialty | 10 | 60.0% | 90.0% | 0.0% | 3.66 |
| get_spots | 15 | 0.0% | 40.0% | 6.7% | 2.95 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.28 |
| search_area | 40 | 35.0% | 62.5% | 2.5% | 3.23 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 19 | 19.0% |
| B | Ranking Failure (buried below noise) | 23 | 23.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 27 | 27.0% |
| G | Coverage Failure (too few options) | 5 | 5.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 21 | 21.0% |

## Top improvement hints (sample of worst 10)

- **L2-21** (sat 1.50, fail=B) — search_area: Fix heritage_class_match scoring; require kind/keyword overlap before falling back to heritage class.
- **L3-07** (sat 1.60, fail=H) — search_area: Add intent guard: queries with no real corpus match should return empty + caveat, not irrelevant nav-chrome. Aurora ≠ Ja
- **L3-30** (sat 1.60, fail=B) — search_area: Filter out boilerplate/nav-chrome scraped pages; add rail-line and frequency metadata to spots; tag rural rail villages
- **L3-12** (sat 1.85, fail=A) — search_area: Add dolphin-watching/swimming activity tagging for islands like Mikurashima, Ogasawara. Distinguish wild encounter vs aq
- **L3-17** (sat 1.85, fail=A) — search_area: Add shukubo/shojin-ryori tagging. Differentiate tofu-as-product vs tofu-experience-at-temple. Indonesian translations mi
- **L3-25** (sat 1.85, fail=A) — search_area: Need semantic disambiguation: 鶴 (crane bird) vs 鶴 (place name). Add wildlife-viewing tag for Izumi tancho/manazuru and K
- **L3-03** (sat 2.10, fail=A) — get_festivals: Add modern snow festival data (Sapporo Yuki Matsuri etc.) - heritage-only data misses major tourism events. Filter scope
- **L3-16** (sat 2.10, fail=F) — search_area: Need geo-distance constraint handler ('from Tokyo' implies <300km radius). Volcano queries should integrate JMA volcano 
- **L3-22** (sat 2.10, fail=A) — search_area: Add dedicated yokocho/nightlife district tagging. Pure substring matching pulls in irrelevant cultural property names.
- **L3-26** (sat 2.10, fail=B) — search_area: Add a shukubo-specific tag/index; filter Wikidata results by lodging/temple-with-accommodation classes; demote heritage_
