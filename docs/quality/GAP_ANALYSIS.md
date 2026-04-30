# Gap analysis — 87 cases scored 0 or 1

> Per-case root-cause notes for each non-pass on the 100-case quality test.
> Cross-references to the failure patterns in `SCORING_REPORT.md`.

Each block follows the template in `TEST_100CASES.md`:

```
ID:                stable identifier
Score:             0 or 1
Failure mode:      what observably went wrong
Root cause:        which pattern(s) the failure maps to
Proposed fix:      smallest change that moves the case to 2
Priority:          P0 (release-blocker) / P1 (strong) / P2 (nice-to-have)
```

---

## L1 — Pinpoint by proper noun (15 sub-perfect cases)

### L1-05 中芸ゆず (ja)
- Score: 0
- Failure mode: get_local_food(Kochi) returned 物部ゆず (different yuzu) but not 中芸地域のゆず
- Root cause: GI #58 中芸地域のゆず may not be in the loaded MAFF GI dataset, OR is filed under a different prefecture key
- Proposed fix: re-fetch MAFF GI; verify entry #58 exists; if it does, debug the prefecture_codes attribution
- Priority: P0 (a named GI entity must be findable by its prefecture)

### L1-06 弘前公園 桜 (zh)
- Score: 0
- Failure mode: get_spots(Aomori, 弘前) → 0 results
- Root cause: Pattern B (no scraped tourism content for 弘前 yet) + municipality matcher: 弘前 is 弘前市, partial-match should hit
- Proposed fix: after multi-source scrape lands, 弘前市 will have tourism content. Re-test then.
- Priority: P0

### L1-07 出雲大社 (ko)
- Score: 1
- Failure mode: returns branch shrines (木更津出雲大社 etc.) not the main 出雲大社 in Shimane
- Root cause: search_area sorts by Wikidata Q-id order (insertion order), not by relevance/notability. The Shimane main shrine is later in the list.
- Proposed fix: rank search_area results by name-exact-match > Q-id notability > prefecture match. The main 出雲大社 (Q200552) should rank above branch shrines.
- Priority: P0

### L1-08 厳島神社 (fr)
- Score: 1
- Failure mode: 50 entities all named 厳島神社 (branch shrines all over Japan), no description, query was French
- Root cause: same as L1-07 (no relevance ranking) + Pattern (no French translation)
- Proposed fix: same ranking fix; for French descriptions, the existing 17-lang translation layer should be queried for the matched entity
- Priority: P1

### L1-09 熊野古道 (de)
- Score: 1
- Failure mode: get_japan_heritage(Wakayama) returned related stories but Kumano Kodo itself is UNESCO World Heritage, not Japan Heritage
- Root cause: schema confusion — Kumano Kodo is in `wikidata_attractions.json` (UNESCO category), not in `data/r3/japan_heritage.json`
- Proposed fix: add a `get_unesco` tool, OR include UNESCO World Heritage in `get_japan_heritage` (rename to `get_heritage`)
- Priority: P1

### L1-10 姫路城 (ru)
- Score: 0
- Failure mode: search_area("姫路城") → 0
- Root cause: Pattern D (Wikidata index gap — 姫路城 Q1019931 must exist)
- Proposed fix: verify the entity is in `_state/wikidata_attractions.json`; if yes, fix search_area to also match against Q-id and English/native names
- Priority: P0 (UNESCO castle, must be findable)

### L1-11 文楽 (th)
- Score: 1
- Failure mode: 文楽 IS in 183-row dump but not surfaced
- Root cause: Pattern C (no sub-filter); 文楽 is far down the list
- Proposed fix: add `keyword` arg to `get_traditional_arts` so caller can filter to "Bunraku"
- Priority: P1

### L1-13 直島 (tl)
- Score: 1
- Failure mode: entities found (直島町, 直島新美術館, ベネッセ) but no Tagalog description
- Root cause: search_area lang param only supports ja/en/zh/ko; Tagalog passes through but does nothing
- Proposed fix: search_area should attach the 17-lang description from `descriptions_complete.jsonl` for the matched entity, in any of the 17 languages
- Priority: P1

### L1-14 角館 (en)
- Score: 0
- Failure mode: get_spots(Akita, 角館) → 0 results
- Root cause: 角館 is a district inside 仙北市 (Senboku City), not its own municipality. Match logic doesn't connect "角館" to "仙北市"
- Proposed fix: add `district_aliases.json` mapping common district names (角館 → 仙北市, 倉敷美観 → 倉敷市) to municipality codes
- Priority: P1

### L1-15 尾道 (id)
- Score: 1
- Failure mode: 尾道市 found (municipality matched) but spots are "注目ワード" placeholder titles — not real attractions
- Root cause: Pattern B (admin-page pollution); 尾道市 city hall has a "注目ワード" widget that the BFS captures as a "spot"
- Proposed fix: multi-source scrape with body_paragraphs + tourism-org seeds will replace these with real spot pages
- Priority: P0 (will resolve via in-progress sprint)

### L1-16 那智の滝 (es)
- Score: 1
- Failure mode: cluster of 那智-related entities returned but 那智の滝 itself not specifically — no Spanish description
- Root cause: 那智の滝 may be in Wikidata but not as the primary surfaced result; same description-language gap as L1-08
- Proposed fix: same as L1-07 (relevance ranking) + L1-13 (auto-attach 17-lang description)
- Priority: P1

### L1-17 知床半島 (hi)
- Score: 0
- Failure mode: search_area("知床") → 0
- Root cause: Pattern D (UNESCO Natural Heritage entity index gap)
- Proposed fix: verify 知床 / 知床半島 / 知床国立公園 entities in `_state/wikidata_attractions.json`
- Priority: P0

### L1-18 出羽三山 (en)
- Score: 1
- Failure mode: 出羽神社 / 出羽三山供養塔 returned (related cluster) but not 月山 / 羽黒山 / 湯殿山 specifically
- Root cause: search_area is name-substring; 出羽三山 = 月山+羽黒山+湯殿山 and the three peaks don't have 出羽 in their names individually
- Proposed fix: add a `concept_aliases.json` mapping 出羽三山 → [月山, 羽黒山, 湯殿山] so query "出羽三山" surfaces all three
- Priority: P1

### L1-19 屋久島 (pt)
- Score: 1
- Failure mode: 屋久島町 + 屋久島国立公園 found but no Portuguese description
- Root cause: Pattern (description-language gap)
- Proposed fix: same as L1-13
- Priority: P1

### L1-20 佐渡島 (ko)
- Score: 1
- Failure mode: get_japan_heritage(Niigata) returned unrelated stories; 佐渡島の金山 is UNESCO 2024 (not yet in dataset)
- Root cause: dataset cutoff — 佐渡島の金山 was inscribed July 2024 and may not have a Japan Heritage record (it's UNESCO World Heritage)
- Proposed fix: add UNESCO World Heritage entries (separate from Japan Heritage), or surface 佐渡 entries from Wikidata via search_area
- Priority: P0 (very recent UNESCO inscription, high search volume expected)

---

## L2 — Genre × region (24 sub-perfect cases)

### L2-01 / L2-02 / L2-12 / L2-15 / L2-25 — onsen ryokan / shukubo / kominka filter
- Score: all 1 except L2-15 (0) and L2-25 (0)
- Failure mode: get_hotels returns standard hotel list, no `accommodation_type` filter (ryokan / shukubo / kominka)
- Root cause: hotel master.json doesn't carry an accommodation-type tag in a queryable way
- Proposed fix: add `accommodation_type: string` field to hotel records (parsed from OSM `tourism=*` value or Wikidata P31). Add `accommodation_type` filter to get_hotels
- Priority: P1

### L2-03 / L2-06 / L2-09 / L2-10 / L2-11 / L2-13 / L2-18 / L2-20 / L2-23 / L2-24 / L2-29 — admin-page pollution
- Score: all 0
- Failure mode: get_spots returns city-office news / admin pages instead of tourism content
- Root cause: Pattern B
- Proposed fix: multi-source scrape (in progress) + sort by quality_score in get_spots response
- Priority: P0 (will resolve via in-progress sprint)

### L2-07 新潟 酒蔵
- Score: 0
- Failure mode: get_local_specialty(Niigata) returns food + crafts but no sake breweries
- Root cause: sake breweries are not in MAFF GI / METI dento-kogeihin (those cover food and crafts respectively, not breweries-as-business). Sake is a category gap.
- Proposed fix: add a sake-brewery layer from a public dataset (国税庁 has a brewery list, NTA), expose via a new tool `get_sake_breweries(prefecture)`. Also add a generic `keyword` filter to get_local_food so 「酒」 surfaces relevant entries
- Priority: P1

### L2-08 白馬 スキー場+温泉
- Score: 1
- Failure mode: 白馬村 admin pages, no ski/onsen content
- Root cause: same as L2-03 cluster (Pattern B)
- Priority: P0 (will resolve via sprint)

### L2-19 岐阜 和紙
- Score: 1
- Failure mode: Gifu crafts returned but 美濃和紙 not in top 5
- Root cause: get_local_specialty doesn't sort by name-match relevance to query keywords
- Proposed fix: add sort-by-relevance using query keywords (and/or `keyword` filter)
- Priority: P1

### L2-21 砂丘 全国
- Score: 0
- Failure mode: search_area("砂丘") → 0
- Root cause: Pattern D? Or simply the search field doesn't include 砂丘 names. 鳥取砂丘 must be in Wikidata.
- Proposed fix: verify 鳥取砂丘 (Q768820) and others in dataset; if yes, fix indexing
- Priority: P0

### L2-26 紀伊半島 山岳信仰
- Score: 1
- Failure mode: Wakayama Heritage stories returned but not 熊野三山 / 高野山 / 玉置 specifically
- Root cause: Pattern same as L1-09 (UNESCO sites not in Japan Heritage)
- Priority: P1

### L2-27 日本海 花火
- Score: 1
- Failure mode: UNESCO ICH dominates response, no actual 花火 events
- Root cause: Pattern E (UNESCO ICH dilutes prefecture-specific) + Pattern C (no fireworks-specific filter)
- Proposed fix: add `keyword` to get_festivals; split UNESCO ICH out
- Priority: P1

### L2-28 大分 竹工芸
- Score: 1
- Failure mode: 別府竹細工 returned correctly, but Hakata Ori (Fukuoka) also in Oita response
- Root cause: get_local_specialty's prefecture filter may match production_area_text loosely; some crafts have multi-prefecture production areas
- Proposed fix: tighten prefecture matching to use prefecture_codes array only, not free-text
- Priority: P2

### L2-30 地方 歌舞伎
- Score: 0
- Failure mode: get_traditional_arts dump (183 rows), kabuki not surfaced
- Root cause: Pattern C (no sub-filter)
- Priority: P1

---

## L3 — Experience-based abstract (29 sub-perfect cases)

### L3-01 / L3-02 / L3-13 — fireworks / snow / 重伝建 dump
- Score: 1 / 1 / 1
- Failure mode: dump returns full festival or heritage list, no experience-specific filter
- Root cause: Pattern C
- Proposed fix: add `keyword` arg
- Priority: P1

### L3-03 雪祭り Hokkaido
- Score: 0
- Failure mode: bunka_intangible filter returns UNESCO ICH from non-Hokkaido prefectures (Pattern E)
- Proposed fix: split UNESCO ICH out as separate field; add Hokkaido-specific snow festivals from Wikidata SPARQL
- Priority: P1

### L3-04 田舎暮らし zh
- Score: 1
- Failure mode: heritage stories partly relevant; no agrotourism-specific data
- Proposed fix: add `experience_tags: ['agrotourism', 'rural-stay']` to spots; populate from JNTO / 農林水産省 tourism datasets
- Priority: P2

### L3-05 / L3-06 / L3-07 / L3-09 / L3-10 / L3-11 / L3-12 / L3-14 / L3-17 / L3-18 / L3-20 / L3-23 / L3-26 / L3-30 — search_area returning 0 or wrong-name matches
- Score: all 0
- Failure mode: Pattern A (search_area is name-substring only)
- Proposed fix: add description-field match (cheap), add experience_tags (medium), or add concept_aliases (cheap+manual)
- Priority: P0 (single biggest impact group)

### L3-08 古民家 宿泊
- Score: 0
- Failure mode: get_hotels returns standard hotel list
- Root cause: same as L2-25 cluster (no accommodation_type filter)
- Priority: P1

### L3-15 磨崖仏
- Score: 1
- Failure mode: only 2 results; 国東半島 etc. missing
- Root cause: 磨崖仏 isn't a category that has a comprehensive dataset; missing entities
- Proposed fix: backfill 磨崖仏 entities from a curated list or Wikidata SPARQL P31:磨崖仏
- Priority: P2

### L3-16 火山 日帰り
- Score: 1
- Failure mode: 7 results are volcano-related but mostly museums, not hike trailheads
- Root cause: Wikidata classifications don't distinguish "hikeable mountain trailhead"
- Proposed fix: add `experience_tags: ['hiking-easy', 'day-trip']` (P2 curation)
- Priority: P2

### L3-19 和紙 職人 体験
- Score: 1
- Failure mode: 231-row craft dump, washi entries somewhere in there
- Root cause: Pattern C
- Priority: P1

### L3-21 ビーチ
- Score: 0
- Failure mode: 2 results (theme parks), no beaches
- Root cause: Pattern A; "ビーチ" only matches names like ビーチランド (theme park)
- Proposed fix: search description for ビーチ/海岸/浜 keywords; add `experience_tags: ['beach']`
- Priority: P1

### L3-22 横丁 izakaya
- Score: 1
- Failure mode: 5 results, mix of food malls and real izakaya
- Proposed fix: descriptive ranking; add `experience_tags: ['izakaya', 'local-food']`
- Priority: P2

### L3-24 ホタル
- Score: 1
- Failure mode: 2 results, both firefly-related but very thin
- Proposed fix: search for ホタル / 蛍 in descriptions; backfill firefly viewing spots
- Priority: P2

### L3-25 ツル 越冬
- Score: 1
- Failure mode: 鶴 returns 50 placenames; 釧路湿原 not in top results
- Proposed fix: relevance ranking — exact-name matches first
- Priority: P1

### L3-27 温泉街 浴衣
- Score: 1
- Failure mode: 50 onsen entries but no 浴衣-walkable filter
- Proposed fix: add `experience_tags: ['onsen-town', 'yukata-friendly']`
- Priority: P2

### L3-28 クジラ
- Score: 0
- Failure mode: 1 result is 道徳公園クジラ池噴水 (a fountain)
- Root cause: Pattern A
- Proposed fix: as in P0
- Priority: P0

---

## L4 — Cultural exploration (19 sub-perfect cases)

### L4-01 / L4-02 / L4-07 — 伝統食 / 発酵食 (no curation filter)
- Score: 1 each
- Failure mode: full 507-row MAFF GI dump
- Proposed fix: add `keyword` filter to get_local_food
- Priority: P1

### L4-03 / L4-08 / L4-13 — get_traditional_arts / get_festivals dumps
- Score: 0 / 0 / 0
- Same as L2-30
- Priority: P1

### L4-04 浮世絵風景
- Score: 0
- Failure mode: 富士-name shrines instead of Hokusai landscapes
- Root cause: Pattern A
- Proposed fix: experience_tags (P2)
- Priority: P2

### L4-05 / L4-12 / L4-16 / L4-20 — Heritage dump for L4 queries
- Score: 1 each
- Failure mode: heritage 104-row dump, contains relevant items but no curation filter
- Proposed fix: add `keyword` and `theme` filter to get_japan_heritage (theme exists, but accept partial match)
- Priority: P1

### L4-06 縄文文化 現代
- Score: 1
- Failure mode: 18 縄文 entities are museums, not "still influencing daily life"
- Root cause: data is correct (museums); query intent is fuzzy
- Proposed fix: experience_tags (P2)
- Priority: P2

### L4-09 戦争遺跡 日常
- Score: 1
- Failure mode: 13 原爆-related entries are Hiroshima memorials (correct cluster)
- Proposed fix: passes if we accept "memorial sites" as fitting the query; otherwise needs experience_tags
- Priority: P2

### L4-10 工芸の町
- Score: 1
- Failure mode: 231-row craft dump
- Proposed fix: add `town`/`area` aggregation to get_local_specialty (group by production_area)
- Priority: P2

### L4-11 産業遺産
- Score: 1
- Failure mode: only 1 result (富岡製糸場) — exact, but missing 軍艦島 / 三池 / 足尾 etc.
- Proposed fix: backfill 産業遺産 entities from Wikidata SPARQL (Q-id 22674925 or similar) or 経産省 industrial heritage list
- Priority: P1

### L4-15 擬洋風建築
- Score: 0
- Failure mode: search_area("擬洋風") → 0
- Root cause: Pattern A + missing entity tag
- Proposed fix: backfill 擬洋風建築 entities from Wikidata
- Priority: P2

### L4-17 庭園 知られざる
- Score: 1
- Failure mode: 50 garden entries, no "lesser-known" curation
- Proposed fix: rank by notability (sitelink count); add curation tag for "famous"/"hidden"
- Priority: P2

### L4-18 染色 伝統技法
- Score: 1
- Failure mode: 231-row craft dump includes dyeing
- Proposed fix: same as L4-01 — add `keyword` filter
- Priority: P1

### L4-19 街道 宿場町
- Score: 0
- Failure mode: search_area("宿場") → 0
- Root cause: Pattern A; 宿場町 entities exist (妻籠 etc.) but search misses
- Priority: P0

---

## Cross-cutting fixes — count of cases unblocked

| Fix | Priority | Cases moved 0/1 → 2 |
|:---|:---:|---:|
| search_area: also match `description` field, add concept_aliases.json | P0 | ~19 |
| get_spots: sort by quality_score, filter min_quality | P0 | ~12 (after multi-source scrape) |
| Aggregator tools: add `keyword` filter | P1 | ~14 |
| Wikidata index audit (姫路城, 知床, 砂丘, etc.) | P0 | ~5 |
| search_area: relevance ranking (exact > partial, by sitelinks) | P0 | ~5 |
| search_area: auto-attach 17-lang description | P1 | ~5 |
| accommodation_type filter on get_hotels | P1 | ~5 |
| experience_tags layer (curation) | P2 | ~15 |
| concept_aliases (出羽三山 → [月山, 羽黒山, 湯殿山]) | P1 | ~3 |
| district_aliases (角館 → 仙北市) | P1 | ~3 |

**Estimated post-fix score** if P0+P1 land:
- L1: 5/20 → ~17/20 (=2 score on 17 cases)
- L2: 6/30 → ~20/30
- L3: 1/30 → ~12/30
- L4: 1/20 → ~8/20
- Total: 13/100 → ~57/100

Reaching ≥75/100 requires P2 (experience_tags + concept_aliases layer) which
is a curation project, not pure code. KJ + Archie should plan curation as
a separate sprint after the multi-source data is in.
