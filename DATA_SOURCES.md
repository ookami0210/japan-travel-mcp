# Data Sources — japan-travel-mcp

> **THE RULE (one sentence)**:
> _Any PR that adds, modifies, or removes a data source MUST update this
> file AND pass `npm run validate:data-sources` (CI green) before it is
> allowed to merge._

That rule is enforced by [`scripts/validate_data_sources.ts`](scripts/validate_data_sources.ts)
running automatically on every PR via
[`.github/workflows/validate-data-sources.yml`](.github/workflows/validate-data-sources.yml).
The PR template ([`.github/pull_request_template.md`](.github/pull_request_template.md))
shows the per-channel checklist when you open the PR.

If you're hitting a CI failure on this validator, read the error
message — it points exactly at what's out of sync (fetcher file ↔ this
MD ↔ `r3_refresh.ts` ↔ workflow yml).

---

This is the **single source of truth** for what data is fetched, from where,
under what license, with what cadence, and into what file. Every fetcher
implementation MUST be registered here. Every rotation scheduler reads from
here to plan its work.

If a source is not listed here, **it is not being fetched**. If you think
something should be fetched but isn't here, propose adding it via a PR
that updates this document AND lands the fetcher.

Companion docs:
- [`DATA_POLICY.md`](DATA_POLICY.md) — what we collect / robots.txt / 30-day SLA
- [`docs/EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md) — content principle (公式の積み上げ)
- [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md) — scraper rotation design

## Conventions

- **Status**:
  - `active` — fetcher implemented AND wired to a rotation channel (running
    in some venue: local cold-start or gh-actions steady)
  - `scaffolded` — fetcher file exists in scrapers/ but rotation wiring
    not yet done (no records produced yet, awaiting completion). Validator
    accepts it without channel/rotation registration.
  - `planned` — agreed but not implemented (no fetcher file yet)
  - `deprecated` — legacy, not running

- **Cadence (steady)**: the steady-state refresh rate this source SHOULD
  run at when in normal operation. Each source has a single canonical
  cadence regardless of where it currently runs.

- **Execution venue (current)**: where the source CURRENTLY runs. Two modes:
  - **local** — one-shot run on the operator's machine, used during the
    cold-start / bootstrap phase to populate the corpus quickly without
    incurring GitHub Actions runtime
  - **gh-actions** — scheduled run via GitHub Actions (the steady mode)

  Source identity and steady cadence are unchanged across modes; only the
  execution venue differs. A source migrates from `local` → `gh-actions`
  when the corresponding workflow is enabled.

- **License**: per the project data principle, public information from
  official bodies (政府機関 / 自治体 / 公式団体) is in scope even when no
  explicit open license is stated, with takedown-on-request as the
  operating contract. CC0 / CC BY 4.0 / ODbL / 政府標準利用規約 are
  preferred when available. Listed for traceability.

- **Coverage**: how many records currently in master / target

## Master rotation contract (= steady channels)

Every active source MUST be assigned to exactly one of the following
steady channels. The channel defines the eventual GH Actions workflow + cadence.
Currently several sources run via local one-shot during cold-start —
they are still in this table and graduate to GH Actions when the
corresponding workflow flips ON.

| Channel | Workflow (steady) | Cadence | Current venue | Sources |
|:---|:---|:---|:---|:---|
| **MUNI** | `scrape.yml` (legacy) / `steady-scrape.yml` (next) | daily cron 03:00 JST, 65-130 munis/day, 30-day SLA | gh-actions (legacy ON) | #23 |
| **R3** | `r3_refresh.ts` (chained after MUNI) | weekly per-source rotation (Mon/Tue/Wed/Thu) | gh-actions (chained) | #5–9 |
| **DMO** | `scrape_dmo_websites` (chained) | bi-weekly | gh-actions (chained) | #10–13 |
| **WD-FOUNDATION** | (no workflow yet — planned) | monthly+ | local (cold-start) | #1–4, #15–19 |
| **GLOSSARY** | (no workflow yet — planned) | monthly+ | local (cold-start) | #20–22 |
| **WIKIPEDIA-ABSTRACT** | (planned) | monthly+ | local (cold-start, planned) | #P1 |
| **EVENTS** | (planned) | weekly during seasons | local (cold-start, planned) | #P4, #P10, #P14 |
| **SEASONAL** | (planned) | weekly during seasons | gh-actions (planned) | #P9 |

If a source has no channel yet, it is `planned`. Implementing a fetcher
requires either extending an existing channel or creating a new one.

---

## Master source list

### Government registries (中央)

#### #1 — 全国地方公共団体コード (master municipality list)
- **Authority**: 総務省 (Ministry of Internal Affairs and Communications)
- **URL**: https://www.soumu.go.jp/denshijiti/code.html (XLSX)
- **License**: public domain
- **Fetcher**: `scrapers/sources/fetch_municipalities.ts`
- **Output**: `data/_state/municipalities.json`
- **Cadence**: monthly (rare changes)
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: 1,938 munis (47 prefs × all sub-units)
- **Status**: `active`

#### #2 — Municipality centroid coordinates
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql (P625 for muni Q-IDs)
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_municipality_centroids.ts`
- **Output**: `data/_state/municipality_centroids.json`
- **Cadence**: monthly
- **Channel**: WD-FOUNDATION
- **Coverage**: 1,938 munis
- **Status**: `active`

#### #3 — Official municipal / prefectural URLs
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql (P856 official site)
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_official_urls.ts`
- **Output**: `data/_state/official_urls.json`
- **Cadence**: monthly
- **Channel**: WD-FOUNDATION
- **Coverage**: 1,938 munis + 47 prefs
- **Status**: `active`

#### #4 — Tourism organization URLs (auto-discovery)
- **Authority**: Each municipality / prefecture (公式観光協会)
- **URL**: search-engine driven discovery
- **License**: 公式機関 (license per site, see DATA_POLICY)
- **Fetcher**: `scrapers/sources/discover_tourism_orgs.ts`
- **Output**: `data/_state/tourism_org_urls.json`
- **Cadence**: quarterly (URL drift slow)
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: ~85% of munis with discovered tourism org
- **Status**: `active`

### Cultural designation programs (公式登録/認定制度)

#### #5 — 農林水産省 地理的表示 (MAFF GI)
- **Authority**: 農林水産省
- **URL**: https://www.maff.go.jp/j/shokusan/gi_act/register/
- **License**: 政府標準利用規約 2.0 (= CC BY 4.0 互換)
- **Fetcher**: `scrapers/sources/fetch_maff_gi.ts`
- **Output**: `data/r3/maff_gi.json`
- **Cadence**: weekly (Mon)
- **Channel**: R3
- **Coverage**: 172 records
- **Status**: `active`

#### #6 — 経済産業省 伝統的工芸品 (METI Densan)
- **Authority**: 経済産業省
- **URL**: https://kougeihin.jp
- **License**: 公式情報 (政府標準利用規約)
- **Fetcher**: `scrapers/sources/fetch_meti_densan.ts`
- **Output**: `data/r3/meti_densan.json`
- **Cadence**: weekly (Tue)
- **Channel**: R3
- **Coverage**: 231 records
- **Status**: `active`

#### #7 — 文化庁 日本遺産 (Japan Heritage stories)
- **Authority**: 文化庁
- **URL**: https://japan-heritage.bunka.go.jp/
- **License**: 出典明記による二次利用可
- **Fetcher**: `scrapers/sources/fetch_japan_heritage.ts`
- **Output**: `data/r3/japan_heritage.json`
- **Cadence**: weekly (Wed)
- **Channel**: R3
- **Coverage**: 104 stories (designated narratives)
- **Status**: `active`

#### #8 — 文化庁 重要無形文化財 (Bunka Intangible)
- **Authority**: 文化庁 (carrier: Wikidata)
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0 (Wikidata) / 公式 (文化庁)
- **Fetcher**: `scrapers/sources/fetch_bunka_intangible.ts`
- **Output**: `data/r3/bunka_intangible.json`
- **Cadence**: weekly (Thu)
- **Channel**: R3
- **Coverage**: 125 records
- **Status**: `active`

#### #9 — UNESCO Intangible Cultural Heritage (Japan)
- **Authority**: UNESCO (carrier: Wikidata)
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0 (Wikidata) / UNESCO public list
- **Fetcher**: `scrapers/sources/fetch_unesco_japan.ts`
- **Output**: `data/r3/unesco_japan.json`
- **Cadence**: weekly (Thu)
- **Channel**: R3
- **Coverage**: 58 inscriptions (Japan)
- **Status**: `active`

### DMO (観光庁 公式)

#### #10 — 観光庁 DMO 登録簿
- **Authority**: 観光庁 (Japan Tourism Agency)
- **URL**: https://www.mlit.go.jp/kankocho/seisaku_seido/kanrendantai/dmo_kanko_chiiki.html
- **License**: 公式 (政府標準利用規約)
- **Fetcher**: `scrapers/sources/fetch_dmo.py`
- **Output**: `data/r3/dmo.json`
- **Cadence**: monthly
- **Channel**: DMO
- **Coverage**: ~326 DMOs (full official registry)
- **Status**: `active`

#### #11 — DMO 観光計画書 (DMO plans)
- **Authority**: 観光庁
- **URL**: same as #10 (PDF links per DMO)
- **License**: 公式
- **Fetcher**: `scrapers/sources/fetch_dmo_plans.py`
- **Output**: `data/dmo/<dmo_id>/plan.pdf` etc.
- **Cadence**: quarterly
- **Channel**: DMO
- **Coverage**: ~80% of DMOs have plans
- **Status**: `active`

#### #12 — DMO website discovery
- **Authority**: search-engine driven from DMO names
- **URL**: —
- **License**: discovery only
- **Fetcher**: `scrapers/sources/find_dmo_websites.py`
- **Output**: `data/_state/dmo_seed_urls.json`
- **Cadence**: quarterly
- **Channel**: DMO (manual seed step)
- **Coverage**: 326 DMOs → ~88% URL identified
- **Status**: `active`

#### #13 — DMO 公式サイト scrape
- **Authority**: each DMO
- **URL**: per DMO official site
- **License**: 公式機関 (per site, robots.txt 尊重)
- **Fetcher**: `scrapers/sources/scrape_dmo_websites.ts`
- **Output**: `data/dmo/<dmo_slug>/` (per-DMO directory with extracted pages)
- **Cadence**: bi-weekly
- **Channel**: DMO
- **Coverage**: ~326 DMOs scraped
- **Status**: `active`

### Wikidata (broad coverage)

#### #14 — Wikidata attractions v1 (deprecated, kept as data origin)
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_wikidata_attractions.ts`
- **Output**: `data/_state/wikidata_attractions.json`
- **Cadence**: —
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: 12 P31 type chain (subset of v2)
- **Status**: `deprecated` (superseded by v2 + p1435)

#### #15 — Wikidata attractions v2 (broader P31 type chain)
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_wikidata_attractions_v2.ts`
- **Output**: `data/_state/wikidata_attractions.json` (master file)
- **Cadence**: monthly+ (one-shot per schema change)
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: 67,862 items (v2.2 with 39 P31 types)
- **Status**: `active`

#### #16 — Wikidata P1435 heritage anchor
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_wikidata_p1435.ts`
- **Output**: `data/_state/wikidata_attractions_p1435.json` (sidecar)
- **Cadence**: monthly+ (re-run when designation index updates)
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: 5,567 items with heritage designations + 6 direct-P31 types
- **Status**: `active` (added iter54, 2026-05-04)

#### #17 — Wikidata hotels
- **Authority**: Wikidata
- **URL**: https://query.wikidata.org/sparql
- **License**: CC0
- **Fetcher**: `scrapers/sources/fetch_wikidata_hotels.ts`
- **Output**: `data/hotels/raw/wikidata.json`
- **Cadence**: monthly+
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: ~20,000 lodging entities (incl. global noise — filtered downstream)
- **Status**: `active`

#### #18 — OpenStreetMap hotels (Overpass API)
- **Authority**: OpenStreetMap contributors
- **URL**: https://overpass-api.de/api/interpreter
- **License**: ODbL
- **Fetcher**: `scrapers/sources/fetch_osm_hotels.ts`
- **Output**: `data/hotels/raw/osm.json`
- **Cadence**: monthly+
- **Channel**: WD-FOUNDATION (manual)
- **Coverage**: ~20,000 lodging tags in Japan bbox
- **Status**: `active`

#### #19 — Hotel master merge (#17 + #18 + corrections)
- **Authority**: composite
- **Fetcher**: `scrapers/matcher/match_hotels.ts`
- **Output**: `data/hotels/master.json`
- **Cadence**: triggered after #17/#18 update
- **Channel**: WD-FOUNDATION (chain)
- **Status**: `active`

### Wikipedia (multilingual labels)

#### #20 — Wikipedia 17-language attraction names
- **Authority**: Wikipedia (Wikimedia Foundation)
- **URL**: https://www.wikidata.org/w/api.php (sitelinks)
- **License**: CC BY-SA 4.0
- **Fetcher**: `scrapers/glossary/fetch_wikipedia_multilingual.ts`
- **Output**: `data/glossary/...`
- **Cadence**: monthly+
- **Channel**: GLOSSARY (manual)
- **Coverage**: 41,404 attractions × ja/en/zh/ko + others
- **Status**: `active`

#### #21 — Wikipedia ja/en pairs (canonical glossary seed)
- **Authority**: Wikipedia + 観光庁 公式対訳
- **URL**: Wikipedia API + 観光庁 docs
- **License**: CC BY-SA 4.0 / 公式
- **Fetcher**: `scrapers/glossary/fetch_wikipedia_pairs.ts`
- **Output**: `data/glossary/seed_canonical.json`
- **Cadence**: rare (seed, manually curated)
- **Channel**: GLOSSARY (manual)
- **Status**: `active`

#### #22 — 観光庁 多言語対訳ガイドライン
- **Authority**: 観光庁
- **URL**: https://www.mlit.go.jp/kankocho/news08_000305.html (PDF)
- **License**: 公式 (政府標準利用規約)
- **Fetcher**: manual import
- **Output**: `data/glossary/mlit_canonical.json`
- **Cadence**: rare (when 観光庁 updates the dictionary)
- **Channel**: GLOSSARY (manual)
- **Coverage**: 400+ canonical translation pairs
- **Status**: `active` (manually curated)

### OSM POI tag enrichment (constraint-encodable fields source)

#### #24 — OpenStreetMap attraction tags (joined via `wikidata=Q*` tag)
- **Authority**: OpenStreetMap contributors
- **URL**: https://overpass-api.de/api/interpreter
- **License**: ODbL
- **Fetcher**: `scrapers/sources/fetch_osm_attraction_tags.ts`
- **Output**: `data/_state/osm_attraction_tags.json`
- **Cadence**: monthly+
- **Channel**: WD-FOUNDATION
- **Coverage**: every Japanese OSM element with `wikidata=Q*` tag joined to
  attractions corpus. Fields: `opening_hours`, `wheelchair`,
  `tactile_paving`, `phone`, `website`, `cuisine`, `fee`, `fee:adult`,
  `internet_access`, `raw_tags`. **Source for Phase A
  constraint-encodable structured fields** (research_0504 memo).
- **Status**: `active` (existing implementation, used by iter58 onward)

### Industry-association registries (SCAFFOLDED)

#### #26 — 日本秘湯を守る会 公式会員旅館リスト
- **Authority**: 日本秘湯を守る会 (industry association, founded 1975)
- **URL**: https://www.hitou.or.jp/
- **License**: 公式団体の公開情報 (削除依頼即対応)
- **Fetcher**: `scrapers/sources/fetch_hito_yu_kai.ts`
- **Output**: `data/r3/hito_yu_kai.json` (planned)
- **Cadence (planned)**: monthly
- **Channel (planned)**: extend WD-FOUNDATION (chain into hotel master #19)
- **Coverage**: target ~185 member ryokans (e.g. 乳頭温泉 鶴の湯 / 玉川温泉
  等の 公式 hisoyu inn)
- **Status**: `scaffolded`

#### #27 — 高野山宿坊組合 公式宿坊リスト
- **Authority**: 高野山宿坊協会 (official Koyasan shukubo association)
- **URL**: https://www.shukubo.net/contents/stay/
- **License**: 公式団体の公開情報
- **Fetcher**: `scrapers/sources/fetch_koyasan_shukubo.ts`
- **Output**: `data/r3/koyasan_shukubo.json` (planned)
- **Cadence (planned)**: monthly
- **Channel (planned)**: extend WD-FOUNDATION (chain into hotel master #19)
- **Coverage**: target all Koyasan member shukubo (恵光院 / 福智院 / 西禅院
  / 赤松院 / 等)
- **Status**: `scaffolded`

### Wikipedia categories (SCAFFOLDED)

#### #28 — Japanese Wikipedia categories for travel concepts
- **Authority**: Wikipedia (Wikimedia Foundation)
- **URL**: https://ja.wikipedia.org/w/api.php (categorymembers + summary)
- **License**: CC BY-SA 4.0
- **Fetcher**: `scrapers/sources/fetch_wikipedia_categories.ts`
- **Output**: `data/_state/wikipedia_categories.json` (planned)
- **Cadence (planned)**: monthly+
- **Channel (planned)**: planned new `WIKIPEDIA-ABSTRACT` channel (or
  GLOSSARY extension)
- **Coverage**: target travel-related concepts that lack heritage_designation
  tagging (e.g. 花火大会 / 雪まつり / 横丁 / 鶴の生息地 / 擬洋風建築 etc.).
  Used to derive `kinds` tags for entities whose Wikidata P31 chain doesn't
  reach those semantics.
- **Status**: `scaffolded`

### Wikipedia list articles (SCAFFOLDED)

#### #29 — Japanese Wikipedia list articles for canonical enumerations
- **Authority**: Wikipedia (Wikimedia Foundation)
- **URL**: https://ja.wikipedia.org/w/api.php (action=parse on list articles)
- **License**: CC BY-SA 4.0
- **Fetcher**: `scrapers/sources/fetch_wikipedia_lists.ts`
- **Output**: `data/r3/wikipedia_lists.json` (planned)
- **Cadence (planned)**: monthly+
- **Channel (planned)**: planned new `WIKIPEDIA-ABSTRACT` channel (or
  GLOSSARY extension), complementary to #28
- **Coverage**: target list articles such as 日本の花火大会一覧 / 日本の祭り一覧 /
  etc. Categories index by topic; list articles enumerate canonical entries
  (e.g. fireworks category had 4 entries, the list article has 250+).
- **Status**: `scaffolded`

### 文化庁 国指定文化財等データベース (SCAFFOLDED)

#### #25 — 文化庁 国指定文化財等データベース (Bunka kunishitei)
- **Authority**: 文化庁 (Agency for Cultural Affairs)
- **URL**: https://kunishitei.bunka.go.jp/bsys/index
- **License**: 公式機関の公開情報 (一部「無断転載禁止」明示あり、削除依頼即対応)
- **Fetcher**: `scrapers/sources/fetch_bunka_kunishitei.ts`
- **Output**: `data/r3/bunka_kunishitei.json`
- **Cadence (planned)**: weekly (extend R3 rotation, e.g. add Friday slot)
- **Channel (planned)**: R3
- **Coverage**: target ~30,000+ records (国宝 / 重要文化財 / 特別史跡 / 史跡 /
  特別名勝 / 名勝 / 特別天然記念物 / 天然記念物 / 重要伝統的建造物群保存地区 /
  重要無形文化財 / 重要無形民俗文化財 / 重要文化的景観 / 登録有形文化財 /
  登録記念物 / 登録有形民俗文化財). **Currently 0 records — fetcher is
  scaffolded, full implementation pending iter58.** Scaffold predates this
  inventory work.
- **Status**: `scaffolded` (fetcher file exists, rotation wiring pending)
- **Implementation note**: kunishitei DB form requires server-rendered
  HTML parse OR API endpoint at `/bsys/api/searchlist`. Verify and
  complete in iter58. Once records > 0, also register in
  `scrapers/r3_refresh.ts` SOURCE_INFO + add to a DAY_TO_SOURCES slot
  (recommend Fri).

### Municipal scrape (the largest channel)

#### #23 — 全 1,938 自治体 観光公式ページ scrape
- **Authority**: each municipality (1,938 munis incl. designated-city wards)
- **URL**: official municipal tourism pages + 観光協会 pages (#3 + #4 derived)
- **License**: 公式機関の公開情報 (per DATA_POLICY)
- **Fetcher**: `scrapers/daily.ts` → `scrapers/municipal/scrape_one.ts`
- **Output**: `data/prefectures/<slug>.json` (47 files, in-place merge by muni code)
- **Cadence**: 30-day rolling SLA (steady-scrape picker)
- **Channel**: MUNI
- **Coverage**: **1,912 / 1,938 munis (98.6%)** — current status
- **Status**: `active` — running on `scrape.yml` legacy path; migration to `steady-scrape.yml` pending operator switchover

> **Important — coverage rule per project principle**:
> No "top-N selection". **Every municipality is covered at the same
> granularity**, regardless of size or fame. Residual 26 munis (1.4%) are
> tiny villages with no tourism page or scrape failures — pending
> investigation and resolution.

---

## Planned (next session)

These sources are agreed for next session implementation. Each MUST be moved
to the active list (above) when implemented, with channel + cadence assigned.

### #P1 — Wikipedia abstract (multilingual lead section)
- **Authority**: Wikipedia
- **License**: CC BY-SA 4.0
- **Purpose**: enrich attraction `description` with first-paragraph abstract for
  semantic search precision (擬洋風 / shukubo / etc.)
- **Cadence**: monthly+
- **Channel**: planned new `WIKIPEDIA-ABSTRACT` channel chained after #20

### #P2 — 文化庁 国指定文化財等データベース (SUPERSEDED by #25)
- See #25 below — fetcher scaffold is already in place, moved to active list.

### #P3 — OSM POI tag enrichment (opening_hours / wheelchair / cuisine)
- **URL**: Overpass API
- **License**: ODbL
- **Purpose**: provide structured constraint fields per
  `project_japan_travel_mcp_research_0504.md` Phase A
- **Cadence**: bi-monthly
- **Channel**: extend WD-FOUNDATION

### #P4 — JNTO 公式 events / observances
- **Authority**: JNTO (日本政府観光局)
- **URL**: https://www.japan.travel
- **License**: 公式
- **Purpose**: 全国祭り・季節イベント (花火大会、雪まつり、桜開花、紅葉) — 全件、主要選別なし
- **Cadence**: weekly (event timing changes seasonally)
- **Channel**: planned new `EVENTS` channel

### #P5 — 全国旅館組合連合会 旅館 / ryokan registry
- **Authority**: 全国旅館組合連合会 (公式団体)
- **URL**: https://www.ryokan.or.jp
- **License**: 公式機関の公開情報
- **Purpose**: ryokan ground truth, 全件
- **Cadence**: monthly
- **Channel**: extend WD-FOUNDATION (chain into #19)
- **Status note**: partial — #26 (日本秘湯を守る会) is scaffolded as a
  starting subset; full 全国旅館組合 registry remains planned.

### #P6 — 高野山宿坊組合 / 各宿坊組合 — SUPERSEDED by #27
- See #27 above (scaffolded).

### #P7 — 環境省 国立公園・国定公園
- **Authority**: 環境省
- **URL**: https://www.env.go.jp/park/
- **License**: 公式
- **Purpose**: 自然観光地網羅
- **Cadence**: rare
- **Channel**: extend R3 (or new GOVERNMENT channel)

### #P8 — 林野庁 保護林・森林浴の森100選
- **Authority**: 林野庁
- **URL**: https://www.rinya.maff.go.jp/
- **License**: 公式
- **Purpose**: 保護林 / 森林観光地
- **Cadence**: rare
- **Channel**: extend R3

### #P9 — 気象庁 桜開花前線・紅葉前線 (seasonal)
- **Authority**: 気象庁
- **URL**: https://www.jma.go.jp/
- **License**: 公式
- **Purpose**: seasonal event timing
- **Cadence**: weekly during seasons
- **Channel**: planned new `SEASONAL` channel

### #P10 — 各祭り公式サイト (全網羅、主要選別なし)
- **Authority**: 各祭り主催組織
- **URL**: per festival site
- **License**: 公式 (per site)
- **Purpose**: festival data full coverage
- **Cadence**: bi-weekly
- **Channel**: planned new `EVENTS` channel
- **Note**: per project coverage principle, no "top-N festivals" selection.
  Pull from each prefectural tourism federation's festival calendar in
  full.

### #P11 — 各宗教/巡礼 公式団体
- **Authority**: 四国八十八ヶ所霊場会 / 西国三十三所 / 板東三十三観音 / 秩父三十四観音 / 高野山真言宗総本山金剛峯寺 / 等
- **URL**: per association site
- **License**: 公式団体
- **Purpose**: pilgrimage data
- **Cadence**: monthly
- **Channel**: extend R3

### #P12 — 各窯元組合 / 公式工芸団体
- **Authority**: 有田 / 伊万里 / 備前 / 九谷 / 信楽 / 瀬戸 等
- **URL**: per association
- **License**: 公式団体
- **Purpose**: craft producer ground truth
- **Cadence**: monthly
- **Channel**: extend R3

### #P13 — 全国 各都道府県 観光連盟 (47 prefs)
- **Authority**: 各都道府県観光連盟 (公式)
- **URL**: per pref tourism federation
- **License**: 公式機関
- **Purpose**: prefecture-level event/spot calendar (existing #4 covers tourism orgs but not always pref-level federations explicitly)
- **Cadence**: bi-weekly
- **Channel**: extend MUNI (treat as 47 + sub-units like munis) or new PREF channel

### #P14 — 国立文楽劇場 / 国立能楽堂 / 歌舞伎座 公演スケジュール
- **Authority**: 各劇場 (公式)
- **URL**: per venue
- **License**: 公式
- **Purpose**: 伝統芸能 公演情報 (L1-11 Bunraku type cases)
- **Cadence**: monthly
- **Channel**: planned new `EVENTS` channel

---

## Operational rule for fetcher implementations

Going forward, every new fetcher implementation MUST:

1. Update this `DATA_SOURCES.md` with a numbered entry (move from `planned`
   to `active` when shipped).
2. Be assigned to a rotation channel.
3. Set a cadence + register with the rotation scheduler (steady-scrape.yml /
   r3_refresh.ts / new workflow).
4. Output to a documented path.
5. Record `source` / `source_url` / `authority` / `license` on every record.
6. Pass the editorial principle (公式の積み上げ — see EDITORIAL_POLICY.md).

If any of those are skipped, the PR cannot land.

## Anti-drift mechanism (2026-05-04 added)

Three layers prevent DATA_SOURCES.md from drifting out of sync with the
actual fetcher inventory + rotation schedulers:

### Layer 1 — PR template forced checklist
[`.github/pull_request_template.md`](.github/pull_request_template.md)
shows up automatically when opening a PR. The "Data source checklist"
section requires checking every box when scrapers/ or DATA_SOURCES.md
is touched. Includes channel-specific checklist (R3 needs r3_refresh.ts
update; new channel needs workflow yml; etc.).

### Layer 2 — CI validation (mandatory)
[`scripts/validate_data_sources.ts`](scripts/validate_data_sources.ts)
parses DATA_SOURCES.md + scans scrapers/ + reads r3_refresh.ts +
inventories .github/workflows/, then cross-checks:
1. Every fetcher file is documented in DATA_SOURCES.md (or in exempt list)
2. Every `active` entry has Fetcher / Channel / Cadence / Output filled in
3. R3-channel sources are registered in `scrapers/r3_refresh.ts`
   `SOURCE_INFO`
4. Documented workflow filenames exist in `.github/workflows/`

Run locally with `npm run validate:data-sources`. Runs automatically on
every PR via [`.github/workflows/validate-data-sources.yml`](.github/workflows/validate-data-sources.yml).
**Failing CI blocks merge** until reconciliation.

### Layer 3 — When source is updated, GH Actions reflection workflow

When a source's cadence or fetcher changes, the validator catches the
drift and CI fails until the corresponding workflow is updated. This
forces the PR author to keep the workflow yml file in lockstep with
DATA_SOURCES.md.

**Concrete reflection paths:**

| What changed in DATA_SOURCES.md | What MUST be updated alongside |
|:---|:---|
| New `active` entry, channel = R3 | Add fetcher import + `DAY_TO_SOURCES` + `SOURCE_INFO` entry in `scrapers/r3_refresh.ts` |
| New `active` entry, channel = MUNI | If municipal source, picker logic in `scrapers/daily.ts` (existing pipeline) |
| New `active` entry, new channel (e.g. EVENTS) | Create new workflow yml `.github/workflows/<channel>-scrape.yml` (model after `r3` chained pattern) + this MD's "Master rotation contract" table |
| Cadence (steady) changed | Update cron schedule in workflow yml |
| Status: `active` → `deprecated` | Remove fetcher from rotation (workflow chain or r3_refresh) |
| Output path changed | Update consumers (merge scripts, embed builder, etc.) |

If a PR changes DATA_SOURCES.md without the corresponding workflow change,
**the validator fails on a Layer 2 check, CI is red, merge blocked**. This
is the structural guarantee that prevents drift between this document,
the fetcher inventory, and the rotation schedulers.

### Future: Layer 4 (workflow generation)

Eventually DATA_SOURCES.md (or a paired structured registry) can be the
sole source from which workflow yml files are generated. Until that
generator exists, Layer 1 + Layer 2 + Layer 3 reflection table are the
contract.

---

## Change log

- 2026-05-04 — initial creation. Inventoried 23 active fetchers and 14
  planned sources. Established the drift-prevention contract (PR template
  + CI validator + reflection table).
