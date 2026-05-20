# Tourism Agent Evaluation Scorecard — iter141 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 24/100 = **24.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 70/100 = **70.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.26 | 0 | 4 | 21 | 29 | 37 | 9 |
| groundedness | 4.19 | 1 | 1 | 1 | 8 | 53 | 36 |
| factual_accuracy | 3.99 | 1 | 1 | 0 | 19 | 54 | 25 |
| practical_usefulness | 2.84 | 1 | 6 | 26 | 45 | 19 | 3 |
| constraint_handling | 2.74 | 0 | 12 | 29 | 34 | 23 | 2 |
| travel_feasibility | 3.64 | 1 | 1 | 6 | 27 | 55 | 10 |
| specificity | 3.04 | 1 | 3 | 22 | 42 | 29 | 3 |
| expression_quality | 3.08 | 0 | 2 | 14 | 58 | 26 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.50 |
| get_entity_full | 1 | 0.0% | 0.0% | 0.0% | 0.38 |
| get_festivals | 6 | 16.7% | 50.0% | 0.0% | 3.19 |
| get_hotels | 13 | 30.8% | 61.5% | 0.0% | 3.29 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.94 |
| get_local_food | 8 | 25.0% | 62.5% | 0.0% | 3.33 |
| get_local_specialty | 5 | 60.0% | 80.0% | 0.0% | 3.73 |
| get_spots | 32 | 28.1% | 84.4% | 0.0% | 3.53 |
| get_traditional_arts | 1 | 0.0% | 0.0% | 0.0% | 2.88 |
| get_transport | 8 | 12.5% | 37.5% | 0.0% | 3.00 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 1.12 |
| search_area | 7 | 14.3% | 100.0% | 0.0% | 3.70 |
| search_hybrid | 15 | 13.3% | 73.3% | 0.0% | 3.33 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 22 | 22.0% |
| B | Ranking Failure (buried below noise) | 22 | 22.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 3 | 3.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 26 | 26.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 18 | 18.0% |

## Top improvement hints (sample of worst 10)

- **R420-037** (sat 0.30, fail=A) — get_entity_full: Ingest Q5854 + other canonical UNESCO WHS QIDs into attractions corpus or auto-fallback to search_area + return preview.
- **R420-025** (sat 1.05, fail=A) — plan_feasibility_check: Accept string stops + resolve via search_area→qid internally; return travel_feasibility=infeasible verdict with reasonin
- **R420-018** (sat 1.80, fail=B) — get_hotels: Filter by municipality=Hakone-machi when town specified; add canonical_hakone_luxury_ryokan cluster.
- **R420-058** (sat 1.90, fail=B) — search_hybrid: Prefer toponym-anchored filtering when query contains a strong place name (宮島/Miyajima)
- **R420-077** (sat 1.95, fail=A) — get_spots: When query mentions impossible season-feature combo, return seasonal_mismatch_advisory + fallback fresh-green / alpine f
- **R420-056** (sat 2.25, fail=F) — get_festivals: Route 桜 queries to canonical sakura clusters; add autumn-blooming cultivar entries (四季桜/十月桜)
- **R420-024** (sat 2.35, fail=A) — get_local_specialty: When count=0 in get_local_specialty, fall back to Wikidata/Wikipedia abstract for the queried keyword; suppress museum s
- **R420-038** (sat 2.35, fail=B) — get_local_food: Keyword 日本酒 should route to MAFF GI sake list + 酒蔵 entity index, not 桜 guides.
- **R420-080** (sat 2.40, fail=A) — get_transport: get_transport with a famous spot name in q should pivot to entity_full + transport_to_spot mode, not prefecture overview
- **R420-097** (sat 2.40, fail=A) — get_hotels: Filter by municipality 嬉野市 when keyword present; surface 日本三大美肌の湯 tag for matching context
