# Tourism Agent Evaluation Scorecard — iter154-r420 (v3)

Cases: 404
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 160/404 = **39.6%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 337/404 = **83.4%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/404 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.55 | 0 | 4 | 55 | 143 | 119 | 83 |
| groundedness | 4.42 | 2 | 0 | 1 | 35 | 152 | 214 |
| factual_accuracy | 4.33 | 2 | 0 | 1 | 32 | 193 | 176 |
| practical_usefulness | 3.21 | 0 | 5 | 90 | 160 | 114 | 35 |
| constraint_handling | 3.23 | 0 | 3 | 103 | 146 | 104 | 48 |
| travel_feasibility | 3.90 | 2 | 0 | 5 | 108 | 203 | 86 |
| specificity | 3.48 | 0 | 4 | 50 | 155 | 137 | 58 |
| expression_quality | 3.33 | 0 | 0 | 39 | 207 | 144 | 14 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.62 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| get_festivals | 23 | 65.2% | 95.7% | 0.0% | 4.21 |
| get_hotels | 54 | 42.6% | 90.7% | 0.0% | 3.68 |
| get_japan_heritage | 9 | 77.8% | 100.0% | 0.0% | 4.25 |
| get_local_food | 35 | 22.9% | 80.0% | 0.0% | 3.49 |
| get_local_specialty | 22 | 50.0% | 81.8% | 0.0% | 3.76 |
| get_spots | 132 | 40.9% | 87.9% | 0.0% | 3.69 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.88 |
| get_transport | 34 | 5.9% | 47.1% | 0.0% | 3.11 |
| plan_feasibility_check | 4 | 75.0% | 75.0% | 0.0% | 4.00 |
| search_area | 29 | 75.9% | 96.6% | 0.0% | 4.25 |
| search_hybrid | 59 | 23.7% | 78.0% | 0.0% | 3.46 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 83 | 20.5% |
| B | Ranking Failure (buried below noise) | 77 | 19.1% |
| C | Reasoning Failure (synthesised wrong) | 16 | 4.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 11 | 2.7% |
| F | Constraint Failure (ignored explicit constraints) | 64 | 15.8% |
| G | Coverage Failure (too few options) | 38 | 9.4% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 115 | 28.5% |

## Top improvement hints (sample of worst 10)

- **R-040** (sat 0.70, fail=A) — get_spots: Add 蔵王温泉 + 樹氷 to Yamagata canonical_iconic_landmarks; broaden q-fallback (when 0 hits in 山形市, try expanding to 山形県); pre
- **R-058** (sat 0.70, fail=A) — get_hotels: Verify city='城崎' matches '豊岡市城崎町' in hotel master; add canonical_onsen_towns block as fallback when hotels=0 for known o
- **R-267** (sat 1.65, fail=A) — plan_feasibility_check: Add fallback name→qid lookup for tier-1 cities; do not emit aggregate totals when any stop errored.
- **R-125** (sat 1.80, fail=A) — search_hybrid: Disambiguate 宮島 vs 宮城/みやぎ in tokenizer; restrict to prefecture=Hiroshima when query token resolves to Itsukushima.
- **R-092** (sat 2.20, fail=C) — get_spots: Gate canonical_kansai_koyo / sakura blocks on explicit season/koyo/sakura keywords; surface canonical_family_friendly fo
- **R-334** (sat 2.35, fail=B) — search_hybrid: Filter 全天候 vocabulary collision (sports facility kind) when query includes 屋内/indoor for tourism intent; constrain by us
- **R-363** (sat 2.35, fail=B) — search_hybrid: Strip 'くらし・手続きトップ' chrome titles and use og:title or h1; add barrier-free intent kind_tag that boosts 'バリアフリー' pages.
- **R-012** (sat 2.35, fail=B) — get_spots: Fix municipality attribution bug for Ishikawa portal aggregator pages; boost q='兼六園' to surface the Wikidata Kenroku-en 
- **R-064** (sat 2.35, fail=B) — get_local_food: Filter scraped_local_food where name_ja is a nav-template token (SNS, 総合トップ, 味わう). Pull body H2/H3 as effective name whe
- **R-120** (sat 2.35, fail=B) — get_hotels: Add city/region filter (能登/輪島/珠洲/七尾) for Ishikawa; surface canonical_luxury_ryokan with 加賀屋 / 多田屋 / 美湾荘 for Noto ocean-v
