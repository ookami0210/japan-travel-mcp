# Tourism Agent Evaluation Scorecard — iter148 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 46/100 = **46.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 80/100 = **80.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.68 | 0 | 2 | 16 | 22 | 32 | 28 |
| groundedness | 4.46 | 0 | 0 | 1 | 7 | 37 | 55 |
| factual_accuracy | 4.27 | 0 | 0 | 2 | 9 | 49 | 40 |
| practical_usefulness | 3.26 | 0 | 3 | 22 | 29 | 38 | 8 |
| constraint_handling | 3.14 | 0 | 4 | 29 | 24 | 35 | 8 |
| travel_feasibility | 3.88 | 0 | 1 | 4 | 21 | 54 | 20 |
| specificity | 3.58 | 0 | 0 | 15 | 31 | 35 | 19 |
| expression_quality | 3.16 | 0 | 0 | 11 | 63 | 25 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.12 |
| get_hotels | 13 | 53.8% | 76.9% | 0.0% | 3.80 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.88 |
| get_local_food | 8 | 50.0% | 75.0% | 0.0% | 3.52 |
| get_local_specialty | 5 | 40.0% | 80.0% | 0.0% | 3.65 |
| get_spots | 32 | 43.8% | 84.4% | 0.0% | 3.70 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.50 |
| get_transport | 8 | 0.0% | 50.0% | 0.0% | 3.03 |
| plan_feasibility_check | 1 | 0.0% | 100.0% | 0.0% | 3.00 |
| search_area | 7 | 71.4% | 100.0% | 0.0% | 4.04 |
| search_hybrid | 15 | 46.7% | 80.0% | 0.0% | 3.67 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 16 | 16.0% |
| B | Ranking Failure (buried below noise) | 11 | 11.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 23 | 23.0% |
| G | Coverage Failure (too few options) | 6 | 6.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 37 | 37.0% |

## Top improvement hints (sample of worst 10)

- **R420-038** (sat 2.10, fail=A) — get_local_food: Make get_local_food keyword filter enforce substring match in body before returning; add a curated sake-region block (Fu
- **R420-056** (sat 2.10, fail=F) — get_festivals: Detect month + sakura constraint and route to a canonical_off_season_sakura cluster; add 'fuyuzakura' / 'jugatsuzakura' 
- **R420-002** (sat 2.35, fail=H) — get_spots: Detect 'tropical / palm / 南国' + Hokkaido conflict and emit a climate_constraint_advisory block recommending Okinawa/Amam
- **R420-077** (sat 2.35, fail=C) — get_spots: Add seasonal-feasibility advisory block to get_spots when query tokens contradict prefecture climate (5月紅葉 → return 'phy
- **R420-024** (sat 2.40, fail=A) — get_local_specialty: Maintain a branded_local_meat layer (non-GI but provincially branded) covering 鹿児島黒豚, 松阪牛, 神戸ビーフ, 米沢牛 etc. via 都道府県畜産協会 
- **R420-058** (sat 2.40, fail=B) — search_hybrid: Apply prefecture filter when prefecture_code can be inferred from toponym. Add canonical_miyajima_ryokan / Miyajima-even
- **R420-032** (sat 2.60, fail=A) — search_hybrid: Scrape 姫路城公式 'バリアフリー対応' page and tag with wheelchair=yes/limited; add a barrier-free canonical block for major UNESCO si
- **R420-097** (sat 2.65, fail=A) — get_hotels: Add municipality-level hotel filter and ingest 嬉野温泉旅館組合 official member list; canonical_saga_onsen_ryokan cluster keyed 
- **R420-068** (sat 2.70, fail=B) — get_hotels: Add canonical_luxury_ryokan cluster for Hokkaido (mirror the Kyoto pattern shown in R420-074). Sort by lodging_type=onse
- **R420-021** (sat 2.75, fail=A) — get_spots: Add なばなの里 (Q11608438 already referenced in Aichi canonical) as a Mie canonical entity with illumination_period field + o
