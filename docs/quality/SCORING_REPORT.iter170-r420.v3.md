# Tourism Agent Evaluation Scorecard — iter170-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 242/420 = **57.6%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 411/420 = **97.9%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 4.03 | 0 | 0 | 7 | 113 | 160 | 140 |
| groundedness | 4.57 | 0 | 0 | 0 | 14 | 153 | 253 |
| factual_accuracy | 4.53 | 0 | 0 | 0 | 15 | 169 | 236 |
| practical_usefulness | 3.76 | 0 | 0 | 14 | 155 | 168 | 83 |
| constraint_handling | 3.57 | 0 | 0 | 48 | 152 | 152 | 68 |
| travel_feasibility | 4.11 | 0 | 0 | 0 | 67 | 239 | 114 |
| specificity | 3.84 | 0 | 0 | 18 | 137 | 160 | 105 |
| expression_quality | 3.40 | 0 | 0 | 48 | 170 | 188 | 14 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.00 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 84.0% | 100.0% | 0.0% | 4.29 |
| get_hotels | 56 | 58.9% | 98.2% | 0.0% | 3.92 |
| get_japan_heritage | 9 | 44.4% | 100.0% | 0.0% | 3.86 |
| get_local_food | 35 | 40.0% | 100.0% | 0.0% | 3.85 |
| get_local_specialty | 22 | 54.5% | 100.0% | 0.0% | 4.11 |
| get_spots | 136 | 52.9% | 97.8% | 0.0% | 3.88 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 34 | 58.8% | 100.0% | 0.0% | 4.18 |
| plan_feasibility_check | 5 | 60.0% | 100.0% | 0.0% | 4.28 |
| search_area | 30 | 63.3% | 100.0% | 0.0% | 4.00 |
| search_hybrid | 65 | 64.6% | 92.3% | 0.0% | 3.99 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 56 | 13.3% |
| B | Ranking Failure (buried below noise) | 61 | 14.5% |
| C | Reasoning Failure (synthesised wrong) | 2 | 0.5% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 0.7% |
| F | Constraint Failure (ignored explicit constraints) | 84 | 20.0% |
| G | Coverage Failure (too few options) | 36 | 8.6% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 178 | 42.4% |

## Top improvement hints (sample of worst 10)

- **R-323** (sat 2.35, fail=A) — search_hybrid: add canonical_kosher_jewish block covering Chabad Tokyo + Chabad Kyoto + kosher catering
- **R-334** (sat 2.35, fail=B) — search_hybrid: Constrain search_hybrid by prefecture when query implies one; deduplicate near-identical tourism portal pages.
- **R-073** (sat 2.40, fail=A) — get_spots: Improve beach-kind tagging for Miyazaki Wikidata + scrape 宮崎市/日向市 beach pages.
- **R-324** (sat 2.60, fail=A) — search_hybrid: add Hiroshima Masjid to canonical_prayer_rooms_mosques
- **R-220** (sat 2.60, fail=B) — search_hybrid: dedupe results + add canonical_nikko_autumn block with peak timing 10月中旬-下旬 (上層) / 11月上旬-中旬 (麓)
- **R-066** (sat 2.70, fail=B) — get_spots: Filter out 介護保険/水道/転入 admin pages from get_spots scraped_local_food results.
- **R-304** (sat 2.75, fail=A) — get_hotels: extend canonical_luxury_ryokan coverage to Fukuoka; trigger block on honeymoon/luxury intent
- **R-350** (sat 2.75, fail=A) — get_spots: Add canonical_abandoned_villages / 限界集落 block; detect 'fantôme/廃村/ghost village' intent.
- **R-166** (sat 2.85, fail=A) — get_local_food: Add Ehime citrus variety cluster (iyokan/kanpei/setoka/benimadonna/etc)
- **R-283** (sat 2.90, fail=C) — get_local_specialty: Detect '100均 / プチプラ / 安い' intent and switch to scraped low-cost retail list; suppress premium_brand_meat cluster
