# Tourism Agent Evaluation Scorecard — iter138 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 22/100 = **22.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 64/100 = **64.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.20 | 0 | 7 | 25 | 24 | 29 | 15 |
| groundedness | 3.92 | 3 | 1 | 2 | 11 | 61 | 22 |
| factual_accuracy | 3.83 | 3 | 1 | 1 | 18 | 59 | 18 |
| practical_usefulness | 2.81 | 1 | 7 | 32 | 33 | 24 | 3 |
| constraint_handling | 2.66 | 0 | 16 | 26 | 36 | 20 | 2 |
| travel_feasibility | 3.44 | 1 | 4 | 3 | 38 | 50 | 4 |
| specificity | 3.00 | 1 | 4 | 27 | 35 | 28 | 5 |
| expression_quality | 2.88 | 0 | 2 | 29 | 48 | 21 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.88 |
| get_entity_full | 1 | 0.0% | 0.0% | 0.0% | 1.12 |
| get_festivals | 6 | 16.7% | 50.0% | 0.0% | 3.21 |
| get_hotels | 13 | 30.8% | 61.5% | 0.0% | 3.36 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.75 |
| get_local_food | 8 | 12.5% | 62.5% | 0.0% | 3.31 |
| get_local_specialty | 5 | 20.0% | 80.0% | 0.0% | 3.42 |
| get_spots | 32 | 18.8% | 68.8% | 0.0% | 3.16 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_transport | 8 | 0.0% | 62.5% | 0.0% | 3.06 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.38 |
| search_area | 7 | 57.1% | 85.7% | 0.0% | 3.80 |
| search_hybrid | 15 | 26.7% | 53.3% | 0.0% | 3.15 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 19 | 19.0% |
| B | Ranking Failure (buried below noise) | 21 | 21.0% |
| C | Reasoning Failure (synthesised wrong) | 4 | 4.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 25 | 25.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 19 | 19.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.30, fail=A) — plan_feasibility_check: Auto-coerce stops[] to itinerary[{qid}] when arg schema mismatches; or return a feasibility verdict text alongside the e
- **R420-041** (sat 0.70, fail=A) — get_spots: Drop q filter on fallback; ensure Wikidata canonical landmarks always returned when name matches city/q.
- **R420-043** (sat 0.70, fail=A) — get_spots: Add canonical_family_friendly cluster for Nara; relax q filter.
- **R420-037** (sat 1.05, fail=A) — get_entity_full: Verify Q5854 mapping; ingest top-100 famous UNESCO WHS QIDs into entity corpus.
- **R420-077** (sat 1.65, fail=A) — get_spots: Detect season-mismatched intent (紅葉 + 5月) and emit advisory + alternatives instead of empty result; coerce 'Nikko' → 'To
- **R420-016** (sat 1.85, fail=B) — get_hotels: Sort by lodging_type=onsen_ryokan/ryokan + price_band=high; add canonical_luxury_ryokan curated block for Kyoto
- **R420-018** (sat 1.85, fail=B) — get_hotels: Force municipality filter for 箱根 + lodging_type=ryokan; add canonical_luxury_ryokan_hakone block
- **R420-039** (sat 1.95, fail=B) — get_spots: Dedup spot_id; rerank by q_relevance × name-match instead of fixed quality_score.
- **R420-011** (sat 2.20, fail=F) — get_hotels: Filter lodging_type ∉ apartment for hotel intent; constrain by municipality=箱根町; expose accessibility metadata
- **R420-020** (sat 2.35, fail=A) — search_hybrid: Add halal_certified flag from JHA/JCB data; route ms lang via translation; surface MTC Hokkaido muslim-friendly portal
