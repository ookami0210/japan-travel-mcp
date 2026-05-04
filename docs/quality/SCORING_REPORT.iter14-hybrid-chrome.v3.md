# Tourism Agent Evaluation Scorecard — iter14-hybrid-chrome (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 27/100 = **27.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 70/100 = **70.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.99 | 0 | 6 | 35 | 25 | 22 | 12 |
| groundedness | 4.52 | 0 | 0 | 2 | 5 | 32 | 61 |
| factual_accuracy | 4.34 | 0 | 0 | 2 | 11 | 38 | 49 |
| practical_usefulness | 2.51 | 0 | 11 | 43 | 30 | 16 | 0 |
| constraint_handling | 2.23 | 0 | 32 | 26 | 29 | 13 | 0 |
| travel_feasibility | 3.40 | 0 | 2 | 2 | 50 | 46 | 0 |
| specificity | 3.16 | 0 | 2 | 20 | 40 | 36 | 2 |
| expression_quality | 3.21 | 0 | 3 | 15 | 45 | 32 | 5 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 50.0% | 0.0% | 3.19 |
| get_hotels | 6 | 0.0% | 66.7% | 0.0% | 2.92 |
| get_japan_heritage | 11 | 27.3% | 54.5% | 0.0% | 3.22 |
| get_local_food | 6 | 33.3% | 83.3% | 0.0% | 3.60 |
| get_local_specialty | 10 | 40.0% | 100.0% | 0.0% | 3.83 |
| get_spots | 15 | 6.7% | 86.7% | 0.0% | 3.27 |
| get_traditional_arts | 4 | 0.0% | 75.0% | 0.0% | 3.03 |
| search_area | 40 | 40.0% | 62.5% | 0.0% | 3.25 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 22 | 22.0% |
| B | Ranking Failure (buried below noise) | 41 | 41.0% |
| C | Reasoning Failure (synthesised wrong) | 2 | 2.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 2 | 2.0% |
| F | Constraint Failure (ignored explicit constraints) | 5 | 5.0% |
| G | Coverage Failure (too few options) | 8 | 8.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 20 | 20.0% |

## Top improvement hints (sample of worst 10)

- **L4-15** (sat 1.35, fail=A) — search_area: Build an architecture-style tag set sourced from Bunka-cho Important Cultural Property registry; index 擬洋風 specifically 
- **L3-07** (sat 1.50, fail=A) — search_area: Add a low-recall guard: if q matches astronomical phenomenon and no high-confidence local hit, return empty + advisory n
- **L3-30** (sat 1.70, fail=B) — search_area: Filter out names matching 'About', 'リンク', 'プランニング' boilerplate. Build a railway-line tag and surface DMO/feature pages d
- **L3-26** (sat 2.10, fail=B) — search_area: Add a shukubo / temple-lodging tag in the scrape pipeline; deprioritize duplicate zh/tw cookie-stub pages when lang=en; 
- **L3-28** (sat 2.10, fail=B) — search_area: Tag whale-watching tour spots; downrank statues/fountains for activity intents; build an activity-type filter (whale_wat
- **L3-04** (sat 2.20, fail=A) — get_japan_heritage: intent='rural life experience' は get_japan_heritage ではなく DMO inbound プラン or get_local_specialty(category='lifestyle') にル
- **L4-08** (sat 2.25, fail=A) — get_traditional_arts: Add keyword search inside get_traditional_arts for 'shaman/yamabushi/shugen/イタコ/巫女'; index Wikidata items linked to shug
- **L4-20** (sat 2.25, fail=A) — get_japan_heritage: Honor q='pilgrimage/巡礼' on get_japan_heritage by keyword-matching body_ja and theme; or add a curated pilgrimage-route c
- **L3-21** (sat 2.30, fail=B) — search_area: Filter out municipal nav-chrome (≤200 char generic descriptions, '旅のプランニング'-style titles). Add beach-type tag (resort/wi
- **L3-22** (sat 2.35, fail=A) — search_area: Add taxonomy nightlife/izakaya/yokocho as a dedicated category. Index well-known yokocho zones from JNTO/Tabelog editori
