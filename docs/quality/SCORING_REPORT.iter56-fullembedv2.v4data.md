# v4-data Scoring Report — iter56-fullembedv2

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 35 | 35% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 69 | 69% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 2.84 | 0.25 |
| data_accuracy | 4.33 | 0.25 |
| schema_conformance | 3.95 | 0.10 |
| recall_of_known | 2.90 | 0.20 |
| prominence_ranking | 2.66 | 0.10 |
| traceability | 3.96 | 0.05 |
| structured_metadata | 3.42 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.55 | missing: 北海道 オーロラ, 陸別町, 幌加内 | wrong:  | hint: Add safety_keywords_detected for impossible/rare phenomena; flag aurora as rare in Japan (only Hokkaido during solar maxima) so agent can qualify the response.
- **L3-03** sat=1.60 | missing: さっぽろ雪まつり, 旭川冬まつり | wrong:  | hint: Scrape/index Hokkaido prefecture festivals; add snow-festival keyword tag to ensure seasonal winter events appear for Hokkaido queries.
- **L4-15** sat=1.80 | missing: 旧開智学校, 鹿鳴館, 旧岩崎邸庭園, 横浜赤レンガ倉庫 | wrong:  | hint: Index 擬洋風 buildings via Wikidata P31=architecture type or via METI/Bunka heritage filter; add kinds=meiji_era_architecture; scrape results matching Chinese/Traditional-Chinese pages for a Japanese architectural query indicates poor BM25 filtering
- **L2-25** sat=1.85 | missing: 古民家宿 加賀, 白川郷 民宿, 能登 古民家 | wrong: Student housing 1 as a lodging result is noise/data quality issue | hint: Add lodging_type=kominka or machiya; filter out student housing OSM noise; Wajima/Noto kominka exist in OSM but need type tagging; hokuriku kominka market is growing and should be indexed.
- **L3-30** sat=1.85 | missing: 飯田線沿線山村, 木次線, 芸備線, 只見線沿線集落 | wrong:  | hint: Add kinds=rural_railway, local_train_village; improve scrape quality filtering to exclude link-policy and admin pages; consider semantic routing for transit+village queries to a dedicated transport layer
- **L1-12** sat=1.95 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Use get_local_specialty({prefecture:'Tottori', category:'craft'}) to retrieve METI craft designations; get_local_specialty without category defaults to food only for this prefecture.
- **L1-03** sat=2.00 | missing: 南山城村, 南山城茶, 宇治茶 南山城, Minami-Yamashiro | wrong:  | hint: Use get_local_food({prefecture:'Kyoto', q:'南山城'}) or get_spots({prefecture:'Kyoto', municipality:'南山城村'}) instead; the Japan Heritage tool lacks geographic granularity for village-level tea data.
- **L1-20** sat=2.00 | missing: 佐渡島, 佐渡金山, Sado, Sado Gold Mine | wrong:  | hint: Use search_area({q:'佐渡', prefecture:'Niigata'}) or get_spots({prefecture:'Niigata', municipality:'佐渡'}) for Sado Island; Sado Gold Mine is a Wikidata attraction entity, not a Japan Heritage story.
- **L1-15** sat=2.05 | missing: 千光寺, Onomichi town core landmarks | wrong: 大久野島毒ガス資料館 is in Takehara city not Onomichi; 広島駅 is in Hiroshima city—both tagged municipality_code 342050 incorrectly | hint: Fix municipal scrape geographic assignment: use street address parsing or GPS bounding box to prevent Hiroshima-prefecture-wide scrape results from inheriting Onomichi municipality_code.
- **L3-28** sat=2.05 | missing: 小笠原ホエールウォッチング, 座間味島, 高知県土佐清水市, 室戸岬, 和歌山太地町くじら | wrong:  | hint: Index whale-watching activity entities from DMO pages; add kinds=whale_watching; improve semantic search to match whale-watching intent beyond literal クジラ keyword hits on monument names
- **L2-15** sat=2.10 | missing: 恵光院, 一乗院, 金剛三昧院, 宿坊 高野山 | wrong:  | hint: Add lodging_type=shukubo and municipality filter for 高野山/Koyasan; implement sub-prefecture municipality indexing so Kōyasan queries don't return coastal hotels.
- **L1-09** sat=2.25 | missing: 熊野古道, 中辺路, 小辺路, 大辺路, 伊勢路, 熊野三山 | wrong:  | hint: Apply text filter: get_japan_heritage({prefecture:'Wakayama', q:'熊野古道'}) or use search_area({q:'熊野古道'}) to surface the dedicated Kumano Kodo UNESCO/JH stories.
- **L3-01** sat=2.25 | missing: 隅田川花火大会, 長岡花火, PL花火芸術, なにわ淀川花火大会 | wrong:  | hint: Add fireworks category filter or keyword match to get_festivals; index 花火大会 events separately from intangible cultural properties.
- **L3-02** sat=2.25 | missing: 隅田川花火大会, 長岡花火, 土浦全国花火競技大会 | wrong:  | hint: Implement keyword-based subtype filter for 花火 in get_festivals, or surface dedicated fireworks dataset.
- **L4-08** sat=2.30 | missing: 恐山イタコ, 修験道, 出羽三山, 熊野修験 | wrong:  | hint: Add keyword parameter to get_traditional_arts; route shamanism/mountain-worship queries to search_area with q=修験道 or q=山岳信仰; add kinds=shugendo or kinds=shamanistic_practice to relevant entities
