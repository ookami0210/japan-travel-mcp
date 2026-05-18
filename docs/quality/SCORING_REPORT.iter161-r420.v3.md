# Tourism Agent Evaluation Scorecard — iter161-r420 (v3)

Cases: 420
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 259/420 = **61.7%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 392/420 = **93.3%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/420 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.92 | 0 | 2 | 23 | 97 | 183 | 115 |
| groundedness | 4.66 | 2 | 0 | 0 | 9 | 116 | 293 |
| factual_accuracy | 4.57 | 2 | 0 | 0 | 12 | 148 | 258 |
| practical_usefulness | 3.71 | 0 | 3 | 28 | 130 | 187 | 72 |
| constraint_handling | 3.55 | 0 | 3 | 46 | 144 | 173 | 54 |
| travel_feasibility | 4.25 | 2 | 0 | 3 | 53 | 192 | 170 |
| specificity | 3.75 | 0 | 2 | 29 | 125 | 182 | 82 |
| expression_quality | 3.62 | 0 | 1 | 26 | 118 | 263 | 12 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.62 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| get_festivals | 25 | 68.0% | 84.0% | 0.0% | 4.13 |
| get_hotels | 56 | 71.4% | 98.2% | 0.0% | 3.99 |
| get_japan_heritage | 9 | 88.9% | 100.0% | 0.0% | 4.26 |
| get_local_food | 35 | 37.1% | 88.6% | 0.0% | 3.76 |
| get_local_specialty | 22 | 63.6% | 95.5% | 0.0% | 4.11 |
| get_spots | 136 | 64.7% | 97.1% | 0.0% | 4.02 |
| get_traditional_arts | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_transport | 34 | 38.2% | 100.0% | 0.0% | 3.88 |
| plan_feasibility_check | 5 | 80.0% | 80.0% | 0.0% | 4.42 |
| search_area | 30 | 76.7% | 93.3% | 0.0% | 4.25 |
| search_hybrid | 65 | 56.9% | 84.6% | 0.0% | 3.90 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 49 | 11.7% |
| B | Ranking Failure (buried below noise) | 73 | 17.4% |
| C | Reasoning Failure (synthesised wrong) | 10 | 2.4% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 0.7% |
| F | Constraint Failure (ignored explicit constraints) | 78 | 18.6% |
| G | Coverage Failure (too few options) | 57 | 13.6% |
| H | Safety / Cultural Failure | 1 | 0.2% |
| — | (no failure category, ≥4 across the board) | 149 | 35.5% |

## Top improvement hints (sample of worst 10)

- **R-040** (sat 0.70, fail=A) — get_spots: Lower min_quality fallback should fire; add Zao Onsen to Yamagata canonical_iconic_landmarks; broaden q-token matching
- **R-058** (sat 0.75, fail=A) — get_hotels: Fix city='城崎' matching (likely needs '城崎温泉' or 豊岡市 muni); add Kinosaki to canonical_onsen_towns surface logic
- **R-278** (sat 2.10, fail=B) — search_hybrid: Add prefecture/municipality filter or canonical_kamakura cluster keyed on 'Kamakura/鎌倉'; deboost personal-name BM25 hits
- **R-375** (sat 2.35, fail=A) — search_hybrid: Add canonical_braille_tactile_destinations cluster sourcing from MLIT barrier-free certified facilities.
- **ADV-011** (sat 2.35, fail=H) — search_hybrid: Add safety_keywords_detected=['medical_tourism_out_of_scope'] with refer-to-JMIP/JNTO advisory; suppress unrelated munic
- **R-094** (sat 2.35, fail=A) — get_local_food: region-filter Ishikawa scrape to Noto sub-region when 能登 in query
- **R-374** (sat 2.40, fail=A) — search_hybrid: Add canonical_fuji_viewing_spots cluster with accessibility tags.
- **R-395** (sat 2.40, fail=B) — search_area: Boost prefecture+anime cluster (Ibaraki/Oarai/Garupan) in canonical block; demote 北海道ガーデン街道 for Oarai queries.
- **R-394** (sat 2.50, fail=A) — search_hybrid: Add canonical_kimetsu_pilgrimage block listing Asakusa (Taisho streetscape), 鬼怒川 (Mugen Train), 竈門神社 (Fukuoka), 雲取山 (Tok
- **ADV-012** (sat 2.50, fail=F) — get_festivals: Detect season-flower mismatch; surface 十月桜/冬桜 canonical list and koyo redirect.
