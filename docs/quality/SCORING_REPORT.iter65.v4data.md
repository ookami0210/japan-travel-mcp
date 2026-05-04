# v4-data Scoring Report — iter65

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 41 | 41% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 84 | 84% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.33 | 0.25 |
| data_accuracy | 4.29 | 0.25 |
| schema_conformance | 4.54 | 0.10 |
| recall_of_known | 3.06 | 0.20 |
| prominence_ranking | 3.12 | 0.10 |
| traceability | 4.56 | 0.05 |
| structured_metadata | 3.78 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.40 | missing:  | wrong:  | hint: For impossible/no-match queries return empty with safety_keywords_detected or infeasible_intent flag rather than spurious municipal_scrape noise.
- **L3-12** sat=1.60 | missing: 御蔵島, 利島, 天草イルカウォッチング, 室戸ドルフィンセンター | wrong:  | hint: Filter spot results by description containing 'wild' / '野生' or expose a curated activity-experience dataset (ドルフィンスイム).
- **L2-02** sat=1.70 | missing: 宿坊, shukubo, 焼山寺宿坊, 大窪寺 | wrong:  | hint: Add shukubo as a lodging_type tag, source from temple-side data (88-temple official site) so Shikoku henro inquiries surface temple lodging.
- **L1-03** sat=2.05 | missing: 南山城村, 南山城茶, 宇治茶 南山城 | wrong:  | hint: Route tea-region queries to get_local_food / get_local_specialty filtered by municipality, or expose municipal_scrape entries with 'tea/茶' tag at story-text level.
- **L2-07** sat=2.10 | missing: 八海山, 久保田, 越乃寒梅, Hakkaisan, sake brewery, 酒蔵 | wrong:  | hint: For sake_brewery / 酒蔵 intent, route to a dedicated dataset (国税庁 sake brewery list or NTA GI sake) and rank GI:sake (Q26226) above food GIs.
- **L1-12** sat=2.15 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Ensure get_local_specialty surfaces METI 伝統的工芸品 records (Yumihama-gasuri qualifies). Default ordering should mix food + craft, not food-only.
- **L3-17** sat=2.15 | missing: 高野山 胡麻豆腐, 永平寺, 嵯峨豆腐 森嘉, 京都 南禅寺 順正 | wrong:  | hint: Suppress generic language-selection portal pages; cross-reference 精進料理/temple-food dataset.
- **L3-28** sat=2.25 | missing: 室戸, 太地町 Taiji, 慶良間 Kerama, 小笠原 Ogasawara, 羅臼 Rausu | wrong:  | hint: Add whale-watching activity kinds; filter municipal_scrape noise when query is animal/activity; route to get_outdoor_activities
- **L3-16** sat=2.35 | missing: 三原山(伊豆大島), 浅間山, 那須岳, 箱根大涌谷, 富士山 | wrong:  | hint: Add region/distance filter or city-based origin parameter; rank by distance from Tokyo when intent says 'from Tokyo'.
- **L3-18** sat=2.35 | missing: 伊根の舟屋, 雑賀崎漁港, 浦富海岸, 田子の浦 | wrong:  | hint: Filter out artwork P31 entities when query asks for places; include 伊根 as canonical traditional fishing village.
- **L2-28** sat=2.35 | missing:  | wrong:  | hint: When prefecture filter+keyword in industry_category align (e.g., bamboo+Oita -> 別府竹細工), boost rank substantially; secondary prefecture matches should rank below primary.
- **L3-01** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲全国花火競技大会, 諏訪湖祭湖上花火大会 | wrong:  | hint: Add a category/intent filter or dedicated get_fireworks endpoint; bunka_intangible feed lacks fireworks events entirely.
- **L3-02** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲花火, 諏訪湖花火大会 | wrong:  | hint: Introduce keyword filtering on festival names containing '花火' or expose a fireworks-specific dataset.
- **L3-10** sat=2.45 | missing: 上高地, 美瑛青い池, 角島大橋, 摩周湖, 父母ヶ浜 | wrong:  | hint: Suppress portal-index pages (URL pattern 'feature' / 'downloadimage') and rank attractions with Place_of_Scenic_Beauty designation higher.
- **L3-30** sat=2.50 | missing: 飯田線秘境駅, 五能線, 奥出雲おろち, only_2_hours train villages | wrong:  | hint: Filter portal-page noise (boilerplate titles like 'About Linking'); add a kinds tag for 'rural_train_line' or rely on kinds=preservation_district + rail proximity
