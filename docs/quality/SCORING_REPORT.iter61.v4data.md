# v4-data Scoring Report — iter61

**Cases scored**: 100

## KPIs (data-layer)

| KPI | Count | % |
|:---|---:|---:|
| Satisfaction (weighted ≥ 4.0)   | 40 | 40% |
| Minimum Acceptable (avg ≥ 3.0 + safe) | 76 | 76% |
| Catastrophic (NOT safe)          | 0 | 0% |

## Dimension averages (0–5)

| Dimension | Avg | Weight |
|:---|---:|---:|
| data_completeness | 3.25 | 0.25 |
| data_accuracy | 4.26 | 0.25 |
| schema_conformance | 4.55 | 0.10 |
| recall_of_known | 2.87 | 0.20 |
| prominence_ranking | 2.96 | 0.10 |
| traceability | 4.53 | 0.05 |
| structured_metadata | 3.67 | 0.05 |

## Bottom 15 cases (by weighted satisfaction)

- **L3-07** sat=1.40 | missing: (none expected — aurora not a Japan offering) | wrong:  | hint: Add safety_entity_flags or routing_hint='infeasible_in_japan' when query intent is aurora/borealis; return empty + advisory metadata rather than literal substring matches.
- **L3-12** sat=1.60 | missing: 御蔵島, 利島, 天草イルカウォッチング | wrong:  | hint: Add curated wildlife-encounter spots (御蔵島 dolphin swim, 天草) to dataset; safety_entity_flags for water/wildlife activities.
- **L3-30** sat=1.60 | missing: 奥出雲, 飯田線, 木次線, 三江線跡, 只見線, 木曽地域, 高千穂 | wrong:  | hint: Filter out municipal-scrape boilerplate (heuristic on title len + URL pattern like /link, /privacy); add routing for transport+rural intent to a sparse-rail or 過疎 dataset.
- **L2-25** sat=1.80 | missing: 古民家宿, 金沢町家, 五箇山合掌造り民宿, 白川郷民宿 | wrong:  | hint: Add lodging_type=kominka / gasshou / machiya; ingest specialized 古民家ステイ datasets (NOTOYA, Stayjapan); rerank against urban chain hotels for '古民家' intent.
- **L1-12** sat=1.85 | missing: 弓浜絣, Yumihama-gasuri | wrong:  | hint: When category unset, return both food + craft; add explicit 弓浜絣 (METI densan) entry; expose category facet counts.
- **L1-20** sat=1.85 | missing: 佐渡島, Sado, 佐渡金山, Sado Gold Mine | wrong:  | hint: Sado Gold Mine (UNESCO WHS 2024) must be added to heritage_designations; route 'Sado Island' to search_area; ensure Wikidata Q177570 (佐渡島) is indexed.
- **L2-07** sat=2.00 | missing: 八海山, 久保田, 越乃寒梅, 朝日酒造, sake brewery, 酒蔵 | wrong:  | hint: Add a 'sake_brewery' category to get_local_specialty (NTA list of 清酒 producers, or wikidata P31=Q220659 sake breweries by prefecture); also add intent extraction so 'sake brewery' query routes to brewery dataset.
- **L2-15** sat=2.00 | missing: 恵光院, 一乗院, 福智院, 西禅院 (高野山 shukubo), Koyasan temple lodgings | wrong:  | hint: Ingest 高野山宿坊協会 list as lodging_type=shukubo; add municipality=高野町 routing when query mentions 高野山/Koya; expose lodging_type filter in get_hotels.
- **L3-23** sat=2.15 | missing: 江ノ電, 五能線, わたらせ渓谷鉄道, 由利高原鉄道, 大井川鐵道 | wrong:  | hint: Fix kinds_class_match for ローカル線 — should map to railway_line/scenic_railway, not bridges. Add a railway_line dataset (P31=Q728937 etc.).
- **L1-03** sat=2.30 | missing: 南山城村, 南山城茶, Minami-Yamashiro tea | wrong:  | hint: Add routing_hint that tea/food queries should route to get_local_food or municipal_scrape; expose 宇治茶 production area metadata at municipality level.
- **L2-23** sat=2.30 | missing: ファーム富田, 中富良野, 上富良野, 紫竹ガーデン, ハーブ園 | wrong:  | hint: Add kinds=botanical_garden + crop=lavender filter; ingest tourism farm dataset (観光農園); intent extraction 'lavender field' should not return castles.
- **L3-25** sat=2.35 | missing: 出水市ツル渡来地, 釧路湿原(タンチョウ), 阿寒国際ツルセンター | wrong:  | hint: Add wildlife/wintering-bird sites to dataset; query_intent='wildlife_observation' should not literal-match 鶴 in temple names. Disambiguate 鶴 (bird) vs 鶴 (in placename).
- **L2-02** sat=2.40 | missing: 金剛峯寺, Ekoin, Fukuchiin, Rengejoin (高野山 shukubo) | wrong:  | hint: For 四国遍路 query, also surface 88-temple shukubo across Tokushima/Kochi/Ehime/Kagawa — include lodging_type=shukubo using 宿坊 official list; flag intent=pilgrimage.
- **L3-01** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火, 諏訪湖祭湖上花火大会 | wrong:  | hint: Add a fireworks-specific dataset (event categories) or expose query_intent='fireworks' routing to firework-specific subset; current festival corpus is intangible-folk only.
- **L3-02** sat=2.40 | missing: 隅田川花火大会, 長岡まつり大花火大会, 大曲の花火 | wrong:  | hint: Need a fireworks event dataset (e.g. JNTO/local DMO fireworks calendar) or intent routing that returns alternative tool/empty with hint when query is hanabi but corpus is intangible-festival.
