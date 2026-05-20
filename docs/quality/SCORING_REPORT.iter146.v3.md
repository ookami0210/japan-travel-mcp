# Tourism Agent Evaluation Scorecard — iter146 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 42/100 = **42.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 81/100 = **81.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.56 | 1 | 2 | 17 | 26 | 28 | 26 |
| groundedness | 4.47 | 2 | 0 | 0 | 3 | 37 | 58 |
| factual_accuracy | 4.34 | 2 | 0 | 0 | 8 | 40 | 50 |
| practical_usefulness | 3.15 | 1 | 3 | 25 | 33 | 27 | 11 |
| constraint_handling | 3.00 | 1 | 6 | 27 | 35 | 20 | 11 |
| travel_feasibility | 3.59 | 2 | 1 | 1 | 33 | 58 | 5 |
| specificity | 3.49 | 2 | 0 | 12 | 39 | 27 | 20 |
| expression_quality | 3.15 | 0 | 1 | 13 | 56 | 30 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 6 | 83.3% | 83.3% | 0.0% | 4.21 |
| get_hotels | 13 | 53.8% | 84.6% | 0.0% | 3.87 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.19 |
| get_local_food | 8 | 37.5% | 75.0% | 0.0% | 3.53 |
| get_local_specialty | 5 | 20.0% | 60.0% | 0.0% | 3.27 |
| get_spots | 32 | 43.8% | 87.5% | 0.0% | 3.67 |
| get_traditional_arts | 1 | 100.0% | 100.0% | 0.0% | 4.12 |
| get_transport | 8 | 0.0% | 62.5% | 0.0% | 3.03 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.12 |
| search_area | 7 | 57.1% | 100.0% | 0.0% | 3.80 |
| search_hybrid | 15 | 26.7% | 73.3% | 0.0% | 3.37 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 13 | 13.0% |
| B | Ranking Failure (buried below noise) | 17 | 17.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 5 | 5.0% |
| F | Constraint Failure (ignored explicit constraints) | 27 | 27.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 27 | 27.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.05, fail=A) — plan_feasibility_check: Make plan_feasibility_check accept simple stop names + nights; resolve to qid internally and return impossibility verdic
- **R420-077** (sat 0.60, fail=A) — get_spots: Recognize 'Nikko' as municipality and map to Tochigi (prefecture_code 09); add fallback advisory when prefecture arg unr
- **R420-058** (sat 1.85, fail=B) — search_hybrid: BM25 tokenizer should not split 宮島 such that it matches 宮城 / 宮古; force phrase-match for known toponyms or boost prefectu
- **R420-032** (sat 2.45, fail=A) — search_hybrid: Fix scraper to extract real page title (not site-wide breadcrumb); add accessibility-specific kind tag; route バリアフリー que
- **R420-038** (sat 2.45, fail=A) — get_local_food: Add MAFF GI sake registry; fix scraper category misclassification (don't tag 花見 articles as regional_dish); add UNESCO 2
- **R420-046** (sat 2.45, fail=A) — search_hybrid: Add accessibility extractor pass for major shrines; merge OSM wheelchair=* tags; surface official accessibility PDF when
- **R420-062** (sat 2.50, fail=A) — get_transport: Ensure 足立美術館 (Q1145085 or equivalent) is in the prefecture hub list for Shimane; pre-promote any spot of nationally-reco
- **R420-056** (sat 2.60, fail=F) — get_festivals: get_festivals intent classifier should detect 'sakura' as a separate kind and require sakura-tagged spots; off-season sa
- **R420-094** (sat 2.60, fail=B) — search_hybrid: Fire canonical_kansai_sakura_spots cluster on search_hybrid when q contains 桜/sakura/벚꽃 + 京都. Currently appears only on 
- **R420-024** (sat 2.75, fail=A) — get_local_specialty: Add scraped_local_food / brand-pork ingestion (鹿児島黒豚 / 米沢牛 / 神戸ビーフ / 松阪牛) to fill GI-registry gaps; gate see_also by top
