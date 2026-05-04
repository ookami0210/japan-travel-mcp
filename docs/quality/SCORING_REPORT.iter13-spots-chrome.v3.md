# Tourism Agent Evaluation Scorecard — iter13-spots-chrome (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 28/100 = **28.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 73/100 = **73.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.03 | 0 | 6 | 32 | 26 | 25 | 11 |
| groundedness | 4.41 | 0 | 0 | 2 | 11 | 31 | 56 |
| factual_accuracy | 4.37 | 0 | 0 | 1 | 14 | 32 | 53 |
| practical_usefulness | 2.59 | 0 | 12 | 35 | 35 | 18 | 0 |
| constraint_handling | 2.37 | 0 | 28 | 31 | 21 | 16 | 4 |
| travel_feasibility | 3.47 | 0 | 1 | 5 | 40 | 54 | 0 |
| specificity | 3.22 | 0 | 3 | 15 | 44 | 33 | 5 |
| expression_quality | 3.40 | 0 | 4 | 12 | 33 | 42 | 9 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 12.5% | 50.0% | 0.0% | 3.31 |
| get_hotels | 6 | 0.0% | 50.0% | 0.0% | 2.94 |
| get_japan_heritage | 11 | 27.3% | 72.7% | 0.0% | 3.44 |
| get_local_food | 6 | 66.7% | 100.0% | 0.0% | 4.00 |
| get_local_specialty | 10 | 50.0% | 100.0% | 0.0% | 4.03 |
| get_spots | 15 | 6.7% | 93.3% | 0.0% | 3.25 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.31 |
| search_area | 40 | 32.5% | 62.5% | 0.0% | 3.19 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 17 | 17.0% |
| B | Ranking Failure (buried below noise) | 31 | 31.0% |
| C | Reasoning Failure (synthesised wrong) | 0 | 0.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 8 | 8.0% |
| F | Constraint Failure (ignored explicit constraints) | 21 | 21.0% |
| G | Coverage Failure (too few options) | 7 | 7.0% |
| H | Safety / Cultural Failure | 1 | 1.0% |
| — | (no failure category, ≥4 across the board) | 15 | 15.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.50, fail=H) — search_area: Add absurd-query detection: when q has no real Japan referent (オーロラ, 砂漠, ピラミッド), return empty plus an 'intent unmatched'
- **L4-15** (sat 1.60, fail=B) — search_area: Strip site-navigation/menu text from spot description fields; build curated index of 重要文化財 architecture by style (擬洋風, 和
- **L3-30** (sat 1.70, fail=B) — search_area: Filter out 'About This Page', 'Cookie Policy', 'About Linking' style stub pages from the scrape index. Add a local-line-
- **L3-12** (sat 1.85, fail=A) — search_area: Add wildlife-experience taxonomy and a curated whitelist for niche eco-tour assets (Mikurajima, Amakusa, Ogasawara) so そ
- **L3-25** (sat 1.85, fail=A) — search_area: Disambiguate '鶴' bird vs name-substring; curate a wildlife-watching subset (Izumi cranes, Tsurui cranes, Akan whooper sw
- **L3-21** (sat 1.95, fail=B) — search_area: Hard-deduplicate same-domain landing pages (kanagawa-kankou.or.jp 旅のプランニング); add facet beach_type=natural and a crowd-de
- **L3-22** (sat 2.05, fail=B) — search_area: Build an OSM POI subset for known 横丁 alleys (curated list ~50) and serve as primary results for q='横丁' or q='izakaya all
- **L3-26** (sat 2.10, fail=B) — search_area: Add a shukubo / temple-lodging tag in the scrape pipeline; deprioritize duplicate zh/tw-language Iwate ryokan pages and 
- **L3-28** (sat 2.10, fail=B) — search_area: Tag whale-watching tour spots explicitly; downrank fountains/statues for activity intent; build an activity-type filter 
- **L3-06** (sat 2.35, fail=B) — search_area: Demote nav-only/landing pages with description boilerplate (cookie/copyright); boost spot-level pages mentioning 修行 in b
