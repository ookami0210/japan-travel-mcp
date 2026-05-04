# v4-data Scoring Report — iter66

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 40 | 40% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 85 | 85% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.26 | 0.25 |
| data_accuracy | 4.32 | 0.25 |
| schema_conformance | 4.49 | 0.10 |
| recall_of_known | 3.07 | 0.20 |
| prominence_ranking | 2.99 | 0.10 |
| traceability | 4.60 | 0.05 |
| structured_metadata | 3.79 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.60 | missing: realistic answer: aurora is essentially not visible in Japan; alternatives like 北海道陸別町 (rare red aurora) or Hokkaido stargazing | wrong:  | hint: Add safety_keywords_detected / feasibility_note for impossible queries (オーロラ, 北極). Surface a 'caveat' field with link to JMA / 国立天文台 when query implies infeasible phenomenon.
- **L3-12** sat=1.60 | missing: 御蔵島, 利島, 天草, 室戸 ドルフィンセンター | wrong:  | hint: Add experience_tag system (wild_dolphin_swim, dolphin_watching) and curated index for 御蔵島 / 利島. Filter out cookie-banner-only descriptions from search results.
- **L2-02** sat=1.80 | missing: shukubo entries, 88 temples lodging | wrong:  | hint: Add shukubo (宿坊) lodging_type filter and dataset. For Shikoku 88 pilgrimage, scrape 四国八十八ヶ所霊場会 official temple lodgings. Tool should accept lodging_type='shukubo'.
- **L3-30** sat=1.90 | missing: 飯田線, 只見線, Tadami Line, 小海線, 木次線 | wrong:  | hint: filter out footer/legal/contact pages from municipal_scrape index; add railway_line kind via Wikidata P31=Q728937
- **L3-25** sat=2.10 | missing: 出水市ツル渡来地 (Izumi, Kagoshima), 釧路湿原タンチョウ, 阿寒国際ツルセンター, 鶴居村 | wrong:  | hint: Add wildlife_observation_tag (crane_wintering, tancho_habitat) and route bird/animal queries to Ramsar/Wikidata wildlife site index, NOT name-string match. Critical: name-token 鶴 = 'Tsuru' (place name component) frequently overrides the bird sense.
- **L2-07** sat=2.15 | missing: 八海山, 久保田, 越乃寒梅, Hakkaisan, sake brewery, 酒蔵 | wrong:  | hint: Add a 'sake' or 'beverage' category to get_local_specialty mapping NTA酒類GI; surface 国税庁 sake GI registry; ensure breweries from Wikidata P31=Q131734 surface for prefecture queries.
- **L3-28** sat=2.20 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 室戸, Muroto, 高知 ホエールウォッチング | wrong:  | hint: add activity tag 'whale_watching'; filter municipal_scrape by token presence not page-wide match; add fr translations
- **L3-16** sat=2.30 | missing: 三原山(伊豆大島), 浅間山, 草津白根山, 那須岳, 富士山, 箱根大涌谷 | wrong:  | hint: Filter '火山' query by P31=volcano (Q8072), not name string. Add geographic-radius parameter to search_area for 'from Tokyo' constraint resolution. De-prioritize plain name-matches when entity is not actually that kind.
- **L3-01** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, PL花火芸術, 諏訪湖花火大会 | wrong:  | hint: Add hanabi-specific entity class to get_festivals (Wikidata P31 fireworks event Q4220917 or 花火大会 alias index); current dataset only carries Bunka-cho intangible folk properties, missing modern fireworks displays.
- **L3-02** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, PL花火芸術 | wrong:  | hint: Index hanabi-specific Wikidata entities (Q4220917 fireworks event subclass) and route 花火 query to that subset rather than generic intangible folk festival list.
- **L3-17** sat=2.50 | missing: 南禅寺 (湯豆腐), 永平寺の胡麻豆腐, 高野山豆腐料理, 嵯峨豆腐 forutune, 奥嵯峨 | wrong:  | hint: Add experience-cuisine tag (shojin_ryori, temple_tofu_meal). Cross-reference get_local_specialty + Wikidata temple list. Filter cookie-banner descriptions out.
- **L3-18** sat=2.50 | missing: 伊根の舟屋, 鞆の浦, 鞆の浦, 那智勝浦, 厳原 | wrong:  | hint: Filter out painting/artwork heritage entities when query implies physical location. Add curated 'historic_fishing_village' tag (伊根, 鞆の浦).
- **L1-12** sat=2.55 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: Verify METI densan dataset includes 弓浜絣 (designated 1975). May be missing from scrape — re-scrape kougeihin.jp Tottori entries.
- **L1-05** sat=2.65 | missing: 中芸ゆず, 馬路村ゆず, 中芸地区 | wrong:  | hint: Add keyword arg or rank by query keyword match — items mentioning '中芸' should bubble up. Also consider GI registration for Nakagei yuzu if exists.
- **L2-06** sat=2.65 | missing: 角館, 弘前公園, 北上展勝地, 三春滝桜 | wrong:  | hint: Add a topic/keyword filter (e.g. sakura_meisho_100 kinds boost) and broaden region scope when query says 'Tohoku'.
