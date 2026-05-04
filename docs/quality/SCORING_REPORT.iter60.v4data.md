# v4-data Scoring Report — iter60

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 42 | 42% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 81 | 81% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.29 | 0.25 |
| data_accuracy | 4.32 | 0.25 |
| schema_conformance | 4.46 | 0.10 |
| recall_of_known | 3.00 | 0.20 |
| prominence_ranking | 3.03 | 0.10 |
| traceability | 4.48 | 0.05 |
| structured_metadata | 3.50 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L2-02** sat=1.55 | missing: 四国八十八ヶ所 shukubo, 焼山寺 宿坊, 鶴林寺 宿坊, Ekoin (高野山) | wrong:  | hint: Add shukubo flag to lodging_type taxonomy; aggregate Shikoku 88-temple shukubo as a separate dataset; route 'お遍路 + 宿坊' to all 4 Shikoku prefectures, not just Tokushima.
- **L2-25** sat=1.85 | missing: 加賀屋,べにや無何有,輪島の古民家 | wrong:  | hint: Add lodging_type=kominka filter; deduplicate / suppress non-public lodging like student housing.
- **L3-07** sat=1.95 | missing: 陸別町オーロラ観測, 名寄市 | wrong:  | hint: Add infeasibility_hint or safety_entity_flags for low-feasibility queries (aurora is rare in Japan); also handle empty-result fallback better.
- **L3-17** sat=2.10 | missing: 高野山宿坊精進料理, 永平寺精進料理, 南禅寺湯豆腐 | wrong:  | hint: Map 豆腐+寺 intent to shukubo with vegetarian cuisine; add cuisine=shojin filter on local_specialty/spots.
- **L2-07** sat=2.15 | missing: 八海山,久保田,越乃寒梅,sake breweries | wrong:  | hint: Add category=sake or NTA brewery dataset; route 'sake brewery' query to dedicated brewery endpoint or filter.
- **L2-15** sat=2.15 | missing: 福智院,恵光院,持明院,Koyasan shukubo temples | wrong:  | hint: Add lodging_type=shukubo (temple lodging); enrich Koyasan via wikidata Q-list of shukubo temples.
- **L3-16** sat=2.15 | missing: 三原山(伊豆大島), 浅間山, 箱根大涌谷, 富士山 | wrong:  | hint: Support geo-radius filter from Tokyo (or named city) and tag active vs dormant; add safety_keywords_detected for volcanic gas/activity.
- **L1-05** sat=2.15 | missing: 中芸ゆず, 馬路村ゆず, 中芸地区 | wrong:  | hint: Filter out generic 'tourism search index' scraped entries from local_food. Boost MAFF GI entries with name match against query keyword (中芸/馬路).
- **L3-22** sat=2.25 | missing: 思い出横丁, ゴールデン街, のんべい横丁, 法善寺横丁 | wrong:  | hint: Tighten yokocho semantics to izakaya alleys (not name-only); add izakaya/nightlife category and Tokyo-centric ranking when query implies.
- **L2-01** sat=2.25 | missing: 乳頭温泉郷, 鶴の湯, 玉川温泉, 妙乃湯, 黒湯温泉 | wrong:  | hint: Add lodging_type filter param; rank onsen_ryokan above urban hotels when query contains 秘湯/onsen/ryokan keyword. Add structured_metadata.lodging_subtype=secluded_onsen.
- **L3-28** sat=2.30 | missing: 小笠原諸島, Ogasawara, 知床, Shiretoko, 座間味, Zamami, 室戸ホエールウォッチング, 黒潮町ホエールウォッチング | wrong:  | hint: Add activity-keyword expansion (クジラ→whale_watching→ホエールウォッチング); surface boat-tour DMO pages; add fr label support; tag coastal whale-watching ports.
- **L3-30** sat=2.30 | missing: 只見線, 木次線, 予土線, 飯田線, 三江線跡, 小海線, Tadami Line, JR Iida | wrong:  | hint: Add railway_line entity type via Wikidata P31=Q728937; expose station/line connectivity; suppress generic CMS pages (Linking/Cookie/Facility Congestion) from search results.
- **L1-12** sat=2.50 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Verify METI densan dataset includes 弓浜絣 (designated 1975); ensure get_local_specialty returns crafts even when foods dominate. Add explicit category sort/group.
- **L3-01** sat=2.65 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火 | wrong:  | hint: Add fireworks_keyword filter or P31=Q686547 (fireworks festival) ingest from Wikidata; expose theme/category facets on get_festivals.
- **L3-02** sat=2.65 | missing: 隅田川花火大会, 長岡花火, 大曲全国花火競技大会 | wrong:  | hint: Ingest fireworks events (花火大会) explicitly; add seasonal/theme filters on get_festivals.
