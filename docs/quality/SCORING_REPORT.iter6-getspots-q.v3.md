# Tourism Agent Evaluation Scorecard — iter6-getspots-q (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 27/100 = **27.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 67/100 = **67.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.02 | 0 | 2 | 34 | 32 | 24 | 8 |
| groundedness | 4.78 | 0 | 0 | 0 | 3 | 16 | 81 |
| factual_accuracy | 4.30 | 0 | 0 | 1 | 16 | 35 | 48 |
| practical_usefulness | 2.63 | 0 | 12 | 34 | 33 | 21 | 0 |
| constraint_handling | 2.33 | 0 | 24 | 37 | 24 | 12 | 3 |
| travel_feasibility | 3.25 | 0 | 0 | 7 | 61 | 32 | 0 |
| specificity | 3.17 | 0 | 2 | 20 | 39 | 37 | 2 |
| expression_quality | 3.19 | 0 | 1 | 15 | 49 | 34 | 1 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 87.5% | 0.0% | 3.27 |
| get_hotels | 6 | 0.0% | 83.3% | 0.0% | 3.33 |
| get_japan_heritage | 11 | 18.2% | 63.6% | 0.0% | 3.22 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.90 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.74 |
| get_spots | 15 | 6.7% | 40.0% | 0.0% | 3.02 |
| get_traditional_arts | 4 | 0.0% | 50.0% | 0.0% | 3.03 |
| search_area | 40 | 35.0% | 65.0% | 0.0% | 3.34 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 18 | 18.0% |
| B | Ranking Failure (buried below noise) | 41 | 41.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 10 | 10.0% |
| G | Coverage Failure (too few options) | 12 | 12.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 17 | 17.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.60, fail=H) — search_area: Add zero-real-match handling that signals 'topic not present in Japan corpus' rather than returning loosely matched nois
- **L2-27** (sat 1.95, fail=A) — get_festivals: Add fireworks (花火大会) corpus; suppress unrelated national fallback when prefecture has zero matches.
- **L3-30** (sat 1.95, fail=B) — search_area: Filter out spots whose name/description matches site-meta patterns (About/Privacy/Cookie/利用規約); add a hard blacklist.
- **L4-15** (sat 2.00, fail=A) — search_area: Index Wikidata 擬洋風建築 entities (Q-class) and ensure they win over generic prefecture portals when query matches.
- **L1-16** (sat 2.45, fail=A) — search_area: Substring-match 那智 should not pull 'STAY YAMAGATA' generic pages; require q to appear in name or description text not UR
- **L3-06** (sat 2.45, fail=B) — search_area: Filter out nav-only municipal home pages; route 修行/座禅/宿坊 queries to temple-specific corpus.
- **L3-12** (sat 2.45, fail=B) — search_area: Add island/marine-activity entries; current keyword search pulls generic 'iruka' pages over actual swim experiences.
- **L3-17** (sat 2.45, fail=B) — search_area: Add temple-cuisine (shojin/yudofu) tagging to spot corpus.
- **L3-28** (sat 2.45, fail=A) — search_area: Add ホエールウォッチング/whale-watching synonyms; tag spots with marine-tourism category and boost when query is about wildlife ob
- **L1-05** (sat 2.50, fail=A) — get_local_food: Index Japan Heritage stories cross-referenced to local food queries; add region-name keyword routing so 中芸 maps to the f
