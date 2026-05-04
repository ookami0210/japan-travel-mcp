# Tourism Agent Evaluation Scorecard — iter6-clean (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 69/100 = **69.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.06 | 0 | 5 | 31 | 27 | 27 | 10 |
| groundedness | 4.65 | 0 | 0 | 0 | 3 | 29 | 68 |
| factual_accuracy | 4.23 | 0 | 0 | 2 | 9 | 53 | 36 |
| practical_usefulness | 2.44 | 0 | 24 | 25 | 34 | 17 | 0 |
| constraint_handling | 2.48 | 0 | 20 | 33 | 28 | 17 | 2 |
| travel_feasibility | 3.25 | 0 | 1 | 9 | 57 | 30 | 3 |
| specificity | 3.25 | 0 | 3 | 11 | 49 | 32 | 5 |
| expression_quality | 3.16 | 0 | 0 | 17 | 50 | 33 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 87.5% | 0.0% | 3.31 |
| get_hotels | 6 | 0.0% | 66.7% | 0.0% | 3.06 |
| get_japan_heritage | 11 | 18.2% | 90.9% | 0.0% | 3.52 |
| get_local_food | 6 | 66.7% | 100.0% | 0.0% | 3.92 |
| get_local_specialty | 10 | 60.0% | 100.0% | 0.0% | 3.84 |
| get_spots | 15 | 6.7% | 20.0% | 0.0% | 2.90 |
| get_traditional_arts | 4 | 25.0% | 50.0% | 0.0% | 2.94 |
| search_area | 40 | 30.0% | 67.5% | 0.0% | 3.27 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 16 | 16.0% |
| B | Ranking Failure (buried below noise) | 41 | 41.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 13 | 13.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 20 | 20.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.50, fail=G) — search_area: Detect zero real matches and return empty + suggestion; suppress cookie/policy/landing pages from search index.
- **L4-15** (sat 1.75, fail=A) — search_area: Build a Meiji-architecture tag from 重要文化財 building list; tokenisation 擬洋風 is rare so retrieval falls back to broad munic
- **L3-30** (sat 2.00, fail=A) — search_area: Build a dedicated rural-rail spot tag, or expand to query expansion ('ローカル線', '秘境駅') and demote pages whose name is pure
- **L2-24** (sat 2.10, fail=C) — get_spots: Detect 'old streetscape/historic-district' intent and surface 重要伝統的建造物群 designations; verify multilingual intent.
- **L3-21** (sat 2.20, fail=B) — search_area: Suppress nav landing pages; add type=natural_beach + crowd_level filter.
- **L3-22** (sat 2.20, fail=B) — search_area: Add yokocho=true gastro-alley list (curated from official ward tourism pages); demote name-only park matches.
- **L3-28** (sat 2.20, fail=B) — search_area: For animal-encounter queries, prioritise spots whose description mentions the activity verb (ホエールウォッチング/ウォッチング) over nam
- **L2-27** (sat 2.25, fail=A) — get_festivals: Add fireworks dataset (hanabi taikai) separate from intangible-heritage festivals; distinguish prefecture-scoped vs fall
- **L3-12** (sat 2.30, fail=A) — search_area: Add wildlife=wild_dolphins tag and ingest Mikurajima/Toshima ecotour pages.
- **L2-29** (sat 2.35, fail=A) — get_spots: Add a 'cycling route' entity type (OSM route=bicycle) so route-level queries return routes, not points.
