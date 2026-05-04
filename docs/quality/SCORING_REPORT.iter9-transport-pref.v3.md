# Tourism Agent Evaluation Scorecard — iter9-transport-pref (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 29/100 = **29.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 57/100 = **57.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.02 | 0 | 2 | 35 | 28 | 29 | 6 |
| groundedness | 4.39 | 0 | 0 | 0 | 9 | 43 | 48 |
| factual_accuracy | 4.19 | 0 | 0 | 3 | 15 | 42 | 40 |
| practical_usefulness | 2.54 | 0 | 12 | 44 | 22 | 22 | 0 |
| constraint_handling | 2.33 | 0 | 23 | 38 | 22 | 17 | 0 |
| travel_feasibility | 3.25 | 0 | 1 | 5 | 62 | 32 | 0 |
| specificity | 3.05 | 0 | 5 | 20 | 41 | 33 | 1 |
| expression_quality | 3.03 | 0 | 3 | 19 | 50 | 28 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.25 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.94 |
| get_japan_heritage | 11 | 27.3% | 72.7% | 0.0% | 3.36 |
| get_local_food | 6 | 66.7% | 83.3% | 0.0% | 3.83 |
| get_local_specialty | 10 | 60.0% | 90.0% | 0.0% | 3.84 |
| get_spots | 15 | 0.0% | 13.3% | 0.0% | 2.83 |
| get_traditional_arts | 4 | 25.0% | 50.0% | 0.0% | 3.06 |
| search_area | 40 | 32.5% | 57.5% | 0.0% | 3.15 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 34 | 34.0% |
| C | Reasoning Failure (synthesised wrong) | 1 | 1.0% |
| D | Grounding Failure (made up content) | 1 | 1.0% |
| E | Practicality Failure (correct but unusable) | 1 | 1.0% |
| F | Constraint Failure (ignored explicit constraints) | 18 | 18.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 21 | 21.0% |

## Top improvement hints (sample of worst 10)

- **L3-17** (sat 1.70, fail=B) — search_area: Suppress chrome/menu pages; add 'shojin-ryori'/'temple-food' tags.
- **L4-15** (sat 1.75, fail=A) — search_area: Index 擬洋風 as a tagged keyword on architecture entries; suppress prefectural top pages from search_area noise.
- **L3-21** (sat 1.95, fail=B) — search_area: Deduplicate by url-prefix; suppress empty boilerplate '旅のプランニング' chrome entries.
- **L3-22** (sat 1.95, fail=B) — search_area: Curated 'yokocho district' index; suppress generic regional intro chrome.
- **L3-07** (sat 2.00, fail=A) — search_area: Tag rare phenomena; provide a fallback note or suppression when match is purely chrome.
- **L3-28** (sat 2.10, fail=A) — search_area: Expand French/intent: include synonyms (baleines/dauphins/ホエールウォッチング/鯨類) and prioritise spots whose body actually mentio
- **L2-03** (sat 2.20, fail=A) — get_spots: Add an experiences/activity category to get_spots; or build a get_experiences tool that surfaces 体験 keyword spots
- **L3-12** (sat 2.20, fail=A) — search_area: Ingest activity datasets; tag 'wildlife-encounter' and 'swim-with' separately from aquarium.
- **L3-25** (sat 2.20, fail=B) — search_area: Distinguish bird/crane (animal) from 鶴 in toponyms; ingest wildlife-watching dataset.
- **L3-30** (sat 2.35, fail=B) — search_area: Index ローカル線/ローカル鉄道 specifically and link to municipalities those lines serve; suppress nav-chrome pages.
