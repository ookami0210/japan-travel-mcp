# Tourism Agent Evaluation Scorecard — iter165-v6 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 41/100 = **41.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 87/100 = **87.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.38 | 0 | 1 | 20 | 30 | 38 | 11 |
| groundedness | 4.26 | 0 | 0 | 0 | 11 | 52 | 37 |
| factual_accuracy | 4.24 | 0 | 0 | 0 | 12 | 52 | 36 |
| practical_usefulness | 3.20 | 0 | 1 | 22 | 36 | 38 | 3 |
| constraint_handling | 3.27 | 0 | 1 | 18 | 36 | 43 | 2 |
| travel_feasibility | 3.98 | 0 | 1 | 0 | 8 | 82 | 9 |
| specificity | 3.32 | 0 | 0 | 20 | 34 | 40 | 6 |
| expression_quality | 3.55 | 0 | 0 | 1 | 43 | 56 | 0 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 100.0% | 100.0% | 0.0% | 4.25 |
| get_festivals | 3 | 33.3% | 66.7% | 0.0% | 3.58 |
| get_hotels | 17 | 35.3% | 82.4% | 0.0% | 3.60 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.94 |
| get_local_food | 11 | 36.4% | 100.0% | 0.0% | 3.92 |
| get_local_specialty | 4 | 25.0% | 100.0% | 0.0% | 3.56 |
| get_spots | 29 | 48.3% | 100.0% | 0.0% | 3.62 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.75 |
| get_transport | 4 | 50.0% | 100.0% | 0.0% | 4.16 |
| search_area | 7 | 57.1% | 71.4% | 0.0% | 3.73 |
| search_hybrid | 21 | 33.3% | 66.7% | 0.0% | 3.43 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 20 | 20.0% |
| B | Ranking Failure (buried below noise) | 7 | 7.0% |
| C | Reasoning Failure (synthesised wrong) | 4 | 4.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 3 | 3.0% |
| F | Constraint Failure (ignored explicit constraints) | 15 | 15.0% |
| G | Coverage Failure (too few options) | 15 | 15.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 36 | 36.0% |

## Top improvement hints (sample of worst 10)

- **R420v6-003** (sat 2.40, fail=A) — search_area: search_area should boost toponym match (宮島) above generic 'バリアフリー' DMO pages
- **R420v6-036** (sat 2.40, fail=C) — search_hybrid: Add safety_keywords for self_contradiction; emit advisory note to ask user which constraint to prioritise.
- **R420v6-037** (sat 2.40, fail=B) — search_hybrid: Add canonical_stroller_friendly_districts with Asakusa / Ueno / Ginza street-level paving notes.
- **R420v6-038** (sat 2.40, fail=A) — search_hybrid: Add canonical_late_november_koyo with peak windows per region (Tohoku early Nov, Kanto late Nov, Kyushu Dec).
- **R420v6-041** (sat 2.40, fail=A) — search_hybrid: Add canonical_free_parks with entry_fee=0 attribute across major cities.
- **R420v6-043** (sat 2.40, fail=A) — search_hybrid: Add canonical_national_koyo with regional alternatives flagged as off-Kyoto.
- **R420v6-044** (sat 2.40, fail=A) — search_hybrid: Add canonical_remote_traditional_villages with WHS gassho-zukuri + Kiso post towns + Iya.
- **R420v6-046** (sat 2.40, fail=A) — search_hybrid: Add canonical_shojin_ryori with Koyasan + Eiheiji + Kyoto temple-restaurants.
- **R420v6-053** (sat 2.40, fail=A) — get_hotels: Trigger canonical_budget_lodging on Arabic 'رخيصة' / 'أقل من' / '5000' tokens; filter master to lodging_type in (hostel,
- **R420v6-082** (sat 2.45, fail=B) — search_area: Strict prefecture filter on results when query specifies a prefecture; hoist canonical_iconic_landmarks with free-entry 
