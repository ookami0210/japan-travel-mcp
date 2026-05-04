# v4-data Scoring Report — iter57

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 40 | 40% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 73 | 73% |
| Catastrophic (NOT safe)          | 1 | 1% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 2.92 | 0.25 |
| data_accuracy | 4.29 | 0.25 |
| schema_conformance | 3.98 | 0.10 |
| recall_of_known | 3.21 | 0.20 |
| prominence_ranking | 2.85 | 0.10 |
| traceability | 3.94 | 0.05 |
| structured_metadata | 3.46 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-30** sat=1.40 | missing: 只見線, 飯山線, 肥薩線, 木次線 | wrong:  | hint: Add kinds='railway_station','local_railway' to wikidata; use q='ローカル鉄道' or 'ローカル線' with exclude for nav/link pages.
- **L4-15** sat=1.40 | missing: 旧開智学校, 鹿鳴館, 旧富岡製糸場繰糸場, 松本開智学校 | wrong:  | hint: Add kinds='pseudo_western_architecture','meiji_building' to wikidata; index architectural style as a searchable field; 擬洋風 needs semantic matching not keyword.
- **L3-07** sat=1.80 | missing:  | wrong:  | hint: Add safety_keywords_detected for queries implying physically rare phenomena (aurora visibility in Japan is extremely rare; flag with safety note). Return 0 or minimal factual results rather than noise matches.
- **L3-03** sat=1.85 | missing: さっぽろ雪まつり, 旭川冬まつり | wrong:  | hint: Index Sapporo Snow Festival and Asahikawa Winter Festival in the festivals dataset; ensure prefecture filter includes non-bunka_intangible sources; fallback national_heritage should be topically filtered.
- **L2-01** sat=1.90 | missing: 乳頭温泉, 鶴の湯, 玉川温泉, 酸ヶ湯, Nyuto onsen ryokan | wrong:  | hint: Add lodging_type filter to get_hotels (e.g. onsen_ryokan) and ensure famous Akita onsen ryokan (鶴の湯, 妙乃湯) are indexed; consider get_spots as fallback for onsen queries; add safety_keywords_detected for onsen queries (accessibility, acidity warnings).
- **L2-02** sat=1.90 | missing: 宿坊, shukubo, 高野山 (Wakayama), pilgrimage temple lodging | wrong:  | hint: Add lodging_type=shukubo to get_hotels; index temple lodging along Shikoku 88-temple route; note that 高野山 shukubo are in Wakayama—agent should query Wakayama for Koyasan results.
- **L1-03** sat=2.00 | missing: 南山城村, 南山城茶, Minami-Yamashiro tea, 宇治茶 南山城 | wrong:  | hint: Add keyword/municipality filter to get_japan_heritage; or route tea-field queries to get_local_food(Kyoto, q='南山城'); index MAFF GI Uji-cha (GI #19) which covers Minami-Yamashiro region.
- **L1-12** sat=2.00 | missing: 弓浜絣, Yumihama-gasuri, 弓ヶ浜絣 | wrong:  | hint: Ensure METI densan (伝統的工芸品) data is indexed and returned by get_local_specialty for Tottori; 弓浜絣 craft_id should appear. Check if Tottori METI craft entries are missing from the database.
- **L1-20** sat=2.00 | missing: 佐渡島, 佐渡金山, 佐渡 Sado Island, 金山 Sado Gold Mine | wrong:  | hint: Index Japan Heritage story #013 (佐渡島) under Niigata; add search_area(q='佐渡') routing for island queries; agent should prefer search_area over get_japan_heritage for geographic entity lookups.
- **L2-07** sat=2.00 | missing: 八海山, 久保田, 越乃寒梅, Hakkaisan, sake brewery | wrong:  | hint: Add a sake/brewery data source or expose a 'beverage' category in get_local_specialty; alternatively index GI sake designations (越後杜氏 etc.) and Wikidata brewery entities under a drinks category.
- **L1-15** sat=2.30 | missing: 千光寺, 尾道 city entity, Onomichi temple walk | wrong: 大久野島毒ガス資料館 (Takehara) and 広島駅 (Hiroshima city) tagged as 尾道市 spots—wrong municipality assignment | hint: Fix municipality assignment in scrape pipeline—verify address matches declared municipality; add Wikidata entity for 千光寺 (Senkoji temple); add 尾道 city entity as first result for city-name queries.
- **L3-28** sat=2.30 | missing: 小笠原クジラウォッチング, 土佐くろしおクジラウォッチング, 慶良間クジラ | wrong:  | hint: Add semantic kind='whale_watching' or activity tags; boost marine wildlife experience spots for animal-query patterns.
- **L2-06** sat=2.30 | missing: 弘前公園, Hirosaki, 三春滝桜, 北上展勝地, 角館 | wrong:  | hint: Add category or keyword arg to get_spots so agent can filter by theme (sakura/cherry blossom); or expose a get_seasonal_attractions tool that joins municipality data with seasonal tags.
- **L1-05** sat=2.35 | missing: 中芸ゆず, Nakagei yuzu, 馬路村ゆず | wrong:  | hint: Add keyword filter support (q='中芸') to get_local_food to surface the correct yuzu; filter out scraped_local_food tourist-spot bleed-through from food endpoints; expose a ranked/relevance sort so most-relevant entity leads.
- **L2-10** sat=2.35 | missing: 吉野山, 醍醐寺, 嵐山, 哲学の道 | wrong:  | hint: Deduplicate/filter municipal scrape entries with generic category-only names; ensure 吉野山 (Q201) is indexed for Nara; add sakura seasonal tagging to prioritize cherry blossom destinations.
