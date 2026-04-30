# Japan Travel MCP — 100-case quality scoring report

> Scored against `docs/quality/TEST_100CASES.md` on 2026-04-30, against the
> dataset cached at `/tmp/jtm-e2e-cache/` (post-fix `08e7977`, pre-multi-
> source-scrape). Body-translation gap is intentionally ignored — English
> body_ja exposure is enough for an LLM client to render the answer.
>
> **All scoring is by Archie (the LLM under test).** Each test case was sent
> to the local MCP server stdio, and the response was reviewed against the
> test corpus's `pass_criteria` column.

## TL;DR

| Level | Pass (=2) | Partial (=1) | Fail (=0) | Sum / Max | % |
|:---|---:|---:|---:|---:|---:|
| **L1** Pinpoint by proper noun | 5 | 10 | 5 | 20 / 40 | 50% |
| **L2** Genre × region | 6 | 8 | 16 | 20 / 60 | 33% |
| **L3** Experience-based abstract | 1 | 11 | 18 | 13 / 60 | 22% |
| **L4** Cultural exploration | 1 | 13 | 6 | 15 / 40 | 38% |
| **Total** | **13** | **42** | **45** | **68 / 200** | **34%** |

**Release thresholds (from `TEST_100CASES.md`):**

| Level | Threshold (score-2 cases) | Actual | Verdict |
|:---|:---:|:---:|:---:|
| L1 | ≥18/20 (90%) | 5/20 (25%) | ❌ FAIL |
| L2 | ≥24/30 (80%) | 6/30 (20%) | ❌ FAIL |
| L3 | ≥21/30 (70%) | 1/30 (3%) | ❌ FAIL |
| L4 | ≥12/20 (60%) | 1/20 (5%) | ❌ FAIL |
| Total | ≥75/100 | 13/100 | ❌ FAIL |

The product is not releasable on this corpus today. The good news: the
failures cluster into ~5 fixable patterns rather than 100 unique problems.

---

## Per-case scores

### L1 — Pinpoint by proper noun

| ID | Lang | Topic | Score | Notes |
|:---|:---|:---|:---:|:---|
| L1-01 | en | 但馬牛 | **2** | Top result, full English, MAFF GI source attributed |
| L1-02 | ar | 但馬牛 | **2** | Same in Arabic, RTL renders correctly |
| L1-03 | en | 南山城村 茶畑 | **2** | Heritage Story "An 800-Year History Walk of Japanese Tea" first; body_ja with 抹茶/煎茶/玉露 history; mentions 南山城村 in related_areas |
| L1-04 | es | 吉田の火祭り | **2** | First result, full Spanish description |
| L1-05 | ja | 中芸ゆず | **0** | Returns 物部ゆず (different yuzu, also Kochi). 中芸地域のゆず is GI #58 but not surfaced |
| L1-06 | zh | 弘前公園 桜 | **0** | get_spots(Aomori, 弘前) → 0 results; Hirosaki has scraped data elsewhere but municipality matcher misses |
| L1-07 | ko | 出雲大社 | **1** | Returns 木更津出雲大社 etc. (branch shrines), main 出雲大社 not in top 5; descriptions all empty |
| L1-08 | fr | 厳島神社 | **1** | 50 hits all named 厳島神社 (no description); query was French but server doesn't translate |
| L1-09 | de | 熊野古道 | **1** | Wakayama Heritage stories returned but Kumano Kodo itself isn't a Heritage Story (it's UNESCO World Heritage, in different dataset) |
| L1-10 | ru | 姫路城 | **0** | search_area("姫路城") → 0. One of Japan's most famous castles, must be in Wikidata. Index gap |
| L1-11 | th | 文楽 | **1** | 文楽 IS in the 183-row dump but not surfaced; Thai descriptions render correctly elsewhere |
| L1-12 | vi | 弓浜絣 | **2** | Returned at item #6 with full Vietnamese description |
| L1-13 | tl | 直島 | **1** | 直島町 + 直島新美術館 + ベネッセアートサイト直島 found; no Tagalog (search_area langs are ja/en/zh/ko only) |
| L1-14 | en | 角館 武家屋敷 | **0** | get_spots(Akita, 角館) → 0. 角館 is part of 仙北市, partial-match doesn't connect |
| L1-15 | id | 尾道 | **1** | 尾道市 found via municipality alias, but spots are all "注目ワード" placeholder titles |
| L1-16 | es | 那智の滝 | **1** | Returns 熊野那智神社, 那智勝浦町, 熊野那智大社 etc. — relevant cluster but not 那智の滝 itself |
| L1-17 | hi | 知床半島 | **0** | search_area("知床") → 0. UNESCO site, must be in Wikidata. Index gap |
| L1-18 | en | 出羽三山 | **1** | 出羽神社 + 出羽三山供養塔 partial matches; 月山 / 羽黒山 / 湯殿山 not in top 5 |
| L1-19 | pt | 屋久島 | **1** | 屋久島町 + 屋久島国立公園 + 屋久島世界遺産センター found; no Portuguese description |
| L1-20 | ko | 佐渡島 | **1** | Niigata Heritage stories shown in Korean but 佐渡島の金山 (UNESCO 2024) not in this dataset |

### L2 — Genre × region

| ID | Lang | Topic | Score | Notes |
|:---|:---|:---|:---:|:---|
| L2-01 | en | 東北 秘湯ranges | **1** | get_hotels(Akita) returns 50 hotels but no "ryokan"/"秘湯" tag filter |
| L2-02 | ja | 四国遍路 宿坊 | **1** | Tokushima hotels include several 旅館 but no "宿坊" tag |
| L2-03 | zh | 北海道 農業体験 | **0** | get_spots(Hokkaido) returns admin pages (補助金情報, 監督処分 etc.) — same issue as Demo 2 spots |
| L2-04 | en | 九州 陶芸窯元 | **2** | Imari-Arita / Karatsu / Hakata-ori returned, exact pottery match |
| L2-05 | ko | 東北 祭り | **2** | 八戸三社大祭 + 青森ねぶた correctly returned, Korean translations clean |
| L2-06 | es | 東北 桜 | **0** | Akita admin pages, no 桜 spots |
| L2-07 | en | 新潟 酒蔵 | **0** | Returns 茶豆 / にんじん / れんこん / 紬 — no sake breweries (sake is not in MAFF GI; out of scope of get_local_specialty) |
| L2-08 | fr | 白馬 スキー場+温泉 | **1** | 白馬村 admin pages (4 entries); no ski/onsen content |
| L2-09 | en | 関西 紅葉 | **0** | Kyoto admin pages dominate (same as 南山城 demo issue) |
| L2-10 | ar | 関西 桜 | **0** | Nara admin pages |
| L2-11 | ja | 沖縄 星空 | **0** | Naha emergency-info pages dominate (50 spots all "いざという時に") |
| L2-12 | th | 北海道 田舎 温泉 | **1** | Hokkaido hotels but no rural/onsen filter — large-city chains dominate |
| L2-13 | vi | 瀬戸内 島々 | **0** | Kagawa generic admin pages |
| L2-14 | en | 徳島 藍染 | **2** | 阿波正藍しじら織 (Awa Shoai Shijira) returned; correct entity for indigo dyeing |
| L2-15 | de | 高野山 宿坊 | **0** | Wakayama hotels but no Mt. Koya / shukubo content |
| L2-16 | en | 武家屋敷 地方 | **2** | 3 results across Fukui / Fukushima / Shimane — correct samurai districts |
| L2-17 | id | 秋田 夏祭り | **2** | 大日堂舞楽 + 角館のお祭り + 土崎神明社祭 correctly returned, Indonesian clean |
| L2-18 | ko | 山陰 漁港 町 | **0** | Shimane admin pages, no fishing village content |
| L2-19 | en | 岐阜 和紙 | **1** | 9 Gifu crafts including 美濃焼 / 飛騨春慶; 美濃和紙 should be in but not in top 5 |
| L2-20 | es | 能登 漁村 | **0** | Ishikawa admin pages |
| L2-21 | en | 砂丘 全国 | **0** | search_area("砂丘") → 0. Huge gap — 鳥取砂丘 etc. should index |
| L2-22 | zh | 山陰 工芸 | **2** | 石見焼 / 石州和紙 / 雲州そろばん / 出雲石燈籠 — Chinese descriptions perfect |
| L2-23 | en | 北海道 ラベンダー | **0** | Hokkaido admin pages |
| L2-24 | tl | 九州 古い町並み | **0** | Oita admin pages; query mistranslation (coffee) not detected |
| L2-25 | ja | 北陸 古民家 | **0** | Ishikawa hotels but no kominka tag |
| L2-26 | en | 紀伊半島 山岳信仰 | **1** | Wakayama Heritage stories partly relevant (鯨 / 和歌の浦 / 紀州湯浅), but 熊野三山 / 高野山 / 玉置 not surfaced |
| L2-27 | en | 日本海 花火 | **1** | UNESCO ICH dominates (大日堂舞楽 / 早池峰 / 川越 etc.); no actual fireworks events |
| L2-28 | en | 大分 竹工芸 | **1** | 別府竹細工 returned correctly, but spillover 博多織 (Fukuoka) suggests prefecture filter is loose for some craft entries |
| L2-29 | en | 四国 サイクリング | **0** | Ehime admin pages (sub-types: 上島町 ferry info, etc.) |
| L2-30 | en | 地方 歌舞伎 | **0** | get_traditional_arts unfiltered → 183-row dump, kabuki not surfaced |

### L3 — Experience-based abstract

| ID | Lang | Topic | Score | Notes |
|:---|:---|:---|:---:|:---|
| L3-01 | en | 花火大会 | **1** | get_festivals nationwide → 81 results, but bunka_intangible covers folk-festivals not summer fireworks specifically |
| L3-02 | ja | 花火大会 | **1** | Same as L3-01 in Japanese |
| L3-03 | en | 雪祭り | **0** | Hokkaido festival filter returns UNESCO ICH (Akita / Iwate / Saitama), nothing about Sapporo Snow Festival |
| L3-04 | zh | 田舎暮らし体験 | **1** | Heritage stories in Chinese — 高岡 / 能登 / 若狭 — somewhat relevant to "rural Japan" but not "agrotourism" |
| L3-05 | ko | 紅葉 | **0** | search_area("紅葉") returns shrine NAMES with 紅葉 character (紅葉八幡宮 etc.), not autumn-foliage spots |
| L3-06 | en | 静かな寺 修行 | **0** | search_area("修行") → 0 |
| L3-07 | es | オーロラ Japan | **0** | search_area("オーロラ") → 0 |
| L3-08 | en | 古民家 宿泊 | **0** | get_hotels(Gifu) returns standard hotels, no kominka filter |
| L3-09 | th | 桜 穴場 | **0** | search_area("桜") returns shrine names with 桜 character — 50 generic |
| L3-10 | en | 絶景 写真 | **0** | search_area("絶景") → 0 |
| L3-11 | ar | 露天風呂 自然 | **0** | search_area("露天風呂") → 0 |
| L3-12 | en | 野生イルカ 体験 | **0** | search_area("イルカ") → 0 — 御蔵島・小笠原 dolphin sites must exist as Wikidata, gap |
| L3-13 | en | 重伝建地区 | **1** | Heritage 104 stories returned — many cover 伝統的建造物群 but no 重伝建-specific filter |
| L3-14 | vi | アイヌ文化 体験 | **0** | search_area("アイヌ") → 0 |
| L3-15 | en | 磨崖仏 | **1** | 2 results (大岩弘法院 / 白山道奥) — relevant but very thin (国東半島 missing) |
| L3-16 | en | 火山 日帰り | **1** | 7 results — 浅間 / 桜島 / 阿蘇 / 畝火山 / 松代 — volcano museums, not hike trailheads |
| L3-17 | id | 寺 豆腐 体験 | **0** | search_area("豆腐") → 0 |
| L3-18 | en | 古い漁港 | **0** | search_area("漁港") → 0 |
| L3-19 | en | 和紙 職人 体験 | **1** | 231 crafts list covers all washi entries but no "experience" filter — 美濃 / 越前 / 土佐 et al. are in there but not surfaced |
| L3-20 | ja | 時代劇ロケ地 | **0** | search_area("宿場") → 0 |
| L3-21 | en | 穴場 ビーチ | **0** | 2 results: 南知多ビーチランド (theme park), 大磯ロングビーチ (resort) — wrong intent |
| L3-22 | en | ローカル 居酒屋 横丁 | **1** | 5 results for "横丁": なにわ食いしんぼ横丁 / 御徒町らーめん横丁 / etc. — partly food-mall, partly real |
| L3-23 | de | ローカル線 観光 | **0** | search_area("ローカル線") → 0 |
| L3-24 | en | ホタル | **1** | 2 firefly-related results (ホタルの里 / 豊田ホタルの里ミュージアム), thin |
| L3-25 | ru | ツル 越冬 | **1** | 50 鶴 hits but mostly placenames (鶴舞 / 鶴田町) — 丹頂鶴自然公園 in Aomori found, Kushiro 釧路湿原 missing |
| L3-26 | en | 宿坊 体験 | **0** | search_area("宿坊") → 0 |
| L3-27 | en | 温泉街 浴衣 | **1** | 50 onsen results in Wikidata format; no 浴衣-walkable specific filter |
| L3-28 | fr | クジラ ホエールウォッチング | **0** | 1 result: 道徳公園クジラ池噴水 (a fountain — wrong) |
| L3-29 | en | 茶道 本格 体験 | **2** | Tea Heritage Story (800-year) + body_ja with 茶道 / 茶の湯 / 通圓茶屋 — substantive |
| L3-30 | en | ローカル線 山村 | **0** | search_area("ローカル") → 0 |

### L4 — Cultural exploration

| ID | Lang | Topic | Score | Notes |
|:---|:---|:---|:---:|:---|
| L4-01 | en | 伝統食 知られざる | **1** | Full 507-row MAFF GI list returned in English, no "non-mainstream" filter |
| L4-02 | ja | L4-01の日本語版 | **1** | Same in Japanese |
| L4-03 | en | 失われゆく職人技 | **0** | get_traditional_arts dump, no "forgotten/dying" filter |
| L4-04 | en | 浮世絵風景 | **0** | search_area("富士") → 50 富士-named shrines, not Hokusai-print landscapes (三保の松原 etc.) |
| L4-05 | en | UNESCO 知られざる | **1** | 104 Heritage stories — 富岡製糸場 / 石見銀山 / 百舌鳥古市古墳群 are in there but no "lesser-known" filter |
| L4-06 | en | 縄文文化 現代 | **1** | 18 縄文 results — 三内丸山 / 是川 / 小石 等 museums (correct entities, but they're museums not "still influencing daily life") |
| L4-07 | zh | 発酵食 全国 | **1** | Full food list in Chinese, fermented entries (味噌 / 醤油 etc.) included but no fermentation-specific filter |
| L4-08 | en | 山岳信仰 シャーマン | **0** | get_traditional_arts dump |
| L4-09 | en | 戦争遺跡 日常 | **1** | 13 原爆-related Hiroshima memorial entries — relevant cluster |
| L4-10 | en | 工芸の町 | **1** | 231 crafts list — 燕三条 / 関 / 有田 are entities, but no "craft town" framing |
| L4-11 | en | 産業遺産 | **1** | 1 result: 富岡製糸場と絹産業遺産群 — exactly correct entity but only one |
| L4-12 | ko | 宗教多様性 | **1** | Heritage stories in Korean — 教育 / 信仰 / 神道 themes touched |
| L4-13 | en | 消えゆく祭り | **0** | get_festivals dump, no "dying" filter |
| L4-14 | en | 震災復興 沿岸 | **2** | 16 震災 results: 浪江町立請戸小学校, 東日本大震災伝承館, 神戸震災メモリアルパーク — relevant Hiroshima/Fukushima/Hyogo memorials |
| L4-15 | en | 擬洋風建築 | **0** | search_area("擬洋風") → 0 |
| L4-16 | en | 隠れキリシタン | **1** | Nagasaki Heritage stories: 国境の島 (Iki/Tsushima/Goto), 鎮守府 (Sasebo) — partially relevant but no "hidden Christian" specific |
| L4-17 | en | 庭園 知られざる | **1** | 50 garden entries in Wikidata, real gardens but no "lesser-known" filter |
| L4-18 | en | 染色 伝統技法 | **1** | 231 crafts include 紅型 / 絞り / 藍染 entries but no "dyeing" subfilter |
| L4-19 | en | 街道 宿場町 | **0** | search_area("宿場") → 0 |
| L4-20 | en | 巡礼 88以外 | **1** | Heritage stories include 西国33 (1300年つづく日本の終活の旅) — partial |

---

## Failure patterns (root-cause clusters)

The 87 sub-perfect cases (45 fail + 42 partial) cluster into 5 patterns.
Fix the patterns and the score should jump dramatically.

### Pattern A — `search_area` is name-substring only, not topic search [33+ cases]

`search_area` matches the literal `q` against entity name fields. So:
- Query "桜" returns shrine NAMES containing 桜 (桜天神社 etc.), not 桜-viewing spots
- Query "観光" / "修行" / "オーロラ" / "アイヌ" / "宿坊" / "宿場" returns 0 because those words don't appear in entity names
- Query "鶴" returns 鶴舞公園 (Aichi placename), not 釧路湿原 cranes

**Affected**: L3-05 / L3-06 / L3-07 / L3-09 / L3-10 / L3-11 / L3-12 / L3-14 / L3-17 / L3-18 / L3-20 / L3-22 / L3-23 / L3-26 / L3-27 / L3-30 / L4-04 / L4-15 / L4-19 (~19 cases)

### Pattern B — `get_spots` returns city-office admin pages, not tourism content [16+ cases]

The municipal scrape's BFS hits city-hall front pages first; `get_spots`
returns whatever the BFS found, sorted by URL hit order. Many municipalities
have city-office news ("補助金情報", "新着情報", "観光振興", "市民生活と観光の調和")
dominating before any actual spot.

**Affected**: L2-03 / L2-06 / L2-09 / L2-10 / L2-11 / L2-13 / L2-18 / L2-20 / L2-23 / L2-24 / L2-29 / L3-08 (~12 cases)

**Multi-source scrape (in progress) directly addresses this** — adding tourism-org URLs as alternative seeds and harvesting `body_paragraphs` will surface real spots over admin pages.

### Pattern C — Aggregator tools (get_festivals / get_traditional_arts / get_local_food) lack sub-filters [12 cases]

Without `prefecture` or finer filter, these tools dump all 81/183/507/231/104
entries unsorted. LLM client gets overwhelmed and the natural top-5 the
tool surfaces don't match the query intent.

Examples:
- `get_festivals(lang=en)` → 81 results, all bunka_intangible folk festivals
  (no fireworks-specific subfilter)
- `get_traditional_arts(lang=en)` → 183 results mixing Noh, festivals,
  crafts (no "kabuki" or "shamanic" subfilter)
- `get_local_food(lang=en)` → 507 MAFF GI rows (no "fermented" or
  "lesser-known" subfilter)

**Affected**: L1-11 / L2-30 / L3-01 / L3-02 / L3-03 / L3-13 / L3-19 / L4-01 / L4-02 / L4-03 / L4-08 / L4-10 / L4-13 / L4-18 (~14 cases)

### Pattern D — Wikidata index gaps for major attractions [5+ cases]

search_area returns 0 for several A-tier attractions:

- L1-10 姫路城 (UNESCO World Heritage)
- L1-17 知床 (UNESCO Natural Heritage)
- L2-21 砂丘 (鳥取砂丘 = top-5 famous)
- L1-06 弘前 has no scraped spots (not necessarily a Wikidata gap, but exposed by the pinpoint test)

These should be in the 41,000-entity Wikidata layer. Either:
(a) the entity exists but the name field doesn't contain the search string,
(b) the entity is missing from `wikidata_attractions.json`, or
(c) the load path doesn't index it.

### Pattern E — `prefecture` filter on bunka_intangible / unesco_japan is text-match only [8+ cases]

The fix in `08e7977` added text-match prefecture filter to bunka, but UNESCO
ICH stays unfiltered (deliberately — those are national-level). When the
caller asks for "Hokkaido festivals", they get 36 entries dominated by
UNESCO ICH from other prefectures, plus a thin tail of bunka entries that
mention 北海道 in their description.

**Affected**: L2-05 (paradoxically passed — Aomori bunka is rich), L2-17,
L2-27, L3-03 (~4 cases where pref-filter is too lenient on UNESCO ICH).

The trade-off here is real: hide UNESCO ICH and visitors lose national
context; show it and the prefecture-specific results get drowned. Right
fix: split the response into `prefecture_specific` and `national_unesco`
sections so the caller can use both clearly.

---

## Prioritised fix list

### P0 — Blocking release

1. **Fix `search_area` to do topic search, not just name-substring**
   - Add a synonym/concept layer: "桜" → tag `cherry-blossom` matching entities tagged with this; "観光" → tag `tourism-attraction` filter; etc.
   - OR: query the description field too, not just name (lots of entities have 観光 in description but not name)
   - Cheapest first: also match against `description` field if present, and lowercase-fold the query
   - Better: add an `experience_tags: string[]` field to spots / heritage / festivals, populated from a curated keyword → tag map at scrape time
   - This single change probably moves ~20 cases from 0 to 1 or 2

2. **Boost `get_spots` real-tourism content over admin pages**
   - Multi-source scrape (in progress) will help by adding tourism-org seeds and body_paragraphs
   - Additionally: add a `quality_score` field at scrape time (already implemented in `quality_report.ts`) and SORT spots by score in `get_spots` response, so admin-page placeholders sink to the bottom
   - Add a `min_quality` parameter to `get_spots` so callers can filter out the noise
   - This moves ~12 cases from 0 to 1 or 2

### P1 — Strong improvement

3. **Add sub-filters to aggregator tools**
   - `get_festivals` — add `keyword` (花火, 雪, 火 etc.) and `season` (winter/summer)
   - `get_traditional_arts` — add `category` filter (kabuki / noh / kagura / dance / shamanic)
   - `get_local_food` — add `keyword` (fermented / soy-sauce / sake) and `is_designated` flag
   - This moves ~14 cases from 0 or 1 to 1 or 2

4. **Investigate and patch Wikidata gaps for A-tier attractions**
   - Confirm 姫路城, 知床, 鳥取砂丘 entities are in `wikidata_attractions.json`
   - If yes: fix indexing (search_area should match Q-id or any name field)
   - If no: backfill from a Wikidata SPARQL query
   - This moves ~5 cases from 0 to 1 or 2

5. **Multilingual fallback for non-ja/en/zh/ko `search_area` queries**
   - Translate query through Wikidata sitelinks (`fr` query → look up the Wikidata entity's `fr` label, then match)
   - For ar/hi/th/etc. without sitelinks: fall back to name-substring match in any language plus ja
   - This moves ~5 cases from 1 to 2

### P2 — Curation-layer goodness

6. **Add `experience_tags` schema** for L4-style queries
   - Tags: `dying-tradition`, `industrial-heritage`, `religious-diversity`, `tsunami-recovery`, `meiji-architecture` etc.
   - Backfill from MAFF / METI / 文化庁 categories where possible; manual curation for the rest
   - This is what KJ explicitly called out as the project's signature — without it L4 plateaus at ~30%

7. **Differentiate UNESCO-ICH vs prefecture-specific in `get_festivals` response**
   - Split into `local_festivals: []` and `national_unesco_inscriptions: []`
   - Or add a `national: bool` flag and let callers filter

---

## What's already good (do not regress)

- L1-01..04: Tajima beef / Yoshida fire festival / Tea heritage all work end-to-end across English / Spanish / Arabic
- L2-04, L2-14, L2-22: METI craft data is rich and translates cleanly into 17 langs
- L2-16, L2-17, L2-05: bunka_intangible prefecture filter (post-08e7977 fix) catches Tohoku festivals correctly
- L3-29: Tea ceremony heritage hit at full strength via `get_japan_heritage`
- L4-14: Disaster recovery has good Wikidata coverage
- All Arabic / Korean / Chinese / Vietnamese / Indonesian / Thai outputs render correctly when the entity is found

---

## Next actions (pre-release)

1. Wait for BATCH=2 (in progress, JIS 16-32) and BATCH=3 (next) to complete, then re-run the full enriched scrape — this directly addresses Pattern B
2. Implement Pattern A fix (add description-field match to `search_area`) — small TS change, biggest L3/L4 lift
3. Implement Pattern C fix (sub-filters on aggregators) — adds keyword arg + filter pass
4. Re-run this 100-case test corpus and confirm we hit ≥75/100

These four steps should push the total score from 13% to ~60-70%. Reaching
the 75/100 release threshold realistically requires P2 (experience_tags),
which is a curation project, not a code project.
