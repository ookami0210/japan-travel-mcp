# v4-data Scoring Report — iter54-baseline

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 33 | 33% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 76 | 76% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.03 | 0.25 |
| data_accuracy | 4.16 | 0.25 |
| schema_conformance | 3.96 | 0.10 |
| recall_of_known | 3.05 | 0.20 |
| prominence_ranking | 2.95 | 0.10 |
| traceability | 3.96 | 0.05 |
| structured_metadata | 3.27 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-28** sat=1.55 | missing: Zamami whale watching, Kochi whale watching, Ogasawara whale watching | wrong:  | hint: Improve semantic matching for whale watching context; suppress scrape results with no topical overlap to クジラ keyword; add whale_watching as an entity kind
- **L4-15** sat=1.75 | missing: Kaichi Gakko (Matsumoto), Meiji Mura, Former Hokkaido Government Building, 片山東熊 buildings | wrong:  | hint: Add 擬洋風 as a building kind tag to Meiji-era Western-style architecture wikidata entries; suppress multilingual portal pages that match only in metadata; add heritage_period=明治 filter capability
- **L3-30** sat=1.80 | missing: Iiyama Line villages, Uchiko, Koboke, Oboke area train villages | wrong:  | hint: Suppress scrape results that are navigational pages (link policies, cookie consent); for ローカル 線 queries route to get_spots with rail-related kinds rather than keyword search on ローカル alone
- **L2-25** sat=1.85 | missing: Kayabuki kominka stays, Noto machiya accommodation, Hakusan area kominka guesthouses | wrong:  | hint: Add kominka/machiya as lodging_type; ingest traditional farmhouse stay data from Noto/Hakusan area tourism boards; filter out non-tourism OSM nodes (student housing) from hotel results.
- **L3-07** sat=1.85 | missing: Aurora viewing in Hokkaido (e.g. 北海道陸別町) | wrong:  | hint: Add aurora/natural-phenomenon category; surface Hokkaido aurora spots; consider a graceful no-match response when results are thematically irrelevant.
- **L3-03** sat=1.90 | missing: Sapporo Snow Festival (さっぽろ雪まつり) | wrong:  | hint: Expand Hokkaido festival coverage; add snow/winter theme tagging; Sapporo Snow Festival should be in the dataset.
- **L1-03** sat=2.00 | missing: 南山城村, 南山城茶, 宇治茶 南山城 | wrong:  | hint: Route tea-field queries to get_local_food or get_local_specialty (MAFF GI). Japan Heritage stories do not index village-level tea brands; add keyword fallback to search_area.
- **L1-12** sat=2.00 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Add category='craft' arg to catch METI densan items; verify 弓浜絣 (METI craft designation) is indexed. Tool selection should prefer get_local_specialty with craft filter.
- **L2-15** sat=2.10 | missing: Ekoin shukubo, Fukuchiin shukubo, Rengejo-in shukubo — Koyasan temple lodging | wrong:  | hint: Add shukubo as a lodging_type; ingest Koyasan Shukubo Association data or filter by Koyasan municipality to surface temple accommodation entities.
- **L1-09** sat=2.25 | missing: 熊野古道, 中辺路, 小辺路, 熊野三山 | wrong:  | hint: Ensure Japan Heritage story #057 (熊野古道) is indexed for Wakayama; add keyword matching so q=熊野 surfaces Kumano Kodo ahead of Wakanoura.
- **L1-20** sat=2.25 | missing: 佐渡島, 金山, Sado Gold Mine | wrong:  | hint: Route Sado queries to search_area(q='佐渡') rather than get_japan_heritage; if Japan Heritage story for Sado exists, ensure Niigata prefecture filter returns it.
- **L1-15** sat=2.30 | missing: 千光寺, 尾道城跡, Onomichi Temple Walk | wrong: 広島駅 tagged with 尾道市 municipality_code (incorrect) | hint: Fix municipality_code assignment for scraped spots; add 千光寺 (Senkoji) Wikidata entity; improve ranking to surface Onomichi-specific Wikidata entities first.
- **L3-26** sat=2.30 | missing: Actual named 宿坊 venues e.g. Koyasan Ekoin, Eiheiji shukubo, Zenkoji shukubo | wrong:  | hint: Add shukubo as a typed entity; filter scrape results for 宿坊 that have accommodation context; suppress foreign-language noise for 'lang=en' queries
- **L1-05** sat=2.35 | missing: 中芸ゆず, 馬路村ゆず | wrong:  | hint: Add keyword-based relevance pre-sort so 中芸ゆず rises above物部ゆず; structured local_food items need key/category fields; scraped items lack source_url/coordinates.
- **L2-21** sat=2.60 | missing: Nakatajima Sand Dunes (中田島砂丘, Shizuoka), Sarubetsu Gensei Kaen (Hokkaido) | wrong: 高砂貝塚 is a shell midden, not a sand dune — returned due to kanji overlap but semantically wrong | hint: Add entity type=sand_dune to wikidata ingest; filter municipal scrape by relevance to query intent rather than broad keyword match.
