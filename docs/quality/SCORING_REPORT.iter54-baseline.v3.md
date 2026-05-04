# Tourism Agent Evaluation Scorecard — iter54-baseline (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 26/100 = **26.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 68/100 = **68.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 1/100 = **1.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 2.91 | 0 | 4 | 39 | 30 | 16 | 11 |
| groundedness | 4.02 | 0 | 0 | 2 | 17 | 58 | 23 |
| factual_accuracy | 4.05 | 0 | 0 | 1 | 15 | 62 | 22 |
| practical_usefulness | 2.73 | 0 | 9 | 38 | 28 | 21 | 4 |
| constraint_handling | 2.76 | 0 | 8 | 45 | 20 | 17 | 10 |
| travel_feasibility | 3.75 | 0 | 0 | 2 | 33 | 53 | 12 |
| specificity | 3.15 | 0 | 0 | 26 | 41 | 25 | 8 |
| expression_quality | 3.60 | 0 | 0 | 4 | 41 | 46 | 9 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 87.5% | 0.0% | 3.30 |
| get_hotels | 6 | 0.0% | 33.3% | 0.0% | 2.73 |
| get_japan_heritage | 11 | 0.0% | 45.5% | 0.0% | 2.99 |
| get_local_food | 6 | 33.3% | 33.3% | 0.0% | 3.52 |
| get_local_specialty | 10 | 40.0% | 90.0% | 0.0% | 3.80 |
| get_spots | 15 | 13.3% | 80.0% | 6.7% | 3.23 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.25 |
| search_area | 40 | 40.0% | 70.0% | 0.0% | 3.52 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 18 | 18.0% |
| B | Ranking Failure (buried below noise) | 13 | 13.0% |
| C | Reasoning Failure (synthesised wrong) | 7 | 7.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 31 | 31.0% |
| G | Coverage Failure (too few options) | 4 | 4.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 27 | 27.0% |

## Top improvement hints (sample of worst 10)

- **L3-03** (sat 1.90, fail=A) — get_festivals: Add winter/seasonal event data for Hokkaido or ensure Sapporo Snow Festival and similar events appear in the corpus so p
- **L3-28** (sat 2.00, fail=A) — search_area: Add whale-watching as a recognized activity type; map クジラ with whale-watch context to coastal prefectures; filter out mo
- **L4-15** (sat 2.00, fail=A) — search_area: Filter out nav-chrome and homepage URL matches; add 擬洋風建築 as a category alias mapping to Meiji architectural heritage; s
- **L1-15** (sat 2.10, fail=C) — get_spots: Fix municipality code assignment during scrape ingestion; verify that coordinates fall within the stated municipality bo
- **L3-07** (sat 2.15, fail=A) — search_area: Add a 'low-feasibility' flag or disclaimer for queries about phenomena not reliably observed in Japan (aurora); include 
- **L3-12** (sat 2.15, fail=A) — search_area: Add wildlife experience tags (wild-dolphin-swim, whale-watching) to attraction data; DMO scrapes from Mikurajima and Oga
- **L1-12** (sat 2.25, fail=A) — get_local_specialty: Pass category='craft' when query is about a textile/craft item; or let agents discover available categories via metadata
- **L1-20** (sat 2.25, fail=A) — get_japan_heritage: Add keyword/municipality-level search capability to get_japan_heritage; Sado-specific content (search_area with q='佐渡') 
- **L3-30** (sat 2.35, fail=B) — search_area: Add ローカル線 + 山村 as a combined intent category; map to specific rural railway lines and their terminal village spots in th
- **L2-12** (sat 2.40, fail=F) — get_hotels: Filter or sort hotels by lodging_type=onsen_ryokan when query contains onsen. Add rural/city classification to hotel ent
