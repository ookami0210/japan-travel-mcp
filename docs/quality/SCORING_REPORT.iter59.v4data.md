# v4-data Scoring Report — iter59

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 36 | 36% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 81 | 81% |
| Catastrophic (NOT safe)          | 1 | 1% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.17 | 0.25 |
| data_accuracy | 4.24 | 0.25 |
| schema_conformance | 4.41 | 0.10 |
| recall_of_known | 2.91 | 0.20 |
| prominence_ranking | 2.93 | 0.10 |
| traceability | 4.47 | 0.05 |
| structured_metadata | 3.49 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L2-10** sat=1.50 | missing: 吉野山 (Yoshino), 醍醐寺 (Daigoji), 嵐山, 哲学の道 | wrong:  | hint: Filter municipal_scrape entries where name matches CMS section headers; demote/suppress null-content scrapes; add cherry-blossom intent → P31 cherry-blossom-spot routing.
- **L3-30** sat=1.60 | missing: 飯田線, 只見線, 小海線, 大井川鐵道, 木次線 | wrong:  | hint: Add a 'local_railway' kinds filter or route 'ローカル線' to Wikidata P31=railway_line + low frequency. Filter out admin pages (cookie/link-policy/congestion) from search_area results.
- **L3-07** sat=1.80 | missing: 陸別町, 母子里, 名寄市, 紋別 (places with documented aurora sightings) | wrong:  | hint: Add safety_keywords_detected for 'auroras in Japan' (rare phenomenon, mostly Hokkaido north) and add a curated low-frequency-natural-phenomenon dataset (or null+note) instead of substring matches on tourist aggregators.
- **L4-15** sat=1.80 | missing: 旧開智学校, Kaichi School, 済生館, 函館区公会堂, 旧岩崎邸庭園 | wrong:  | hint: Add 'giyofu' / 'pseudo-Western' as a kinds tag on relevant Wikidata entities. Tighten heritage_class_match: don't expand to castles for architectural-style queries.
- **L3-28** sat=1.85 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 高知 ホエールウォッチング, Tosa Bay | wrong:  | hint: Add intent classifier: クジラ → whale_watching → boost coastal DMOs (Ogasawara/Zamami/Kochi). Plain text-match on 'クジラ' is too noisy.
- **L2-15** sat=1.85 | missing: 恵光院 (Eko-in), 福智院 (Fukuchi-in), 西禅院 (Saizen-in), 赤松院 (Sekishoin), 高野山 shukubo cluster | wrong:  | hint: Add lodging_type=shukubo / temple_lodging via Wikidata P31; geofence by 高野山 municipality_code (303437 Koya-cho); enrich missing OSM tags from official Koyasan shukubo association list.
- **L2-25** sat=1.85 | missing: 金沢の町家, 五箇山 合掌造り民宿, 輪島の古民家民宿 | wrong:  | hint: Add lodging_type=kominka/traditional_house; filter out student dorms and obvious non-tourist accommodations from get_hotels.
- **L3-22** sat=1.90 | missing: 新宿ゴールデン街, 新宿思い出横丁, 法善寺横丁, のんべえ横丁, 恵比寿横丁 | wrong:  | hint: Build an entertainment-district / 横丁 index (manual curation or OSM amenity=bar cluster + traditional name) and route 横丁/yokocho/izakaya queries there; substring match yields completely irrelevant artifacts.
- **L2-02** sat=2.00 | missing: 宿坊 (any), 金剛峯寺 (in Wakayama), Ekoin, Fukuchiin | wrong:  | hint: Add lodging_type=shukubo / temple_lodging filter; index temples on Shikoku 88 pilgrimage that offer 宿坊. For 'お遍路 宿坊' queries, route across all 4 Shikoku prefectures, not just one. Consider intent-based multi-prefecture expansion.
- **L1-15** sat=2.15 | missing: 千光寺, 千光寺公園 | wrong:  | hint: Critical: fix municipal_scrape ingestion so source page URL doesn't override the actual entity's municipality. Validate by re-geocoding coordinates → municipality and rejecting mismatches.
- **L3-17** sat=2.40 | missing: 南禅寺 順正/奥丹 (湯豆腐), 高野山 (高野豆腐), 永平寺周辺 (ごま豆腐) | wrong:  | hint: Filter cookie/Cookie-consent boilerplate pages out of municipal_scrape; build a shojin-ryori / temple-cuisine index keyed on temples that serve tofu meals (高野山, 南禅寺, 永平寺).
- **L3-26** sat=2.40 | missing: 高野山, Koyasan, 宿坊温泉寺, 永平寺, 恵光院 | wrong:  | hint: Add a kinds/category 'shukubo' or P31=temple_lodging filter, or boost wikidata entities whose description contains 'temple lodging'/'宿坊'.
- **L3-10** sat=2.45 | missing: 富士山, 立山黒部アルペンルート, 屋久島, 上高地, 知床, 奥入瀬渓流 | wrong:  | hint: De-prioritize cookie/policy boilerplate municipal_scrape pages from top results; build a curated 'iconic landscape' index keyed on heritage class (Place of Scenic Beauty / Natural Monument).
- **L2-01** sat=2.50 | missing: 乳頭温泉, 鶴の湯, 玉川温泉, 酸ヶ湯 (Aomori but Tohoku) | wrong:  | hint: Critical: index famous hisoyu (秘湯) ryokan by name; expose lodging_type=onsen_ryokan filter and rank by prominence/heritage. Currently sorted arbitrarily by OSM id. Cross-reference 日本秘湯を守る会 list.
- **L3-01** sat=2.65 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, 全国花火競技大会 | wrong:  | hint: Add a hanabi/fireworks corpus (Wikidata P31=Q15057022 fireworks-festival, plus tourism agency feeds) and route 花火 queries to it; intangible-folk-property festival list is the wrong source for hanabi intent.
