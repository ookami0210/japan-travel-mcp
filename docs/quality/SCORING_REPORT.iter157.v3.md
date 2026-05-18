# Tourism Agent Evaluation Scorecard — iter157 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 57/100 = **57.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 91/100 = **91.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.89 | 0 | 1 | 4 | 30 | 35 | 30 |
| groundedness | 4.69 | 0 | 0 | 0 | 2 | 27 | 71 |
| factual_accuracy | 4.59 | 0 | 0 | 0 | 5 | 31 | 64 |
| practical_usefulness | 3.65 | 0 | 1 | 11 | 32 | 34 | 22 |
| constraint_handling | 3.51 | 0 | 2 | 19 | 23 | 38 | 18 |
| travel_feasibility | 4.27 | 0 | 0 | 1 | 14 | 42 | 43 |
| specificity | 3.84 | 0 | 0 | 6 | 32 | 34 | 28 |
| expression_quality | 3.22 | 0 | 0 | 13 | 53 | 33 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.88 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.38 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.21 |
| get_hotels | 13 | 53.8% | 76.9% | 0.0% | 3.83 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.75 |
| get_local_food | 8 | 62.5% | 100.0% | 0.0% | 3.95 |
| get_local_specialty | 5 | 80.0% | 100.0% | 0.0% | 4.25 |
| get_spots | 32 | 46.9% | 96.9% | 0.0% | 3.84 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 4.00 |
| get_transport | 8 | 75.0% | 87.5% | 0.0% | 4.30 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.88 |
| search_area | 7 | 57.1% | 100.0% | 0.0% | 4.07 |
| search_hybrid | 15 | 53.3% | 86.7% | 0.0% | 3.90 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 8 | 8.0% |
| B | Ranking Failure (buried below noise) | 17 | 17.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 15 | 15.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 51 | 51.0% |

## Top improvement hints (sample of worst 10)

- **R420-056** (sat 2.15, fail=F) — get_festivals: Add canonical_offseason_sakura block listing late-autumn/winter-blooming cultivars and their famous sites; gate get_fest
- **R420-031** (sat 2.35, fail=B) — search_hybrid: Add a canonical_ghibli_locations block (ジブリパーク + Tonari-no-Totoro Sayama hills + Spirited Away Dōgo + Howl's reference s
- **R420-011** (sat 2.70, fail=A) — get_hotels: Fire canonical_accessible_hotels when query contains 'wheelchair/accessible/step-free/バリアフリー'; ingest a curated Hakone a
- **R420-034** (sat 2.80, fail=C) — get_transport: Add a region_rail_route block when query mentions a multi-city route (Fukuoka↔Beppu↔Nagasaki, 北九州 pass etc.) summarizing
- **R420-006** (sat 2.85, fail=A) — get_dmo: Add a 'realtime_advisory_pointer' block for weather/disaster queries pointing to JMA, NEXCO, prefecture road-info, and l
- **R420-027** (sat 2.85, fail=F) — get_hotels: Materialize the canonical_budget_lodging block when hotel_type='budget'/'hostel' OR query keywords match (5000円, 安い, hos
- **R420-077** (sat 2.85, fail=F) — get_spots: Add seasonal_sanity_check advisory when koyo/sakura query month is far from valid window.
- **R420-046** (sat 3.00, fail=A) — search_hybrid: Extend canonical_accessible_destinations with Nikko (Toshogu + 二荒山 + 輪王寺) — currently the block is a fixed 7-entry list 
- **R420-097** (sat 3.00, fail=G) — get_hotels: Filter by municipality 嬉野市 when query names a specific onsen town; add 日本三大美肌の湯 designation flag.
- **R420-008** (sat 3.05, fail=C) — get_spots: Fix municipality stamping on niigata-kankou scrape items; verify the spot's actual municipality from its URL/coords rath
