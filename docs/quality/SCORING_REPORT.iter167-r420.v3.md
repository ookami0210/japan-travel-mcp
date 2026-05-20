# Tourism Agent Evaluation Scorecard — iter167-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 235/420 = **56.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 403/420 = **96.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.01 | 0 | 0 | 11 | 105 | 174 | 130 |
| groundedness | 4.54 | 0 | 0 | 0 | 16 | 162 | 242 |
| factual_accuracy | 4.54 | 0 | 0 | 1 | 16 | 160 | 243 |
| practical_usefulness | 3.76 | 0 | 0 | 21 | 145 | 168 | 86 |
| constraint_handling | 3.56 | 0 | 2 | 50 | 135 | 177 | 56 |
| travel_feasibility | 4.32 | 0 | 0 | 1 | 28 | 227 | 164 |
| specificity | 3.84 | 0 | 0 | 12 | 142 | 168 | 98 |
| expression_quality | 3.38 | 0 | 0 | 37 | 202 | 165 | 16 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 80.0% | 100.0% | 0.0% | 4.25 |
| get_hotels | 56 | 50.0% | 92.9% | 0.0% | 3.78 |
| get_japan_heritage | 9 | 66.7% | 88.9% | 0.0% | 4.12 |
| get_local_food | 35 | 37.1% | 97.1% | 0.0% | 3.83 |
| get_local_specialty | 22 | 68.2% | 100.0% | 0.0% | 4.07 |
| get_spots | 136 | 45.6% | 95.6% | 0.0% | 3.86 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 34 | 79.4% | 100.0% | 0.0% | 4.41 |
| plan_feasibility_check | 5 | 100.0% | 100.0% | 0.0% | 4.55 |
| search_area | 30 | 66.7% | 96.7% | 0.0% | 4.08 |
| search_hybrid | 65 | 58.5% | 93.8% | 0.0% | 4.09 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 58 | 13.8% |
| B | Ranking Failure (buried below noise) | 72 | 17.1% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 4 | 1.0% |
| E | Practicality Failure (correct but unusable) | 2 | 0.5% |
| F | Constraint Failure (ignored explicit constraints) | 70 | 16.7% |
| G | Coverage Failure (too few options) | 36 | 8.6% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 178 | 42.4% |

## Top improvement hints (sample of worst 10)

- **R-334** (sat 2.35, fail=A) — search_hybrid: Add prefecture filter when prefecture is implied in query; route 全天候/屋内 queries to get_spots with indoor filter.
- **R-066** (sat 2.35, fail=B) — get_spots: Add hard negative-filter for 詐欺 / 還付 / 届出 / お知らせ keywords; never surface admin notices as tourism spots.
- **R-350** (sat 2.40, fail=A) — get_spots: Build canonical_genkai_shuraku (limit villages) per prefecture using MLIT/MIC depopulation registry.
- **R-143** (sat 2.40, fail=A) — get_hotels: Add canonical_shodoshima_romantic block (Angel Road / Olive Park) and improve lodging coverage
- **R-092** (sat 2.45, fail=B) — get_spots: Suppress regional koyo/sakura clusters when query is family-in-specific-city; surface get_spots Kushimoto items first; h
- **R-053** (sat 2.50, fail=A) — get_japan_heritage: Detect 神宮 / 大社 / 国宝 queries in the japan_heritage tool and route to a see_also_wikidata_heritage block citing search_are
- **R-126** (sat 2.50, fail=A) — get_hotels: Add canonical_kurokawa_onsen cluster with 湯巡り手形 metadata
- **R-261** (sat 2.60, fail=A) — search_hybrid: Tighten prefecture filter or add canonical_scenic_trains_by_region with JR-Pass-covered list.
- **R-324** (sat 2.65, fail=A) — search_hybrid: Add Hiroshima canonical: Hiroshima Masjid (Funairi area) + Hiroshima University prayer room + Iwakuni mosque as alternat
- **R-080** (sat 2.65, fail=G) — get_spots: Fan out to multiple Akita municipalities; add 農泊 / グリーンツーリズム network records as canonical block.
