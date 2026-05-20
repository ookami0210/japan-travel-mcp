# Tourism Agent Evaluation Scorecard — iter155 (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 54/100 = **54.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 88/100 = **88.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.74 | 0 | 0 | 13 | 23 | 41 | 23 |
| groundedness | 4.63 | 0 | 0 | 0 | 5 | 27 | 68 |
| factual_accuracy | 4.52 | 0 | 0 | 0 | 8 | 32 | 60 |
| practical_usefulness | 3.48 | 0 | 1 | 15 | 30 | 43 | 11 |
| constraint_handling | 3.34 | 0 | 5 | 18 | 29 | 34 | 14 |
| travel_feasibility | 4.14 | 0 | 0 | 1 | 16 | 51 | 32 |
| specificity | 3.67 | 0 | 0 | 8 | 34 | 41 | 17 |
| expression_quality | 3.49 | 0 | 0 | 6 | 41 | 51 | 2 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_dmo | 1 | 0.0% | 0.0% | 0.0% | 2.75 |
| get_entity_full | 1 | 100.0% | 100.0% | 0.0% | 4.62 |
| get_festivals | 6 | 66.7% | 83.3% | 0.0% | 4.17 |
| get_hotels | 13 | 61.5% | 92.3% | 0.0% | 3.93 |
| get_japan_heritage | 2 | 50.0% | 100.0% | 0.0% | 3.88 |
| get_local_food | 8 | 62.5% | 100.0% | 0.0% | 3.91 |
| get_local_specialty | 5 | 80.0% | 100.0% | 0.0% | 4.40 |
| get_spots | 32 | 50.0% | 84.4% | 0.0% | 3.79 |
| get_traditional_arts | 1 | 0.0% | 100.0% | 0.0% | 3.75 |
| get_transport | 8 | 12.5% | 62.5% | 0.0% | 3.34 |
| plan_feasibility_check | 1 | 100.0% | 100.0% | 0.0% | 4.88 |
| search_area | 7 | 71.4% | 100.0% | 0.0% | 4.12 |
| search_hybrid | 15 | 53.3% | 93.3% | 0.0% | 3.85 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 10 | 10.0% |
| B | Ranking Failure (buried below noise) | 8 | 8.0% |
| C | Reasoning Failure (synthesised wrong) | 4 | 4.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 6 | 6.0% |
| F | Constraint Failure (ignored explicit constraints) | 17 | 17.0% |
| G | Coverage Failure (too few options) | 3 | 3.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 52 | 52.0% |

## Top improvement hints (sample of worst 10)

- **R420-058** (sat 2.35, fail=B) — search_hybrid: search_hybrid top hits are unrelated (Tokushima Valentine cruise, Miyagi PR system); Miyajima/Itsukushima content buried
- **R420-034** (sat 2.40, fail=A) — get_transport: get_transport with bare prefecture can't answer multi-city rail-pass routing; pivot to plan_feasibility_check or a JR Ky
- **R420-042** (sat 2.40, fail=F) — get_spots: Korean-language query about hidden waterfalls — should boost waterfall kinds (真名井の滝, 関之尾滝, 矢研の滝) and respect ko language
- **R420-049** (sat 2.40, fail=A) — get_spots: Takachiho Gorge (高千穂峡) is a top Miyazaki landmark — should be in canonical_iconic_landmarks (真名井の滝, ボート, 鬼八の力石). Current
- **R420-011** (sat 2.70, fail=F) — get_hotels: Wheelchair / no-step / accessible bath constraint completely ignored; hotels list is dominated by Yokohama apartments an
- **R420-055** (sat 2.75, fail=E) — get_transport: Question is about Nagasaki city tram coverage; response surfaces Tsushima Kaneda Castle and Shimabara Castle which are n
- **R420-056** (sat 2.75, fail=A) — get_festivals: Query is about October cherry blossoms (jūgatsu-zakura / shikizakura); response returns endangered bon-odori festivals. 
- **R420-008** (sat 2.80, fail=C) — get_spots: city='佐渡' filter wrongly tagged many Niigata mainland events (魚沼芝桜, 越後三条ヒメサユリ, 長岡花火, 北方文化博物館) as municipality='佐渡市'. Fix
- **R420-006** (sat 2.85, fail=A) — get_dmo: Typhoon-aftermath query needs real-time closures/road status (Naruto whirlpools, Iya Valley access) — not DMO directory.
- **R420-033** (sat 2.85, fail=F) — get_spots: Respect 子供 + テーマパーク intent: surface Space World successor, Kitakyushu zoo/aquarium, Marine World, Dazaifu アンパンマン, etc. S
