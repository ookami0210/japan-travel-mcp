# v4-data Scoring Report — iter68

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 39 | 39% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 76 | 76% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.31 | 0.25 |
| data_accuracy | 4.37 | 0.25 |
| schema_conformance | 4.41 | 0.10 |
| recall_of_known | 3.09 | 0.20 |
| prominence_ranking | 3.04 | 0.10 |
| traceability | 4.56 | 0.05 |
| structured_metadata | 3.62 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L1-03** sat=1.85 | missing: 南山城村, 南山城茶, 宇治茶 南山城 | wrong:  | hint: Route 'tea fields / village' queries to get_local_food / get_local_specialty (MAFF GI 宇治茶) or municipality-level get_spots(municipality='南山城村'); add see_also pointer when get_japan_heritage finds nothing matching.
- **L2-02** sat=1.85 | missing: 金剛峯寺, Ekoin, Fukuchiin, Rengejoin, 宿坊 | wrong:  | hint: Implement shukubo lodging_type with Wikidata seed (P31=Q1352230 shukubo) and link 88-temple henro temples that offer lodging; expand prefecture scope across 4 Shikoku prefectures when query says '四国'.
- **L3-30** sat=1.85 | missing: 飯山線, 只見線, Tadami Line, 小海線 | wrong:  | hint: add transit/railway tag matching; suppress DMO website pages whose name only loosely substring-matches
- **L3-03** sat=2.00 | missing: さっぽろ雪まつり, 旭川冬まつり, 層雲峡氷瀑まつり, 支笏湖氷濤まつり | wrong:  | hint: Add modern festival/event source (e.g. JNTO event calendar or Wikidata P31=Q1445650 winter-festival) to fill the snow-festival gap; prefecture filter should not drop to unrelated national fallback.
- **L3-25** sat=2.05 | missing: 出水市ツル渡来地, 釧路湿原, 阿寒丹頂鶴自然公園 | wrong:  | hint: Add wildlife/birdwatching taxonomy with species tags; literal kanji match on 鶴 surfaces unrelated places like 鶴林寺 — disambiguate by P31=bird-sanctuary or seasonal_wildlife tag.
- **L1-12** sat=2.10 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Ensure get_local_specialty includes METI densan crafts even without explicit category filter, OR auto-broaden to category=craft when query keyword (絣/gasuri/textile) is detected.
- **L3-12** sat=2.10 | missing: 御蔵島, 利島, 天草イルカウォッチング | wrong: アクアリウム/イルカショーは野生体験ではない (mismatched intent) | hint: Add 'wild_dolphin_encounter' tag (Mikurashima, Toshima, Amakusa); filter out captive-aquarium results when intent is 'wild' / 'swim with'.
- **L3-17** sat=2.10 | missing: 高野山宿坊, 南禅寺順正, 奥丹清水, 永平寺 | wrong:  | hint: Add a 'shojin_ryori' or 'temple_meal' tag; cross-link with shukubo (宿坊) data; do not return cultural-property documents for food queries.
- **L3-18** sat=2.10 | missing: 伊根の舟屋, 雑賀崎, 須佐, 美保関 | wrong: 漁村夕照図 is a painting, not a place | hint: Map fishing-village heritage (伊根, 美保関 etc Important Preservation Districts) as fishing_village kind; exclude artwork records from spatial-intent queries.
- **L3-22** sat=2.15 | missing: 新宿ゴールデン街, 思い出横丁, のんべい横丁, 恵比寿横丁 | wrong: 横丁公園 is a park, not an izakaya district | hint: Build a 'yokocho_district' kind populated from Wikidata + manual seed list for famous Tokyo/Osaka yokocho; do not match parks named 横丁.
- **L3-07** sat=2.25 | missing: Hokkaido aurora viewing notes (e.g. 名寄, 陸別) | wrong:  | hint: Emit safety_keywords_detected=['rare_phenomenon'] for aurora queries and limit results to Hokkaido high-latitude observatories; keyword 'オーロラ' should not match Sanrio Puroland.
- **L3-28** sat=2.30 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 土佐清水 | wrong:  | hint: add activity_tags (whale_watching) and route DMO/spot scrapes through topical filtering instead of raw substring
- **L3-09** sat=2.30 | missing: 吉野山, 高遠城址公園, 弘前公園, 目黒川, 千鳥ヶ淵 | wrong:  | hint: Build a sakura_famous index (Wikidata cherry-blossom-spot, 100選 lists); name-substring search alone cannot satisfy seasonal-intent queries.
- **L3-16** sat=2.40 | missing: 浅間山, 三原山, 箱根大涌谷, 富士山, 那須岳 | wrong:  | hint: Filter volcano queries by P31=Q8072 (volcano) and rank by access-from-Tokyo distance; emit safety_keywords_detected=['volcanic_activity'] when intent involves climbing.
- **L2-07** sat=2.45 | missing: 八海山, 久保田, 越乃寒梅, sake brewery, 酒蔵 | wrong:  | hint: Add a beverage/sake category to get_local_specialty (NTA sake GI list, 国税庁 brewery directory) so 'sake brewery' queries resolve to actual breweries.
