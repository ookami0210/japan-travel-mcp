# Tourism Agent Evaluation Scorecard — iter147 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 47/100 = **47.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 79/100 = **79.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.57 | 0 | 3 | 18 | 23 | 31 | 25 |
| groundedness | 4.52 | 2 | 0 | 0 | 3 | 32 | 63 |
| factual_accuracy | 4.27 | 2 | 0 | 0 | 9 | 45 | 44 |
| practical_usefulness | 3.22 | 0 | 4 | 22 | 32 | 32 | 10 |
| constraint_handling | 2.98 | 0 | 9 | 27 | 29 | 27 | 8 |
| travel_feasibility | 3.82 | 0 | 2 | 4 | 26 | 46 | 22 |
| specificity | 3.50 | 1 | 1 | 15 | 32 | 32 | 19 |
| expression_quality | 3.12 | 0 | 0 | 17 | 55 | 27 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.75 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.23 |
| get_hotels | 13 | 53.8% | 84.6% | 0.0% | 3.80 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 4.00 |
| get_local_food | 8 | 50.0% | 87.5% | 0.0% | 3.55 |
| get_local_specialty | 5 | 60.0% | 80.0% | 0.0% | 3.88 |
| get_spots | 32 | 50.0% | 84.4% | 0.0% | 3.62 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_transport | 8 | 0.0% | 37.5% | 0.0% | 2.91 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.75 |
| search_area | 7 | 42.9% | 100.0% | 0.0% | 3.79 |
| search_hybrid | 15 | 46.7% | 73.3% | 0.0% | 3.62 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 23 | 23.0% |
| B | Ranking Failure (buried below noise) | 11 | 11.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 25 | 25.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 31 | 31.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.60, fail=E) — plan_feasibility_check: Accept stops[] as a legacy alias for itinerary[] OR auto-resolve stop names to qids and stub minutes; otherwise the agen
- **R420-077** (sat 0.70, fail=A) — get_spots: Detect city-as-prefecture and fall back to Tochigi; add a 'season_mismatch' advisory for koyo+May queries pointing to al
- **R420-058** (sat 1.90, fail=B) — search_hybrid: For Hiroshima/Miyajima romantic queries, anchor on canonical Miyajima ryokan cluster + Itsukushima sunset spot; constrai
- **R420-034** (sat 2.25, fail=C) — get_transport: Add a plan_feasibility or transport_route tool that returns multi-city rail chain for JR Kyushu Pass holders.
- **R420-024** (sat 2.40, fail=A) — get_local_specialty: Add a canonical_branded_livestock layer (鹿児島黒豚, 松阪牛, 米沢牛, 比内地鶏) hoisted when q matches a branded animal name; MAFF GI al
- **R420-032** (sat 2.45, fail=A) — search_hybrid: Strip nav-chrome titles; extract h1/og:title; index OSM wheelchair=* tags for Himeji-jo.
- **R420-038** (sat 2.45, fail=C) — get_local_food: Restrict get_local_food keyword match to entity-level GI/酒 records; route 日本酒 brewery queries to a dedicated sake_brewer
- **R420-056** (sat 2.45, fail=F) — get_festivals: Add a canonical 'autumn-blooming sakura' cluster (十月桜 / 子福桜 / 冬桜 sites: 桜山公園 群馬, 小原 愛知) and intent-route get_festivals 1
- **R420-042** (sat 2.70, fail=F) — get_spots: Add waterfall (waterfall kind) cluster for Miyazaki; suppress preservation-districts when query has '폭포/滝/waterfall' int
- **R420-068** (sat 2.70, fail=F) — get_hotels: Add canonical_luxury_ryokan block for Hokkaido (Zaborin, Aman Niseko, 雪ニセコ, 鶴雅 luxury onsen group); filter get_hotels by
