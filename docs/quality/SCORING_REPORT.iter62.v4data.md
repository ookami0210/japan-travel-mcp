# v4-data Scoring Report — iter62

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 48 | 48% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 89 | 89% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.53 | 0.25 |
| data_accuracy | 4.48 | 0.25 |
| schema_conformance | 4.64 | 0.10 |
| recall_of_known | 3.21 | 0.20 |
| prominence_ranking | 3.21 | 0.10 |
| traceability | 4.72 | 0.05 |
| structured_metadata | 3.91 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L2-02** sat=1.70 | missing: 四国八十八箇所 shukubo (善通寺, 雲辺寺 etc.), Ekoin (高野山) | wrong:  | hint: Index Shikoku 88-temple shukubo (henro pilgrimage). For 四国お遍路 query, route also to Wakayama/Koyasan via routing_hint='pilgrimage_shukubo' + cross-prefecture search.
- **L1-15** sat=2.05 | missing: 千光寺, 尾道市街地, 尾道城, Onomichi proper landmarks | wrong:  | hint: Fix municipal_scrape→municipality_code mapping: scraped page URL≠entity location. Validate per-item address vs municipality_code; ship 千光寺 as canonical Onomichi spot.
- **L3-07** sat=2.05 | missing:  | wrong:  | hint: add intent-impossibility detection (aurora in Japan ≈ impossible at mainland) and emit a safety/feasibility note; do not silently return name matches
- **L2-07** sat=2.10 | missing: 八海山, 久保田, 越乃寒梅, 朝日酒造, 八海醸造 | wrong:  | hint: Add sake-brewery dataset (国税庁 GI sake or Wikidata P31=Q131734 sake brewery) to get_local_specialty; map ja '酒蔵' query intent.
- **L3-12** sat=2.10 | missing: 御蔵島, 天草市, 三宅島 | wrong:  | hint: semantic search must elevate wild-dolphin destinations; index 御蔵島/天草 via 'dolphin_swim' intent token
- **L3-30** sat=2.10 | missing: 只見線, Tadami Line, 飯山線, 小海線, 木次線 | wrong:  | hint: Filter out cookie/link boilerplate spots; add P31=Q728937 railway lines and surface mountain villages along quiet local lines
- **L3-17** sat=2.20 | missing: 永観堂, 南禅寺 順正, 高野山, 嵯峨豆腐 | wrong:  | hint: add intent-pair 寺+豆腐 → shojin/yudofu temples; index Kyoto tofu-cuisine temples (奥丹, 順正, 嵯峨豆腐 森嘉)
- **L3-28** sat=2.40 | missing: 高知県室戸, Muroto, 小笠原, Ogasawara whale watching, 知床, Shiretoko | wrong:  | hint: Add intent-aware semantic search; for クジラ surface whale-watching coastal areas (Ogasawara, Muroto, Zamami) via DMO activities, not whale-named statues
- **L3-25** sat=2.50 | missing: 出水ツル渡来地, 釧路湿原, 立山 | wrong:  | hint: distinguish bird (Q33602 crane) from name-token; add wildlife/birdwatching entity class for 出水市ツル, 釧路丹頂鶴自然公園
- **L3-01** sat=2.65 | missing: 隅田川花火大会, 長岡花火, 大曲全国花火競技大会, PL花火 | wrong:  | hint: add a 花火 / fireworks dataset (Wikidata Q1085 fireworks displays) or surface a no_match note when the keyword has no entries
- **L3-02** sat=2.65 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲花火, PL花火芸術 | wrong:  | hint: index 花火大会 as a keyword filter and pull from Wikidata fireworks-festival entities; or return empty + helpful_hint when intent is fireworks
- **L1-12** sat=2.70 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Ensure get_local_specialty surfaces METI 伝統的工芸品 records for Tottori (弓浜絣). Currently appears restricted to MAFF GI food. Add craft category routing.
- **L2-06** sat=2.70 | missing: 角館の桜並木, 桧木内川堤, 真人公園 | wrong:  | hint: Add cherry_blossom kind/spec or season-aware boost; pull 角館武家屋敷 (sakura) by P31 cherry-blossom site.
- **L3-16** sat=2.75 | missing: 箱根山, 浅間山, 三原山, 富士山 | wrong:  | hint: distinguish 'volcano' (P31=Q8072) from name-token 火山; add region filter for Tokyo day-trip distance
- **L2-25** sat=2.85 | missing: 美山荘 type kominka, 能登 集落丸山, 茅葺き古民家 stays | wrong:  | hint: Add kominka/古民家 lodging_type; filter OSM 'student_residence' out of hotels endpoint.
