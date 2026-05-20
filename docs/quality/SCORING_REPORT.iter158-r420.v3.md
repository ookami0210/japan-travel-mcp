# Tourism Agent Evaluation Scorecard — iter158-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 208/420 = **49.5%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 380/420 = **90.5%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.78 | 0 | 3 | 32 | 124 | 158 | 103 |
| groundedness | 4.47 | 0 | 1 | 4 | 21 | 165 | 229 |
| factual_accuracy | 4.44 | 0 | 0 | 3 | 27 | 174 | 216 |
| practical_usefulness | 3.52 | 0 | 3 | 47 | 147 | 174 | 49 |
| constraint_handling | 3.44 | 0 | 0 | 55 | 171 | 147 | 47 |
| travel_feasibility | 4.07 | 0 | 0 | 4 | 58 | 264 | 94 |
| specificity | 3.61 | 0 | 3 | 45 | 131 | 174 | 67 |
| expression_quality | 3.42 | 0 | 1 | 17 | 228 | 154 | 20 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.50 |
| get_festivals | 25 | 68.0% | 92.0% | 0.0% | 4.12 |
| get_hotels | 56 | 64.3% | 96.4% | 0.0% | 4.01 |
| get_japan_heritage | 9 | 22.2% | 77.8% | 0.0% | 3.40 |
| get_local_food | 35 | 28.6% | 85.7% | 0.0% | 3.61 |
| get_local_specialty | 22 | 50.0% | 81.8% | 0.0% | 3.66 |
| get_spots | 136 | 50.7% | 95.6% | 0.0% | 3.88 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.38 |
| get_transport | 34 | 47.1% | 94.1% | 0.0% | 3.90 |
| plan_feasibility_check | 5 | 80.0% | 80.0% | 0.0% | 3.98 |
| search_area | 30 | 73.3% | 100.0% | 0.0% | 4.12 |
| search_hybrid | 65 | 30.8% | 76.9% | 0.0% | 3.61 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 65 | 15.5% |
| B | Ranking Failure (buried below noise) | 77 | 18.3% |
| C | Reasoning Failure (synthesised wrong) | 1 | 0.2% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 7 | 1.7% |
| F | Constraint Failure (ignored explicit constraints) | 63 | 15.0% |
| G | Coverage Failure (too few options) | 35 | 8.3% |
| H | Safety / Cultural Failure | 1 | 0.2% |
| — | (no failure category, ≥4 across the board) | 171 | 40.7% |

## Top improvement hints (sample of worst 10)

- **R-040** (sat 1.30, fail=A) — get_spots: Fallback when get_spots returns 0: drop city filter, retry at prefecture level, OR populate canonical_winter_destination
- **R-171** (sat 1.70, fail=A) — get_local_specialty: q='茶' should match name_ja containing '茶' — likely needs full-text on Japanese name. Add explicit alias '宇治茶' mapping.
- **R-175** (sat 1.70, fail=A) — get_local_specialty: Ingest 国税庁 GI alcohol registry; OR at minimum fire canonical_sake_regions block when q='清酒' OR 'sake'.
- **R-064** (sat 2.05, fail=B) — get_local_food: Strip nav-chrome titles from local_food entities; route オリーブ畑 to get_spots or search_area q='オリーブ公園'.
- **R-267** (sat 2.05, fail=A) — plan_feasibility_check: Add city-centroid resolver: accept name aliases (Tokyo / Kyoto / Nara) and map to canonical Q-IDs before haversine.
- **R-058** (sat 2.30, fail=A) — get_hotels: Backfill 城崎温泉 onsen_ryokan entries (the town is well-curated by 城崎温泉旅館協同組合); add 日本秘湯を守る会 + 城崎温泉旅館協同組合 as official curat
- **R-393** (sat 2.35, fail=A) — search_hybrid: Add advisory that BTS pilgrimage sites are not in MCP corpus (concert venues only); suppress anime canonical block when 
- **R-183** (sat 2.35, fail=A) — get_local_specialty: Add canonical_wagashi_traditions cluster; filter see_also to actually relevant venues (wagashi museums / kashi-do)
- **R-261** (sat 2.35, fail=B) — search_hybrid: Add a canonical_jr_scenic_lines block keyed by region; filter search by prefecture set when 東北 in query.
- **R-278** (sat 2.40, fail=B) — search_hybrid: Add prefecture_code/municipality filter in search_hybrid; tighten BM25 weight on '鎌倉' over '鎌倉時代' (era-name false positi
