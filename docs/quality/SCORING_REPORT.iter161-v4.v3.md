# Tourism Agent Evaluation Scorecard — iter161-v4 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 57/100 = **57.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 92/100 = **92.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.89 | 0 | 0 | 6 | 24 | 45 | 25 |
| groundedness | 4.53 | 0 | 0 | 0 | 6 | 35 | 59 |
| factual_accuracy | 4.56 | 0 | 0 | 1 | 3 | 35 | 61 |
| practical_usefulness | 3.57 | 0 | 0 | 9 | 37 | 42 | 12 |
| constraint_handling | 3.36 | 0 | 0 | 16 | 42 | 32 | 10 |
| travel_feasibility | 4.45 | 0 | 0 | 1 | 8 | 36 | 55 |
| specificity | 3.65 | 0 | 0 | 10 | 35 | 35 | 20 |
| expression_quality | 3.76 | 0 | 0 | 2 | 27 | 64 | 7 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 6 | 33.3% | 66.7% | 0.0% | 3.52 |
| get_hotels | 14 | 71.4% | 100.0% | 0.0% | 4.14 |
| get_japan_heritage | 2 | 100.0% | 100.0% | 0.0% | 4.12 |
| get_local_food | 9 | 66.7% | 100.0% | 0.0% | 4.33 |
| get_local_specialty | 5 | 40.0% | 100.0% | 0.0% | 3.98 |
| get_spots | 33 | 66.7% | 93.9% | 0.0% | 4.07 |
| get_transport | 8 | 37.5% | 100.0% | 0.0% | 3.92 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 3.62 |
| search_area | 7 | 57.1% | 100.0% | 0.0% | 4.14 |
| search_hybrid | 15 | 33.3% | 73.3% | 0.0% | 3.51 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 10 | 10.0% |
| B | Ranking Failure (buried below noise) | 8 | 8.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 2 | 2.0% |
| E | Practicality Failure (correct but unusable) | 4 | 4.0% |
| F | Constraint Failure (ignored explicit constraints) | 28 | 28.0% |
| G | Coverage Failure (too few options) | 11 | 11.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 34 | 34.0% |

## Top improvement hints (sample of worst 10)

- **R420v4-002** (sat 2.15, fail=B) — get_spots: Fix municipality-attribution in municipal_scrape merge; add karuizawa featured_cluster with promenades + signature resor
- **R420v4-040** (sat 2.40, fail=F) — search_hybrid: build canonical_vision_impaired_friendly_museums; tag tactile exhibits
- **R420v4-048** (sat 2.50, fail=D) — search_hybrid: return explicit 'no documented filming locations; the Asakusa setting is fictional' note
- **R420v4-091** (sat 2.65, fail=A) — get_festivals: region_fanout to Shikoku 4 prefs when keyword is seasonal; ensure canonical_festivals always emit
- **R420v4-007** (sat 2.75, fail=A) — get_spots: Add gokayama featured_cluster (相倉, 菅沼, 村上家, 五箇山民俗館); ensure UNESCO 'historic villages' members surface for 合掌造り q.
- **R420v4-088** (sat 2.75, fail=A) — get_festivals: Add canonical_sakura_festivals block per prefecture; expand region fan-out to Shikoku 4 prefs
- **R420v4-045** (sat 2.85, fail=B) — search_hybrid: build canonical_tokyo_sakura_top20; cherry_blossom intent should pre-load this
- **R420v4-039** (sat 2.90, fail=B) — search_hybrid: add canonical_kamakura_temples with fee=free|paid flag
- **R420v4-043** (sat 2.90, fail=A) — search_hybrid: add canonical_live_action_film_locations block
- **R420v4-038** (sat 3.05, fail=G) — search_hybrid: municipality-bias query for Kanazawa-specific BM25 boost; raise k
