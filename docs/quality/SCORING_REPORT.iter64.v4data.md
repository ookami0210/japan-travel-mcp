# v4-data Scoring Report — iter64

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 44 | 44% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 80 | 80% |
| Catastrophic (NOT safe)          | 2 | 2% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.32 | 0.25 |
| data_accuracy | 4.25 | 0.25 |
| schema_conformance | 4.38 | 0.10 |
| recall_of_known | 3.08 | 0.20 |
| prominence_ranking | 3.07 | 0.10 |
| traceability | 4.49 | 0.05 |
| structured_metadata | 3.71 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L1-12** sat=1.75 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Default get_local_specialty without category should mix food + craft + textile, OR auto-infer category from query (kasuri/絣 → textile). Verify METI densan dataset has 弓浜絣 ingested for Tottori.
- **L3-30** sat=1.75 | missing: 奥出雲, 飯田線, 木次線, 只見線, 三江線跡, 田舎ローカル線 | wrong:  | hint: Filter municipal_scrape spots by content quality (drop login/footer/cookie pages); add railway-line entity class (P31=Q728937) and small-station villages.
- **L3-12** sat=1.80 | missing: 御蔵島 (Mikurajima), 利島, 天草 イルカウォッチング | wrong:  | hint: Add safety_keywords_detected (e.g. 'wild_animal_interaction','swimming_risk') for swim/dive queries; index 御蔵島/利島 ドルフィンスイム as activity entries.
- **L1-15** sat=1.90 | missing: 千光寺, 千光寺公園, 尾道本通り, 猫の細道 | wrong:  | hint: Repair municipal_scrape municipality assignment — derive from address_postal_code or coordinates, not from source-page tag. Re-scrape 尾道市 official tourism site to populate 千光寺・千光寺公園・尾道本通り.
- **L3-28** sat=1.90 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 室戸, Muroto, 高知県 ホエールウォッチング | wrong:  | hint: Add activity-class taxonomy (whale_watching) sourced from Wikidata Q1196129 / DMO category tags; downrank statues/monuments containing query keyword.
- **L3-07** sat=2.00 | missing:  | wrong:  | hint: Filter description-only matches that are cookie-banner boilerplate; add safety_keywords_detected=['impossible_phenomenon'] for queries like 'aurora in Japan' so agent can warn user.
- **L2-07** sat=2.10 | missing: 八海山, 久保田, 越乃寒梅, sake breweries | wrong:  | hint: add sake_brewery dataset (国税庁清酒製造免許) or wikidata P31=Q131734 sakagura to get_local_specialty
- **L2-02** sat=2.25 | missing: 四国八十八ヶ所 宿坊, 11番藤井寺周辺宿坊, shukubo near 12番焼山寺 | wrong:  | hint: Add a lodging_type='shukubo' filter (Wikidata P31 of temple-lodging) and ingest 四国八十八ヶ所 official shukubo registry. Tag henro-route lodgings with henro_temple_number.
- **L3-25** sat=2.30 | missing: 出水市 鶴渡来地, 釧路湿原 タンチョウ, 阿寒国際ツルセンター, 鶴居村 | wrong:  | hint: Disambiguate 鶴 (crane bird) vs 鶴-named places; add wildlife/birdwatching tag and index 出水市/釧路湿原 as winter_crane sites; consider safety/seasonality metadata.
- **L3-17** sat=2.40 | missing: 南禅寺 順正・奥丹 (湯豆腐), 嵯峨豆腐 森嘉, 高野山 精進料理 (胡麻豆腐) | wrong:  | hint: Add temple-cuisine (精進料理 / shojin) tag; index 南禅寺周辺 湯豆腐 restaurants and 高野山 宿坊 with 'tofu' keywords.
- **L3-18** sat=2.40 | missing: 伊根の舟屋, 鞆の浦, 雑賀崎, 須崎 久礼, 大間町 | wrong:  | hint: Filter 'painting'/'figure' Wikidata classes when query is for places; add specific tag for 舟屋/preserved fishing village; index 伊根の舟屋 with high prominence.
- **L3-10** sat=2.45 | missing: 上高地, 白川郷展望台, 角島大橋, 富士山, 立山黒部アルペンルート, 屋久島 | wrong:  | hint: Filter out cookie-banner/portal-page descriptions from municipal_scrape; promote scenic-beauty heritage entries (名勝) for 絶景 queries.
- **L3-16** sat=2.45 | missing: 浅間山, 那須岳, 三原山(伊豆大島), 草津白根山, 箱根 大涌谷, 富士山 | wrong:  | hint: Add safety_keywords_detected=['active_volcano','toxic_gas','hike_risk'] for 火山 queries; add geo-distance filter when query says 'from Tokyo'; index P31=Q8072 (volcano) entities with eruption status.
- **L3-09** sat=2.45 | missing: 吉野山, 三春滝桜, 高遠城址, 弘前公園, 角館 | wrong:  | hint: Add seasonal_feature='cherry_blossom' index so 吉野山/弘前公園 surface; treat 桜 query as feature query not substring match.
- **L3-22** sat=2.55 | missing: 新宿 思い出横丁, 新宿 ゴールデン街, 渋谷のんべい横丁, 吉祥寺ハーモニカ横丁, 恵比寿横丁 | wrong:  | hint: Index famous yokocho drinking-alleys (思い出横丁/ゴールデン街) as POIs with kind='drinking_alley'; demote 'park named X-yokocho' results.
