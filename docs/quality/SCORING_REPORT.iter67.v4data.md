# v4-data Scoring Report — iter67

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 38 | 38% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 77 | 77% |
| Catastrophic (NOT safe)          | 1 | 1% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.20 | 0.25 |
| data_accuracy | 4.36 | 0.25 |
| schema_conformance | 4.50 | 0.10 |
| recall_of_known | 2.96 | 0.20 |
| prominence_ranking | 3.02 | 0.10 |
| traceability | 4.49 | 0.05 |
| structured_metadata | 3.66 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-30** sat=1.40 | missing: 飯山線, Iiyama Line, 只見線, Tadami Line, 木次線, 小海線 | wrong:  | hint: Add 'local_railway_line' kinds tag from Wikidata P31=Q728937 trains; restrict 'designation' results to fewer DMO-page hits or rerank below entity hits.
- **L1-12** sat=1.70 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Ensure get_local_specialty without category= still includes meti_densan crafts for the prefecture; load Tottori 弓浜絣 (METI craft 0228 or similar) into the dataset.
- **L2-07** sat=1.80 | missing: 八海山, 久保田, 越乃寒梅, 日本酒 (新潟) GI | wrong:  | hint: Add `category=beverage` or sake-brewery dataset (NTA brewery list / GI-Sake) to get_local_specialty; route 'sake brewery' queries to a brewery-specific endpoint.
- **L3-28** sat=1.85 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 室戸, Muroto, 高知 ホエールウォッチング | wrong: Several spot results are not whale-related at all (Monet's Garden, Okayama fruits) | hint: Add intent-aware filter: when q='クジラ', boost coastal whale-watching DMOs/spots; expose activity tags (whale_watching) on spots.
- **L3-07** sat=1.90 | missing: 陸別町 (rare aurora sightings), 母子里, 名寄 — and an explicit 'rare phenomenon' note | wrong: サンリオピューロランド and おもろ植物園 returned as if relevant — noise, not factual error | hint: Detect infeasible queries (オーロラ in Japan) and emit safety_keywords_detected/feasibility_note; avoid keyword fallback that surfaces unrelated tourist-board pages.
- **L2-02** sat=2.05 | missing: 宿坊 entries, 四国八十八ヶ所 temple lodgings | wrong:  | hint: Add lodging_type='shukubo' tag and ingest 四国八十八ヶ所霊場会 official 宿坊 list; filter or boost shukubo when query mentions お遍路/巡礼.
- **L3-12** sat=2.05 | missing: 御蔵島, 利島, 天草イルカウォッチング (熊本) | wrong:  | hint: Add intent classifier for wildlife-experience queries; build a curated dolphin/whale-watching dataset (御蔵島, 利島, 天草) and surface ahead of literal-keyword aquarium pages.
- **L3-26** sat=2.20 | missing: 高野山, Koyasan, 永平寺, Eihei-ji, 宿坊 | wrong: Multiple buddhist temples carry incorrect 'shinto_shrine' kind tag | hint: Add a 'shukubo' / 'temple_lodging' kinds tag derived from Wikidata P31=Q1129072 or shukubo association membership; surface Koyasan etc.
- **L3-29** sat=2.30 | missing: 裏千家, Urasenke, 表千家, 茶道, 武者小路千家, tea ceremony school | wrong:  | hint: Wire intent='tea_ceremony' to get_traditional_arts (chado) + search_area for 茶室; flag prefecture-only Japan Heritage when q is missing as low-relevance.
- **L3-03** sat=2.40 | missing: さっぽろ雪まつり, 旭川冬まつり, 小樽雪あかりの路, 千歳・支笏湖氷濤まつり | wrong:  | hint: When prefecture filter yields 0 hits, fall back to keyword (雪まつり) before swapping to unrelated UNESCO list; ingest yuki-matsuri events into get_festivals.
- **L3-06** sat=2.50 | missing: 高野山, 永平寺, 総持寺, 比叡山延暦寺, 三千院, 妙心寺 | wrong:  | hint: Add intent-route for 修行/meditation/shukubo to a curated temple class (P31 monastery + shukubo flag); filter out cultural-property objects when query intends place visit.
- **L3-01** sat=2.55 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, 諏訪湖祭湖上花火大会, びわ湖大花火大会 | wrong:  | hint: Add hanabi/fireworks-festival classification (e.g., Wikidata P31=Q42816 fireworks festival) and surface a kinds=fireworks subset; current 277 results are exclusively intangible cultural properties.
- **L3-02** sat=2.55 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, 諏訪湖祭湖上花火大会 | wrong:  | hint: Add a fireworks-event class to get_festivals (P31 fireworks festival or scrape 観光庁 hanabi list); ensure 花火 keyword routes to it.
- **L3-27** sat=2.60 | missing: 城崎温泉, Kinosaki, 黒川温泉, Kurokawa, 銀山温泉, Ginzan, 道後温泉 | wrong:  | hint: Filter or down-rank mountains in 温泉 query; add 'onsen_town' kind for Wikidata Q-items P31=Q1129857 (hot spring resort).
- **L1-05** sat=2.65 | missing: 中芸ゆず, 馬路村ゆず, 中芸地区 | wrong:  | hint: Add region/keyword filter so 'Nakagei' surfaces 馬路村 / 北川村 / 安田町 yuzu items first; rank GI/JA-Nakagei records ahead of unrelated tourism scrape.
