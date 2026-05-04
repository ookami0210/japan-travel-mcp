# v4-data Scoring Report — iter58

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 37 | 37% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 75 | 75% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.19 | 0.25 |
| data_accuracy | 4.30 | 0.25 |
| schema_conformance | 4.42 | 0.10 |
| recall_of_known | 2.93 | 0.20 |
| prominence_ranking | 2.99 | 0.10 |
| traceability | 4.44 | 0.05 |
| structured_metadata | 3.48 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.65 | missing:  | wrong:  | hint: Add safety_keywords_detected/feasibility flag for 'aurora in Japan' (impossible-in-most-of-country); return empty + advisory rather than tangential matches.
- **L3-12** sat=1.85 | missing: 御蔵島, 利島, 天草イルカウォッチング | wrong:  | hint: Surface dolphin-watching destinations (御蔵島/天草) by activity tag rather than literal イルカ matches in random text.
- **L3-30** sat=1.85 | missing: 小海線, JR只見線, 木次線, 三江線, 飯山線, ローカル線沿線集落 | wrong:  | hint: Filter municipal_scrape spots whose name matches link-policy/cookie/facility-info boilerplate; add P31=Q21010953 (railway line) routing so 'local line' surfaces rural rail destinations.
- **L3-28** sat=1.90 | missing: 小笠原諸島, Ogasawara, 高知, 太地町, Taiji, 室戸, Muroto | wrong: fr lang requested but response is JA/EN | hint: Add a kinds=whale_watching tag (P31 Q-class for cetacean tour spots) and intent routing so 'voir des baleines' returns Ogasawara/Taiji/Muroto, not statues.
- **L2-21** sat=1.95 | missing: 鳥取砂丘, 中田島砂丘, 内灘砂丘, 庄内砂丘 | wrong:  | hint: Restrict heritage_class_match to same-kind matches; add 'dune' / 砂丘 as Wikidata kind (P31=Q35509 dune) lookup path
- **L2-02** sat=2.00 | missing: 宿坊 type lodgings on Shikoku 88; e.g. 善楽寺宿坊, 雲辺寺宿坊 | wrong:  | hint: Add lodging_type=shukubo subtype derived from OSM tags + Wikidata P31; cross-link to 四国八十八ヶ所 temple list for Henro pilgrim queries.
- **L1-12** sat=2.10 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Ensure get_local_specialty without category filter actually merges meti_densan crafts; 弓浜絣 (METI Densan 0212) is a known designated craft for Tottori.
- **L1-15** sat=2.20 | missing: 千光寺, 尾道市 (city entity), Onomichi Castle, Senkoji Park | wrong:  | hint: Fix municipal_scrape municipality tagging; cross-validate scrape page domain (dive-hiroshima.com) with actual page subject before assigning municipality.
- **L3-22** sat=2.25 | missing: 思い出横丁, ゴールデン街, 野毛, 立石仲見世 | wrong:  | hint: Build a 'drinking/yokocho-alley' tag distinct from substring matches; OSM amenity=bar clusters with 'yokocho' name pattern would surface canonical alleys.
- **L2-01** sat=2.25 | missing: 乳頭温泉郷, 鶴の湯温泉, 玉川温泉, 酸ヶ湯 (Aomori) | wrong:  | hint: Add lodging_type=onsen_ryokan filter pathway and ensure famous Akita onsen ryokan (Tsuru-no-yu Q11652148, Nyutoonsen) are indexed; rank by lodging_type relevance to query intent.
- **L1-03** sat=2.40 | missing: 南山城村, 南山城茶, 宇治茶 南山城 | wrong:  | hint: Route tea-field queries to get_local_food/get_local_specialty (宇治茶 is registered) or surface 日本茶800年の歴史散歩 Japan Heritage story which covers Minamiyamashiro.
- **L1-05** sat=2.40 | missing: 中芸ゆず, 馬路村ゆず | wrong:  | hint: Add keyword filter handling so 'ゆず' or '中芸' narrows results; suppress generic '観光スポット検索' scrape pages or downrank them in get_local_food.
- **L3-03** sat=2.40 | missing: さっぽろ雪まつり, 旭川冬まつり, 小樽雪あかりの路 | wrong:  | hint: Add snow-festival tag and ensure prefecture filter actually filters the national_heritage fallback (or omit it for empty regional results).
- **L3-17** sat=2.40 | missing: 南禅寺順正, 嵯峨豆腐 森嘉, 高野山精進料理 | wrong:  | hint: Add 'tofu+temple/shojin' tag pairing; surface canonical temple-tofu producers/restaurants over generic prefecture portal pages.
- **L3-18** sat=2.40 | missing: 伊根の舟屋, 鞆の浦, 大間崎, 焼津港 | wrong:  | hint: Map 'fishing village frozen in time' to 重伝建-fishing intersection (伊根/鞆の浦), filter out paintings (漁村夕照図) for landscape intent.
