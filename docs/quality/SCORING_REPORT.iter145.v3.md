# Tourism Agent Evaluation Scorecard — iter145 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 36/100 = **36.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 76/100 = **76.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.55 | 0 | 3 | 15 | 29 | 30 | 23 |
| groundedness | 4.26 | 1 | 1 | 0 | 8 | 49 | 41 |
| factual_accuracy | 4.08 | 2 | 0 | 1 | 13 | 53 | 31 |
| practical_usefulness | 3.03 | 2 | 3 | 23 | 37 | 32 | 3 |
| constraint_handling | 2.78 | 1 | 7 | 35 | 30 | 24 | 3 |
| travel_feasibility | 3.67 | 2 | 0 | 10 | 18 | 57 | 13 |
| specificity | 3.36 | 2 | 0 | 18 | 34 | 32 | 14 |
| expression_quality | 3.14 | 0 | 1 | 11 | 62 | 25 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_entity_full | 1 | 0.0% | 100.0% | 0.0% | 3.75 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.19 |
| get_hotels | 13 | 38.5% | 69.2% | 0.0% | 3.64 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.81 |
| get_local_food | 8 | 37.5% | 62.5% | 0.0% | 3.36 |
| get_local_specialty | 5 | 60.0% | 60.0% | 0.0% | 3.52 |
| get_spots | 32 | 37.5% | 93.8% | 0.0% | 3.62 |
| get_traditional_arts | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_transport | 8 | 0.0% | 25.0% | 0.0% | 2.84 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.25 |
| search_area | 7 | 42.9% | 85.7% | 0.0% | 3.46 |
| search_hybrid | 15 | 20.0% | 73.3% | 0.0% | 3.30 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 16 | 16.0% |
| B | Ranking Failure (buried below noise) | 14 | 14.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 6 | 6.0% |
| F | Constraint Failure (ignored explicit constraints) | 25 | 25.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 28 | 28.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.30, fail=A) — plan_feasibility_check: Accept both {stops:[strings]} and {itinerary:[{qid}]} shapes in plan_feasibility_check; on schema mismatch, fall back to
- **R420-077** (sat 0.45, fail=A) — get_spots: Add seasonal-validity check: if q mentions 紅葉+5月, emit advisory note explaining koyo season + suggest 新緑 alternatives.
- **R420-091** (sat 1.85, fail=D) — search_area: Add prefecture-name validation: if q contains prefecture-suffix toponym not matching 47-list, emit advisory '<name> is n
- **R420-056** (sat 2.00, fail=C) — get_festivals: Detect '10月 桜' / off-season intent and respond with a negative-constraint note plus 十月桜 exception spots (Obara in Aichi 
- **R420-099** (sat 2.15, fail=E) — get_local_food: Add yatai/屋台 venue type to local_food schema; ingest Fukuoka City yatai official directory; surface price_band where kno
- **R420-032** (sat 2.35, fail=A) — search_hybrid: Filter out municipal nav-chrome titles (くらし・手続きトップ) from search snippets; use h1/h2 inner text instead.
- **R420-038** (sat 2.35, fail=A) — get_local_food: Tighten keyword='日本酒' filter in get_local_food so non-sake regional cuisine pages are not surfaced; backfill sake brewer
- **R420-058** (sat 2.35, fail=B) — search_hybrid: Boost prefecture/toponym match when q contains a strong place name; demote unrelated 'ロマン' substring matches; chain get_
- **R420-024** (sat 2.40, fail=A) — get_local_specialty: Add 地域団体商標 / 銘柄豚 (brand-pork) registry as a complementary source to MAFF GI; suppress see_also wikidata_venues when cate
- **R420-094** (sat 2.40, fail=B) — search_hybrid: Demote 'romantic' substring matches when q has Kyoto+sakura; surface canonical_kansai_sakura_spots; generate ko descript
