# Tourism Agent Evaluation Scorecard — iter11-searcharea-prom (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 25/100 = **25.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 75/100 = **75.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.03 | 0 | 4 | 31 | 29 | 30 | 6 |
| groundedness | 4.73 | 0 | 0 | 0 | 3 | 21 | 76 |
| factual_accuracy | 4.32 | 0 | 0 | 2 | 17 | 28 | 53 |
| practical_usefulness | 2.59 | 0 | 10 | 40 | 31 | 19 | 0 |
| constraint_handling | 2.21 | 0 | 31 | 33 | 21 | 14 | 1 |
| travel_feasibility | 3.25 | 0 | 2 | 6 | 57 | 35 | 0 |
| specificity | 3.11 | 0 | 0 | 24 | 44 | 29 | 3 |
| expression_quality | 3.29 | 0 | 1 | 21 | 34 | 36 | 8 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 87.5% | 0.0% | 3.31 |
| get_hotels | 6 | 0.0% | 66.7% | 0.0% | 3.00 |
| get_japan_heritage | 11 | 18.2% | 90.9% | 0.0% | 3.42 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.83 |
| get_local_specialty | 10 | 50.0% | 100.0% | 0.0% | 3.94 |
| get_spots | 15 | 6.7% | 86.7% | 0.0% | 3.19 |
| get_traditional_arts | 4 | 0.0% | 75.0% | 0.0% | 3.25 |
| search_area | 40 | 30.0% | 57.5% | 0.0% | 3.16 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 14 | 14.0% |
| B | Ranking Failure (buried below noise) | 26 | 26.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 10 | 10.0% |
| F | Constraint Failure (ignored explicit constraints) | 29 | 29.0% |
| G | Coverage Failure (too few options) | 9 | 9.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 11 | 11.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.70, fail=H) — search_area: Para queries físicamente improbables, devolver un meta-flag 'low_feasibility:true' con mensaje neutro y sugerir alternat
- **L3-21** (sat 1.80, fail=B) — search_area: municipal_scrape の同一 prefecture でほぼ同一 description '当サイトを使用…' 行を de-dup フィルタで除去 (cookie/policy boilerplate denylist)。
- **L1-16** (sat 1.85, fail=B) — search_area: Verify ingest of Q1192155 (Nachi-no-Taki); strengthen exact-name boost for iconic landmarks.
- **L3-25** (sat 1.95, fail=B) — search_area: Disambiguate 鶴 (animal vs proper-noun): tag wildlife observation sites (出水, 釧路) under bird/crane category; downweight pl
- **L3-12** (sat 2.20, fail=A) — search_area: Add a curated 'activity:wild_dolphin_swim' index keyed to Mikurashima/Toshima/Amakusa; downrank aquariums for 'wild' que
- **L3-16** (sat 2.20, fail=F) — search_area: Honor implicit geographic constraint ('from Tokyo') by filtering travel_time_from_tokyo<=4h; tag attractions with volcan
- **L3-28** (sat 2.20, fail=B) — search_area: Filter for actual marine activity entities; boost coastal municipalities offering whale-watching tours.
- **L3-30** (sat 2.20, fail=B) — search_area: Filter out boilerplate pages (About/Privacy/Linking); add rail-line entity boost for ローカル線 queries.
- **L4-15** (sat 2.20, fail=A) — search_area: Need entity-level architecture tag; current keyword search misses since term rarely on portal pages.
- **L3-06** (sat 2.45, fail=B) — search_area: 修行/zazen/shukubo を attraction-type 'temple_experience' タグでブースト + lang ミスマッチ (zh→en) を抑制。
