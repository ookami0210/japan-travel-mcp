# Tourism Agent Evaluation Scorecard — iter55-fullembed (v3)

Cases: 100
Test set: 100-case

## KPIs (confirmed 2026-05-02)

- **Satisfaction Accuracy**: 32/100 = **32.0%** (sat. score ≥ 4.0)
- **Minimum Acceptable Accuracy**: 64/100 = **64.0%** (Safety+Hallucination Pass + avg ≥ 3.0)
- **Catastrophic Error Rate**: 0/100 = **0.0%** (Safety Fail or Hallucination Fail)

Targets:
- Satisfaction Accuracy: maximise (50%+ for launch readiness)
- Minimum Acceptable Accuracy: **target 99.99%**
- Catastrophic Error Rate: **target 0%**

## Per-dimension distribution (0-5 scale)

| Dimension | Mean | 0 | 1 | 2 | 3 | 4 | 5 |
|:----------|-----:|--:|--:|--:|--:|--:|--:|
| intent_understanding | 3.01 | 0 | 9 | 29 | 29 | 18 | 15 |
| groundedness | 4.16 | 0 | 0 | 1 | 21 | 39 | 39 |
| factual_accuracy | 4.19 | 0 | 0 | 1 | 18 | 42 | 39 |
| practical_usefulness | 2.83 | 0 | 15 | 25 | 28 | 26 | 6 |
| constraint_handling | 2.62 | 0 | 24 | 28 | 16 | 26 | 6 |
| travel_feasibility | 3.49 | 0 | 1 | 8 | 39 | 45 | 7 |
| specificity | 3.26 | 0 | 3 | 20 | 37 | 28 | 12 |
| expression_quality | 3.50 | 0 | 0 | 9 | 43 | 37 | 11 |

## Per-tool breakdown

| Tool | N | Satisfaction% | Min Acceptable% | Catastrophic% | Avg score |
|:-----|--:|--------------:|----------------:|--------------:|----------:|
| get_festivals | 8 | 25.0% | 62.5% | 0.0% | 3.20 |
| get_hotels | 6 | 0.0% | 16.7% | 0.0% | 2.69 |
| get_japan_heritage | 11 | 18.2% | 81.8% | 0.0% | 3.40 |
| get_local_food | 6 | 33.3% | 100.0% | 0.0% | 3.83 |
| get_local_specialty | 10 | 50.0% | 80.0% | 0.0% | 3.95 |
| get_spots | 15 | 13.3% | 26.7% | 0.0% | 2.88 |
| get_traditional_arts | 4 | 25.0% | 75.0% | 0.0% | 3.16 |
| search_area | 40 | 45.0% | 70.0% | 0.0% | 3.52 |

## Failure Category breakdown

| Category | Description | Count | % |
|:--------:|:------------|------:|--:|
| A | Retrieval Failure (needed data not fetched) | 11 | 11.0% |
| B | Ranking Failure (buried below noise) | 10 | 10.0% |
| C | Reasoning Failure (synthesised wrong) | 3 | 3.0% |
| D | Grounding Failure (made up content) | 0 | 0.0% |
| E | Practicality Failure (correct but unusable) | 0 | 0.0% |
| F | Constraint Failure (ignored explicit constraints) | 31 | 31.0% |
| G | Coverage Failure (too few options) | 0 | 0.0% |
| H | Safety / Cultural Failure | 0 | 0.0% |
| — | (no failure category, ≥4 across the board) | 45 | 45.0% |

## Top improvement hints (sample of worst 10)

- **L3-07** (sat 1.40, fail=A) — search_area: Add explicit handling for queries where no relevant data exists; return empty result with a 'topic not in corpus' flag r
- **L3-28** (sat 1.75, fail=A) — search_area: Index whale-watching (ホエールウォッチング) as a separate keyword cluster; scrape marine activity DMO pages for Okinawa, Ogasawara
- **L4-15** (sat 1.75, fail=A) — search_area: Scrape Meiji architecture registry pages; add 擬洋風 and pseudo-Western as tags in the wikidata attraction indexing; search
- **L2-23** (sat 1.90, fail=A) — get_spots: Use search_area({'q':'ラベンダー','prefecture':'北海道'}) to surface flower-tagged attractions rather than generic prefecture br
- **L2-06** (sat 2.00, fail=F) — get_spots: Add sakura-season tagging or keyword search so get_spots can filter by blossom suitability, or add a search_area call wi
- **L2-24** (sat 2.00, fail=F) — get_spots: Search for 重要伝統的建造物群保存地区 (Important Preservation Districts) in Kyushu via get_japan_heritage or search_area('伝統的建造物 九州')
- **L3-03** (sat 2.10, fail=A) — get_festivals: Filter national_heritage fallback to items associated with the requested prefecture; add snow festival category or scrap
- **L3-17** (sat 2.10, fail=A) — search_area: Add shojin ryori (Buddhist cuisine) and temple food experience as a discoverable category; tag tofu-making workshops in 
- **L2-15** (sat 2.15, fail=F) — get_hotels: Add municipality='高野町' filter when Koya-san is detected; add lodging_type=shukubo or temple_lodging category to the hote
- **L2-11** (sat 2.25, fail=F) — get_spots: Add stargazing/dark-sky tagging to island entities, or route 星空 queries to search_area('星空 沖縄 離島') before generic prefec
