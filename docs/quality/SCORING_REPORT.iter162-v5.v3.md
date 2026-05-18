# Tourism Agent Evaluation Scorecard — iter162-v5 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 23/100 = **23.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 77/100 = **77.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.12 | 0 | 4 | 16 | 45 | 34 | 1 |
| groundedness | 4.12 | 1 | 1 | 0 | 10 | 59 | 29 |
| factual_accuracy | 4.11 | 1 | 0 | 1 | 9 | 63 | 26 |
| practical_usefulness | 3.00 | 0 | 4 | 22 | 45 | 28 | 1 |
| constraint_handling | 2.93 | 0 | 2 | 28 | 46 | 23 | 1 |
| travel_feasibility | 3.66 | 0 | 0 | 6 | 23 | 70 | 1 |
| specificity | 3.10 | 0 | 2 | 20 | 47 | 28 | 3 |
| expression_quality | 3.17 | 0 | 2 | 10 | 57 | 31 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.62 |
| get_festivals | 3 | 66.7% | 100.0% | 0.0% | 3.96 |
| get_hotels | 14 | 0.0% | 78.6% | 0.0% | 3.24 |
| get_japan_heritage | 3 | 66.7% | 100.0% | 0.0% | 3.83 |
| get_local_food | 14 | 0.0% | 78.6% | 0.0% | 3.30 |
| get_local_specialty | 6 | 16.7% | 66.7% | 0.0% | 3.52 |
| get_spots | 31 | 29.0% | 71.0% | 0.0% | 3.31 |
| get_transport | 4 | 100.0% | 100.0% | 0.0% | 4.22 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 2.38 |
| search_area | 5 | 40.0% | 80.0% | 0.0% | 3.65 |
| search_hybrid | 18 | 16.7% | 83.3% | 0.0% | 3.41 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 23 | 23.0% |
| B | Ranking Failure (buried below noise) | 15 | 15.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 5 | 5.0% |
| F | Constraint Failure (ignored explicit constraints) | 23 | 23.0% |
| G | Coverage Failure (too few options) | 12 | 12.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 21 | 21.0% |

## Top improvement hints (sample of worst 10)

- **R420v5-013** (sat 0.70, fail=A) — get_spots: Add canonical_iconic_landmarks for Yamagata (蔵王/銀山温泉/出羽三山); enforce non-empty fallback for famous queries.
- **R420v5-014** (sat 1.30, fail=A) — get_hotels: Honor city='城崎' with proper hotel listing; add canonical_kinosaki cluster.
- **R420v5-043** (sat 1.90, fail=A) — get_spots: Improve Naha city matching; surface Okinawa canonical landmarks when Kyushu fanout fires for Okinawa query.
- **R420v5-011** (sat 2.20, fail=H) — search_hybrid: Add out-of-scope guard for medical / surgical queries: return advisory + JNTO medical-tourism URL, suppress municipal me
- **R420v5-037** (sat 2.35, fail=B) — get_spots: Demote 市役所 administrative pages; add canonical_miyako_beaches block.
- **R420v5-049** (sat 2.35, fail=B) — search_hybrid: Apply prefecture_code filter ('01') from query context when Hokkaido mentioned in user query, or route to get_spots.
- **R420v5-027** (sat 2.40, fail=A) — plan_feasibility_check: Add qid aliasing / fallback for major-city qids and surface a default rail travel-time table when coords missing.
- **R420v5-052** (sat 2.40, fail=A) — search_hybrid: Add canonical_accessible_attractions or barrier_free_temples block keyed off ベビーカー/段差/車椅子/wheelchair; ingest Kyoto City 
- **R420v5-012** (sat 2.55, fail=E) — get_local_food: Strip nav-chrome from body_paragraphs; add canonical_hiroshima_oyster cluster with kakigoya venues.
- **R420v5-020** (sat 2.65, fail=B) — get_spots: Fix municipality assignment in scraper; suppress non-Sado events when city=佐渡.
