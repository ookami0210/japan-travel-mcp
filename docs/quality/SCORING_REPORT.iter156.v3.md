# Tourism Agent Evaluation Scorecard — iter156 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 56/100 = **56.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 92/100 = **92.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.89 | 0 | 0 | 9 | 28 | 28 | 35 |
| groundedness | 4.72 | 0 | 0 | 0 | 2 | 24 | 74 |
| factual_accuracy | 4.57 | 0 | 0 | 0 | 3 | 37 | 60 |
| practical_usefulness | 3.54 | 0 | 0 | 15 | 30 | 41 | 14 |
| constraint_handling | 3.37 | 0 | 2 | 20 | 25 | 45 | 8 |
| travel_feasibility | 4.13 | 0 | 0 | 1 | 14 | 56 | 29 |
| specificity | 3.76 | 0 | 0 | 7 | 34 | 35 | 24 |
| expression_quality | 3.35 | 0 | 0 | 5 | 55 | 40 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.00 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 6 | 83.3% | 100.0% | 0.0% | 4.35 |
| get_hotels | 13 | 46.2% | 92.3% | 0.0% | 3.84 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.75 |
| get_local_food | 8 | 37.5% | 87.5% | 0.0% | 3.59 |
| get_local_specialty | 5 | 80.0% | 100.0% | 0.0% | 4.17 |
| get_spots | 32 | 53.1% | 90.6% | 0.0% | 3.84 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 8 | 50.0% | 75.0% | 0.0% | 3.98 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.75 |
| search_area | 7 | 71.4% | 100.0% | 0.0% | 4.05 |
| search_hybrid | 15 | 60.0% | 93.3% | 0.0% | 3.99 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 10 | 10.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 14 | 14.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 52 | 52.0% |

## Top improvement hints (sample of worst 10)

- **R420-038** (sat 2.35, fail=A) — get_local_food: Query is about Fushimi sake brewing but items are entirely 桜の穴場 + 西京パン articles, not sake-specific. The Fushimi 三大酒どころ +
- **R420-031** (sat 2.40, fail=A) — search_hybrid: ジブリパーク is the headline Aichi Ghibli answer but is buried as result #1 with weak description; canonical_anime_pilgrimage 
- **R420-034** (sat 2.50, fail=A) — get_transport: Query is multi-prefecture rail-route (Fukuoka↔Beppu↔Nagasaki) but response is Fukuoka-only hub list with no inter-prefec
- **R420-027** (sat 2.75, fail=F) — get_hotels: Add canonical_budget_hostels / guesthouses block for backpacker queries; current response returns expensive 秘湯 ryokan an
- **R420-065** (sat 2.75, fail=F) — get_spots: Add canonical_sapporo_indoor cluster + suppress lavender cluster when municipality='札幌' and intent indicates rain/indoor
- **R420-002** (sat 2.85, fail=F) — get_spots: Add a climate_infeasibility_note for tropical-beach queries to Hokkaido; redirect to Okinawa palm-beach canonical or exp
- **R420-077** (sat 2.85, fail=F) — get_spots: May koyo does not exist; tool should surface a temporal-impossibility note and pivot to fresh-green/shinryoku alternativ
- **R420-097** (sat 2.85, fail=A) — get_hotels: Returned Imari/Sagayamato/Wataya-besso etc; Ureshino-onsen ryokan (e.g. 大正屋, 萬象閉) missing despite being the specific tow
- **R420-006** (sat 2.95, fail=A) — get_dmo: Typhoon-aftermath queries need a disruption_advisory pointer (DMO contact + JMA / road-closure pages); raw DMO list does
- **R420-062** (sat 3.00, fail=A) — get_transport: Add Adachi Museum to Shimane wikidata curated hubs; add canonical_last_mile_transport for Yasugi→足立美術館 free shuttle bus.
