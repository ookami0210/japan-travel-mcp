# Tourism Agent Evaluation Scorecard — iter139 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 34/100 = **34.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 71/100 = **71.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.34 | 0 | 6 | 22 | 19 | 38 | 15 |
| groundedness | 4.31 | 2 | 0 | 2 | 7 | 39 | 50 |
| factual_accuracy | 4.14 | 2 | 0 | 3 | 7 | 53 | 35 |
| practical_usefulness | 2.85 | 2 | 6 | 28 | 35 | 27 | 2 |
| constraint_handling | 2.77 | 0 | 10 | 35 | 26 | 26 | 3 |
| travel_feasibility | 3.61 | 2 | 1 | 4 | 28 | 57 | 8 |
| specificity | 3.31 | 2 | 2 | 18 | 30 | 37 | 11 |
| expression_quality | 3.14 | 0 | 0 | 15 | 56 | 29 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_entity_full | 1 | 0.0% | 0.0% | 0.0% | 0.50 |
| get_festivals | 6 | 33.3% | 50.0% | 0.0% | 3.25 |
| get_hotels | 13 | 38.5% | 61.5% | 0.0% | 3.38 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.88 |
| get_local_food | 8 | 50.0% | 87.5% | 0.0% | 3.50 |
| get_local_specialty | 5 | 60.0% | 80.0% | 0.0% | 3.88 |
| get_spots | 32 | 37.5% | 93.8% | 0.0% | 3.69 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 4.00 |
| get_transport | 8 | 0.0% | 12.5% | 12.5% | 2.98 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 2.00 |
| search_area | 7 | 42.9% | 85.7% | 0.0% | 3.66 |
| search_hybrid | 15 | 26.7% | 53.3% | 0.0% | 3.17 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 20 | 20.0% |
| B | Ranking Failure (buried below noise) | 16 | 16.0% |
| C | Reasoning Failure (synthesised wrong) | 7 | 7.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 21 | 21.0% |
| G | Coverage Failure (too few options) | 5 | 5.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 29 | 29.0% |

## Top improvement hints (sample of worst 10)

- **R420-037** (sat 0.35, fail=A) — get_entity_full: Backfill missing UNESCO WHS QIDs into wikidata corpus; add fuzzy QID→name fallback that auto-pivots to search_area.
- **R420-077** (sat 0.35, fail=A) — get_spots: Reject invalid prefecture names ('Nikko' → Tochigi) and add a seasonal-impossibility advisory cluster for off-season koy
- **R420-058** (sat 1.60, fail=B) — search_hybrid: Add toponym hard-filter when q contains a known landmark name (宮島).
- **R420-035** (sat 1.70, fail=A) — get_festivals: Add Awa Odori canonical cluster for Tokushima; integrate with Wikidata Q800118-class events.
- **R420-025** (sat 2.15, fail=A) — plan_feasibility_check: Accept 'stops' alias or string place names; or have agent retry with itinerary=[{qid,minutes}] format.
- **R420-074** (sat 2.20, fail=B) — get_hotels: Tag luxury_band + onsen_in_room; route honeymoon/허니문 queries to ryokan with rotenburo amenity.
- **R420-018** (sat 2.25, fail=F) — get_hotels: Hakone needs dedicated municipality filter + luxury_ryokan type; current Kanagawa response is dominated by Yokohama apar
- **R420-038** (sat 2.35, fail=C) — get_local_food: keyword filter for sake should restrict to sake-related entries; integrate with get_local_specialty MAFF GI search.
- **R420-056** (sat 2.35, fail=F) — get_festivals: Intent-classify '桜' + '10月' → fuyu/jugatsu sakura kind tag; route to spots not festivals.
- **R420-086** (sat 2.35, fail=F) — search_hybrid: Build a halal-certified venue cluster (JHC, Nippon Asia Halal) keyed by city; emit Arabic descriptions when lang=ar.
