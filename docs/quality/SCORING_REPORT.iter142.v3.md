# Tourism Agent Evaluation Scorecard — iter142 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 35/100 = **35.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 75/100 = **75.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.49 | 0 | 2 | 18 | 27 | 35 | 18 |
| groundedness | 4.24 | 1 | 0 | 1 | 9 | 50 | 39 |
| factual_accuracy | 4.06 | 2 | 0 | 0 | 18 | 48 | 32 |
| practical_usefulness | 3.07 | 1 | 6 | 20 | 36 | 32 | 5 |
| constraint_handling | 2.91 | 1 | 6 | 25 | 40 | 25 | 3 |
| travel_feasibility | 3.65 | 1 | 1 | 3 | 26 | 65 | 4 |
| specificity | 3.27 | 1 | 1 | 17 | 42 | 29 | 10 |
| expression_quality | 3.11 | 0 | 1 | 10 | 66 | 23 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.25 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| get_festivals | 6 | 66.7% | 83.3% | 0.0% | 4.00 |
| get_hotels | 13 | 46.2% | 69.2% | 0.0% | 3.62 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.81 |
| get_local_food | 8 | 50.0% | 75.0% | 0.0% | 3.55 |
| get_local_specialty | 5 | 60.0% | 80.0% | 0.0% | 3.67 |
| get_spots | 32 | 28.1% | 81.2% | 0.0% | 3.46 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.25 |
| get_transport | 8 | 0.0% | 37.5% | 0.0% | 3.05 |
| plan_feasibility_check | 1 | 0.0% | 0.0% | 0.0% | 0.50 |
| search_area | 7 | 57.1% | 85.7% | 0.0% | 3.59 |
| search_hybrid | 15 | 20.0% | 80.0% | 0.0% | 3.40 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 22 | 22.0% |
| B | Ranking Failure (buried below noise) | 20 | 20.0% |
| C | Reasoning Failure (synthesised wrong) | 6 | 6.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 20 | 20.0% |
| G | Coverage Failure (too few options) | 5 | 5.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 25 | 25.0% |

## Top improvement hints (sample of worst 10)

- **R420-025** (sat 0.50, fail=A) — plan_feasibility_check: Add lenient string-array fallback in plan_feasibility_check that resolves qids by name search, OR return explicit infeas
- **R420-077** (sat 0.70, fail=A) — get_spots: Add prefecture-name fuzzy match + suggest 新緑 (fresh-green maple) alternative; fail-soft with advisory note
- **R420-011** (sat 2.10, fail=A) — get_hotels: Filter hotel master by wheelchair=yes + 箱根町 municipality; surface 国土交通省 バリアフリー宿 registry.
- **R420-024** (sat 2.15, fail=A) — get_local_specialty: When MAFF/METI returns 0 for branded food, fall back to scraped_local_food + 鹿児島県 brand registry.
- **R420-056** (sat 2.25, fail=F) — get_festivals: For seasonal-misalignment queries, return explicit out-of-season warning + autumn-blooming sakura variants.
- **R420-058** (sat 2.25, fail=B) — search_hybrid: Hybrid ranker must boost toponym (宮島/Miyajima) matches; consider toponym-must filter.
- **R420-032** (sat 2.35, fail=A) — search_hybrid: Add OSM wheelchair tag enrichment + scrape city.himeji.lg.jp barrier-free page.
- **R420-038** (sat 2.35, fail=B) — get_local_food: Tighten lexical filter for 日本酒 to brewery/sake entries; surface canonical Fushimi sake-brewery cluster.
- **R420-006** (sat 2.40, fail=A) — get_dmo: Add typhoon/disaster intent detector that surfaces 道路情報リンク + DMO phone + 国交省 災害情報.
- **R420-021** (sat 2.40, fail=A) — get_spots: Add canonical_illumination block for nationally-famous winter lights (なばなの里, あしかがフラワーパーク, さがみ湖 etc).
