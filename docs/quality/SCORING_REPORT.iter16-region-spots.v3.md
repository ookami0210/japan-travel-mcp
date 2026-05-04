# Tourism Agent Evaluation Scorecard — iter16-region-spots (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 25/100 = **25.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 65/100 = **65.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.97 | 0 | 3 | 34 | 32 | 25 | 6 |
| groundedness | 4.68 | 0 | 0 | 0 | 3 | 26 | 71 |
| factual_accuracy | 4.39 | 0 | 0 | 1 | 11 | 36 | 52 |
| practical_usefulness | 2.58 | 0 | 8 | 40 | 38 | 14 | 0 |
| constraint_handling | 2.17 | 0 | 35 | 31 | 18 | 14 | 2 |
| travel_feasibility | 3.22 | 0 | 2 | 4 | 64 | 30 | 0 |
| specificity | 3.05 | 0 | 2 | 24 | 43 | 29 | 2 |
| expression_quality | 3.32 | 0 | 2 | 12 | 45 | 34 | 7 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 62.5% | 0.0% | 3.28 |
| get_hotels | 6 | 0.0% | 0.0% | 0.0% | 2.69 |
| get_japan_heritage | 11 | 9.1% | 81.8% | 0.0% | 3.41 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.81 |
| get_local_specialty | 10 | 50.0% | 90.0% | 0.0% | 3.80 |
| get_spots | 15 | 6.7% | 66.7% | 0.0% | 3.21 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.12 |
| search_area | 40 | 30.0% | 60.0% | 0.0% | 3.21 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 32 | 32.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 23 | 23.0% |
| G | Coverage Failure (too few options) | 11 | 11.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 13 | 13.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.60, fail=H) — search_area: Add zero-result handling for impossible queries; consider a knowledge-base check for non-existent Japanese phenomena bef
- **L4-15** (sat 2.00, fail=A) — search_area: Term-frequency boost: when query is rare-noun, require name/description literal match before falling back to vague pages
- **L3-25** (sat 2.05, fail=B) — search_area: Distinguish 鶴 as bird vs place-name kanji; tag crane-wintering reserves; honor lang=ru translation.
- **L3-30** (sat 2.05, fail=B) — search_area: Strip nav-chrome pages (about/cookies/links) from corpus; tag by JR-line / station coverage so 'mountain villages' queri
- **L3-28** (sat 2.10, fail=A) — search_area: Map ホエールウォッチング/whale watching activity tags; honor lang=fr by translating description; filter coastal prefectures.
- **L2-27** (sat 2.25, fail=A) — get_festivals: Add hanabi (fireworks) event source distinct from intangible heritage; scope national_heritage to query prefecture.
- **L3-06** (sat 2.45, fail=B) — search_area: Filter out homepage/index pages (boilerplate cookie text) from spot index; boost detail pages. Add keyword tagging for s
- **L1-05** (sat 2.50, fail=A) — get_local_food: Add 中芸 sub-region keyword index; ensure smaller-town tourism pages are scraped.
- **L2-15** (sat 2.50, fail=A) — get_hotels: Add 'shukubo' lodging_type and ensure Koyasan temple lodgings are scraped; support municipality='Koyasan' filter.
- **L4-08** (sat 2.50, fail=A) — get_traditional_arts: Provide keyword search inside intangibles, or specific tags for shugendō/shamanic categories.
