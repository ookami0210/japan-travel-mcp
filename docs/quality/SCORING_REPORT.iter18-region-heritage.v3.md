# Tourism Agent Evaluation Scorecard — iter18-region-heritage (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 24/100 = **24.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 64/100 = **64.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.92 | 0 | 3 | 39 | 26 | 27 | 5 |
| groundedness | 4.65 | 0 | 0 | 0 | 6 | 23 | 71 |
| factual_accuracy | 4.25 | 0 | 0 | 5 | 13 | 34 | 48 |
| practical_usefulness | 2.58 | 0 | 11 | 39 | 31 | 19 | 0 |
| constraint_handling | 2.29 | 0 | 26 | 33 | 29 | 10 | 2 |
| travel_feasibility | 3.27 | 0 | 1 | 5 | 60 | 34 | 0 |
| specificity | 3.15 | 0 | 0 | 20 | 47 | 31 | 2 |
| expression_quality | 3.21 | 0 | 1 | 17 | 44 | 36 | 2 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 50.0% | 0.0% | 3.22 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.96 |
| get_japan_heritage | 11 | 18.2% | 63.6% | 0.0% | 3.32 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.77 |
| get_local_specialty | 10 | 60.0% | 80.0% | 0.0% | 3.75 |
| get_spots | 15 | 13.3% | 66.7% | 0.0% | 3.21 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 2.97 |
| search_area | 40 | 27.5% | 62.5% | 2.5% | 3.22 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 18 | 18.0% |
| B | Ranking Failure (buried below noise) | 30 | 30.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 27 | 27.0% |
| G | Coverage Failure (too few options) | 12 | 12.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 8 | 8.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.60, fail=H) — search_area: Add empty-but-honest fallback for impossible queries; do not fill with unrelated noise
- **L3-28** (sat 1.85, fail=A) — search_area: Map activity intents (whale watching) to canonical wikidata classes; index ホエールウォッチング tag from spot data.
- **L3-30** (sat 1.85, fail=A) — search_area: Aggressive nav-chrome/landing-page filter; add rail-line entity type with timetable/headway metadata.
- **L4-15** (sat 1.85, fail=A) — search_area: Index Meiji 擬洋風 architecture entity list (Wikidata Q-class); strict filter against irrelevant tourism site nav.
- **L3-21** (sat 2.05, fail=B) — search_area: Hard-filter pages whose description is ~100% cookie/privacy text; add crowd-density signal
- **L3-22** (sat 2.10, fail=B) — search_area: Index named yokocho/alleyways as POI category
- **L3-25** (sat 2.35, fail=B) — search_area: Disambiguate 鶴 = bird vs place-name; add wildlife-viewing dataset; translate to ru
- **L3-06** (sat 2.45, fail=B) — search_area: Filter out low-content portal pages; boost shukubo/temple-stay entities
- **L3-12** (sat 2.45, fail=B) — search_area: Add wildlife-encounter category; demote aquariums when 'wild' in query
- **L3-17** (sat 2.45, fail=B) — search_area: Filter language-switcher pages; index temple-tofu cuisine entities
