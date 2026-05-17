# Tourism Agent Evaluation Scorecard — iter140 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 37/100 = **37.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 70/100 = **70.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.39 | 0 | 4 | 22 | 24 | 31 | 19 |
| groundedness | 4.31 | 1 | 1 | 1 | 6 | 45 | 46 |
| factual_accuracy | 4.14 | 2 | 1 | 0 | 11 | 50 | 36 |
| practical_usefulness | 2.95 | 1 | 8 | 26 | 31 | 28 | 6 |
| constraint_handling | 2.82 | 0 | 12 | 31 | 27 | 23 | 7 |
| travel_feasibility | 3.48 | 1 | 3 | 8 | 30 | 51 | 7 |
| specificity | 3.22 | 2 | 2 | 20 | 35 | 30 | 11 |
| expression_quality | 3.04 | 0 | 1 | 23 | 47 | 29 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.38 |
| get_entity_full | 1 | 0.0% | 0.0% | 0.0% | 0.38 |
| get_festivals | 6 | 16.7% | 50.0% | 0.0% | 3.19 |
| get_hotels | 13 | 30.8% | 61.5% | 0.0% | 3.34 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.19 |
| get_local_food | 8 | 50.0% | 62.5% | 0.0% | 3.42 |
| get_local_specialty | 5 | 60.0% | 80.0% | 0.0% | 3.83 |
| get_spots | 32 | 40.6% | 87.5% | 0.0% | 3.63 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_transport | 8 | 12.5% | 37.5% | 0.0% | 3.03 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 1.12 |
| search_area | 7 | 57.1% | 100.0% | 0.0% | 3.73 |
| search_hybrid | 15 | 33.3% | 60.0% | 0.0% | 3.35 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 18 | 18.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 26 | 26.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 25 | 25.0% |

## Top improvement hints (sample of worst 10)

- **R420-037** (sat 0.30, fail=A) — get_entity_full: Backfill Q5854 + all top-tier UNESCO WHS qids; verify wikidata_attractions master coverage of famous landmarks.
- **R420-077** (sat 0.80, fail=A) — get_spots: Add seasonality sanity advisory when query month conflicts with kind season; accept city='Nikko' by normalizing to Tochi
- **R420-025** (sat 1.05, fail=A) — plan_feasibility_check: Accept toponym strings in 'stops' as a convenience and resolve to QIDs internally; emit clear infeasibility verdict
- **R420-018** (sat 1.95, fail=B) — get_hotels: Default get_hotels to lodging_type ∈ {ryokan, hotel, shukubo}; municipality scope when query names town
- **R420-035** (sat 2.05, fail=A) — get_festivals: Add Awa Odori to canonical_festivals fallback for Tokushima; festival corpus needs marquee matsuri.
- **R420-024** (sat 2.15, fail=A) — get_local_specialty: Verify ingestion of MAFF GI registration 41; relax q='黒豚' matching to include name_ja substring before fallback
- **R420-011** (sat 2.20, fail=B) — get_hotels: Filter lodging_type ∈ {ryokan, hotel}; honor implicit municipality in query; expose OSM wheelchair=yes tag
- **R420-038** (sat 2.35, fail=B) — get_local_food: Restrict get_local_food keyword='日本酒' to entries with sake/brewery in canonical fields.
- **R420-058** (sat 2.35, fail=B) — search_hybrid: When toponym (宮島) is in q, hard-filter results to that municipality / Wikidata coord radius before fusing BM25+vec.
- **R420-094** (sat 2.35, fail=B) — search_hybrid: Trigger canonical_kansai_sakura on Kyoto+桜 query; suppress ロマンチック substring noise
