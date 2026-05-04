# v4-data Scoring Report — iter63

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 36 | 36% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 77 | 77% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.28 | 0.25 |
| data_accuracy | 4.07 | 0.25 |
| schema_conformance | 4.20 | 0.10 |
| recall_of_known | 2.94 | 0.20 |
| prominence_ranking | 2.92 | 0.10 |
| traceability | 4.41 | 0.05 |
| structured_metadata | 3.51 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.45 | missing: Hokkaido aurora-rare-sighting context (北海道陸別, 名寄) | wrong:  | hint: Add safety_keywords_detected=['aurora_infeasible_in_japan']; filter out cookie/consent pages; never return aurora_alone as a viable plan.
- **L1-15** sat=2.05 | missing: 千光寺, 尾道市本通り商店街, 千光寺公園 | wrong: 大久野島 (Takehara), 広島駅 (Hiroshima-shi), 厳島神社 (Hatsukaichi) all incorrectly tagged municipality=尾道市 | hint: Critical: municipal_scrape pipeline is leaking entries from one source page into multiple municipality records. Audit dive-hiroshima.com scrape per-page municipality tagging and re-extract.
- **L3-30** sat=2.05 | missing: 只見線, Tadami line, 飯田線, 木次線, 三江線跡, Iiyama line villages | wrong:  | hint: hard-filter scrape titles like 'About Linking', 'Facility Congestion', cookie/privacy pages; build a 'rural railway / depopulated village' tag from MIC depopulation list + JR sparse-line stations
- **L1-05** sat=2.10 | missing: 中芸ゆず, 馬路村ゆず | wrong: scraped_local_food entry 'observation spot search' is not really a regional dish — category mislabeled | hint: Add keyword arg routing for 中芸/馬路村, fix scraped_local_food category labeling, boost MAFF GI items over scraped tourist-portal aggregators.
- **L2-07** sat=2.10 | missing: 八海山, 久保田, 越乃寒梅, sake brewery (酒蔵) entities | wrong:  | hint: Route 'sake' query to MAFF GI sake category or Wikidata P31 sake brewery (Q131734); current category=null returns produce instead.
- **L3-16** sat=2.15 | missing: 浅間山, 草津白根山, 三原山, 大涌谷, 箱根駒ヶ岳 | wrong:  | hint: Add geographic proximity filter (within ~200km of given anchor); add safety_keywords_detected for active-volcano regulation; tag P31=Q8072 volcanos.
- **L3-10** sat=2.25 | missing: 上高地, 白川郷, 立山黒部アルペンルート, 摩周湖, 別府地獄, 角島大橋 | wrong:  | hint: Strip cookie/consent paragraphs at scrape time; promote Place-of-Scenic-Beauty (P1435=Q11414752) entities to top of 絶景 queries.
- **L3-12** sat=2.25 | missing: 御蔵島, 利島, 天草イルカウォッチング, 室戸岬イルカ | wrong:  | hint: Tag dolphin entities with captive vs wild_population; ingest Mikurajima/Toshima dolphin-swim operators.
- **L3-17** sat=2.25 | missing: 高野山 胡麻豆腐, 永平寺 精進料理, 南禅寺 湯豆腐, 嵯峨豆腐 | wrong:  | hint: Cross-link tofu local-specialties with religious_building POIs to surface temple-tofu pairings; add shojin-ryori tag.
- **L2-02** sat=2.25 | missing: 四国88箇所 shukubo (e.g. 焼山寺, 一番札所霊山寺 lodgings) | wrong:  | hint: Add lodging_type='shukubo' classification and pilgrimage-temple filter. Cross-ref 四国八十八箇所 with hotel/lodging dataset; Koyasan shukubo (Wakayama) is the canonical example of this data shape.
- **L3-28** sat=2.30 | missing: 小笠原諸島, Ogasawara, 座間味, Zamami, 室戸, Muroto, 那智勝浦, 知床 | wrong:  | hint: add semantic filter to drop scrape rows whose body has zero whale-related token; surface whale-watching hubs via DMO + Wikidata P31 'whale watching site' or activity tags
- **L3-25** sat=2.30 | missing: 出水のツル渡来地, 釧路湿原タンチョウ, 阿寒国際ツルセンター, 鳥取湖山池 | wrong:  | hint: Disambiguate 鶴 as bird vs place-name kanji; add P31=Q43762 (crane species) habitat tags; ingest 出水ツル観察センター, 釧路湿原 タンチョウ wintering sites.
- **L4-16** sat=2.30 | missing: 長崎と天草地方の潜伏キリシタン関連遺産, Hidden Christian Sites in the Nagasaki Region (UNESCO WHS), 大浦天主堂 in this context | wrong:  | hint: route Hidden Christian queries to UNESCO WHS dataset, not just Japan Heritage stories; rank story by query-keyword match (q='Christian/キリシタン')
- **L3-03** sat=2.40 | missing: さっぽろ雪まつり, 旭川冬まつり, 小樽雪あかりの路, 層雲峡氷瀑まつり | wrong:  | hint: When prefecture filter yields 0, filter the heritage backfill to relevant prefecture or theme; ingest 雪まつり list separately.
- **L3-06** sat=2.45 | missing: 高野山, 永平寺, 比叡山延暦寺, 三千院, 大徳寺 | wrong:  | hint: Add 'shukubo' / meditation-retreat tag; deduplicate kinds when temple is unambiguously Buddhist.
