# AGENTS.md

Operator's guide for AI coding agents (Claude Code, Cursor, Codex, Aider, etc.)
working on this repository. User-facing docs live in [`README.md`](README.md);
this file is the **engineering** brief.

> **`CLAUDE.md` is a symlink to this file** — keep edits in `AGENTS.md`.

> Companion documents (read these before changing the corresponding area):
>
> - [`DATA_POLICY.md`](DATA_POLICY.md) — what we crawl / robots.txt stance / 30-day SLA
> - [`DATA_SOURCES.md`](DATA_SOURCES.md) — **single source of truth** for every fetcher (CI-enforced)
> - [`docs/EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md) — what content we surface ("公式の積み上げ", no curation)
> - [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md) — steady vs. burst scraping
> - [`docs/decisions/`](docs/decisions/) — ADRs (currently: 0001 multi-source data)
> - [`CONTRIBUTING.md`](CONTRIBUTING.md) — merge bar / PR flow

---

## TL;DR

`japan-travel-mcp` is **two things wired together**:

1. An **MCP server** (`src/`) — TypeScript, Node 20+, stdio + Streamable-HTTP
   transports, exposes **18 tools** over a static dataset of Japanese tourism data.
2. A **multi-source scraper pipeline** (`scrapers/`) — TypeScript with a few
   Python helpers (DMO PDFs, HF uploads), runs on GitHub Actions, writes
   JSON/JSONL artefacts under `data/` and syncs them to a Hugging Face dataset.

Most of `data/` is **gitignored** — runtime files are fetched from
[`open-travel/japan-travel-mcp-data`](https://huggingface.co/datasets/open-travel/japan-travel-mcp-data)
on first server start and cached at `~/.japan-travel-mcp/data/` (override
with `JAPAN_TRAVEL_MCP_CACHE`). Scrapers write into the local `data/` tree
at dev time; GitHub Actions cron jobs upload results back to HF.

Code is MIT, dataset is CC BY 4.0. No API keys at runtime once the dataset is public
(during the pre-launch private-review window an `HF_TOKEN` is required for the
first download).

---

## Repository layout

```
japan-travel-mcp/
├── src/                           # MCP server
│   ├── index.ts                   # stdio transport + 18 tool definitions (~6.2k lines)
│   ├── index_http.ts              # Streamable-HTTP transport (HF Spaces / Cloudflare)
│   └── lib/
│       ├── hf_data.ts             # Hugging Face download + cache resolution
│       ├── match.ts               # Prefecture / municipality name matching
│       ├── semantic.ts            # multilingual-e5-small vector search
│       ├── hybrid.ts              # BM25 + vector + RRF fusion
│       ├── intent.ts              # Query-intent classifier (used by most tools, see SKIP_INTENT_TOOLS)
│       ├── kinds_defaults.ts      # Per-kind result-shape defaults
│       └── safety.ts              # Output sanitisation guards
│
├── scrapers/                      # Data pipeline
│   ├── lib/                       # Shared modules: fetcher, robots, extractor,
│   │                              #   discover (URL graph), quality_score,
│   │                              #   canonical, geocode, prefecture_match,
│   │                              #   prefectures, spot_filter, state, slack, types
│   ├── sources/                   # Per-source fetchers (TS; Python only for DMO PDF parsing)
│   ├── municipal/scrape_one.ts    # Single-municipality scraper entry
│   ├── matcher/match_hotels.ts    # Wikidata × OSM hotel entity matching
│   ├── translate/                 # Anthropic Batch API translation passes (Sonnet 4.6)
│   ├── glossary/                  # Multilingual canonical-name pair fetchers
│   ├── embed/build_embeddings.ts  # multilingual-e5 embedding builder (~50 MB index)
│   ├── quality/quality_report.ts  # Coverage gap dashboard + per-spot quality scoring
│   ├── hf/                        # HF dataset card / SPACE_README / upload scripts (Python)
│   ├── daily.ts                   # Steady scrape orchestrator (30-day SLA)
│   ├── pilot.ts                   # Dev-only smoke run (Tottori + Kochi)
│   ├── r3_refresh.ts              # R-3 official-source weekly rotation
│   ├── run_enriched_scrape.ts     # Multi-source burst orchestrator (ADR 0001)
│   ├── merge_wikidata.ts          # Wikidata → prefecture-file merge
│   ├── merge_wikidata_p1435_into_master.ts   # Heritage-status merge
│   ├── merge_osm_tags_into_master.ts         # OSM tag merge
│   └── merge_wikipedia_kinds_into_master.ts  # Wikipedia kinds merge
│
├── scripts/                       # One-shot utilities (run via `tsx`)
│   ├── validate_data_sources.ts   # CI gate: fetcher ↔ DATA_SOURCES.md ↔ r3_refresh ↔ workflows
│   ├── smoke_intent.ts            # Intent classifier smoke test
│   └── smoke_phase_a_c.ts         # End-to-end phase-A/C smoke test
│
├── data/                          # Mostly gitignored — see "Data layer" below
├── tests/lib/                     # Vitest unit tests for scrapers/lib + src/lib
├── tests/fixtures/                # Static input fixtures (prefectures, municipalities)
├── docs/                          # Policies, ADRs, automation design, quality iterations
└── .github/workflows/             # 6 workflows: see "Automation" below
```

---

## Common commands

```sh
# Build / run
npm run build                  # tsc → dist/, chmod +x dist/src/index.js
npm start                      # node dist/src/index.js (stdio MCP)
npm run dev                    # tsx watch src/index.ts

# Type-check
npm run typecheck              # src/ only (uses tsconfig.json)
npm run typecheck:all          # + scrapers/ + tests/ (uses tsconfig.scrapers.json)

# Tests
npm test                       # vitest run
npm run test:watch
npm run test:coverage          # v8 coverage (src/ + scrapers/lib/)

# CI gate — run before opening any PR that touches scrapers/ or DATA_SOURCES.md
npm run validate:data-sources

# Scraper orchestrators
npm run scrape:pilot           # Tottori (31) + Kochi (39); PILOT_PREFECTURES=all to override
npm run scrape:daily           # Steady incremental scrape (used by steady-scrape.yml)
npm run scrape:r3              # R-3 official sources weekly rotation
npm run scrape:enriched        # Multi-source burst (run_enriched_scrape.ts)
npm run scrape:municipality    # scrape_one.ts — single muni for debugging
npm run scrape:dmo_websites    # DMO sites pass

# Per-source fetchers (run once or rarely)
npm run fetch:municipalities   # Wikidata → _state/municipalities.json (1,938 entities)
npm run fetch:maff_gi          # MAFF Geographical Indications (R-3)
npm run fetch:meti_densan      # METI traditional crafts (R-3)
npm run fetch:japan_heritage   # 文化庁 Japan Heritage stories (R-3)
npm run fetch:bunka_intangible # 文化庁 intangible cultural property (R-3)
npm run fetch:unesco_japan     # UNESCO ICH Japan inscriptions (R-3)
npm run discover:tourism_orgs  # URL graph discovery (multi-source per ADR 0001)

# Translation (Anthropic Batch API — async, can take hours)
npm run translate:r3           # Translate freshly-fetched R-3 records into 17 languages

# Build derived artefacts
npm run embed:build            # Rebuild data/embeddings/spots.{f16.bin,index.json}
npm run quality:report         # Coverage gap dashboard + per-spot quality scores
```

Smoke scripts (run directly with `tsx`, not via npm script): `scripts/smoke_intent.ts`,
`scripts/smoke_phase_a_c.ts` — useful for verifying tool wiring before a PR.

---

## Architecture

### MCP server (`src/`)

The server registers **18 tools**, all defined in a single `TOOLS` array
near the bottom of `src/index.ts` (search for `const TOOLS = [`, around line 5318).
Both transports share the same registry via `buildServer()`.

| Tool | Purpose |
|---|---|
| `search_area` | Lexical search across prefectures / municipalities / attractions / R-3 records |
| `search_semantic` | Vector search over `multilingual-e5-small` embeddings |
| `search_hybrid` | BM25 + vector + RRF fusion — preferred general-purpose retriever |
| `get_spots` | Tourist spots in a prefecture / municipality (municipal scrape ∪ Wikidata) |
| `get_hotels` | Accommodations (Wikidata ∪ OSM, with confirmed-cluster flagging) |
| `get_transport` | Coordinates + official URL for a spot |
| `get_events` | Festivals via live Wikidata SPARQL (in-memory cache, optional month filter) |
| `get_festivals` | Festivals from R-3 + scrape Schema.org Events (broader coverage than `get_events`) |
| `get_multilingual` | Lightweight 4-language name lookup (ja/en/zh/ko) |
| `get_description` | **Signature tool** — 17-language descriptions, AI-generated by Claude Sonnet 4.6 |
| `get_local_specialty` | MAFF GI + METI traditional crafts |
| `get_local_food` | MAFF GI ∪ scraped 郷土料理 / 銘菓 / 地酒 |
| `get_traditional_arts` | 文化庁 important / folk + UNESCO ICH inscriptions |
| `get_japan_heritage` | 文化庁 日本遺産 stories (104 designated narratives) |
| `get_dmo` | 観光庁-registered Destination Management Organizations |
| `get_entity_full` | Full denormalised view of a single entity (joined across all layers) |
| `get_entities_bulk` | Batch variant of `get_entity_full` |
| `plan_feasibility_check` | Sanity-check a multi-stop itinerary against the dataset |

**Two transports**: `index.ts` is stdio (Claude Desktop, Cursor); `index_http.ts`
is Streamable-HTTP for HF Spaces / Cloudflare Workers (default port 7860, set
via `PORT`). Both call `buildServer()` — keep tool changes in `index.ts` and
they apply to both.

**Intent classifier**: most tools route their input through `src/lib/intent.ts`
before dispatch. The set `SKIP_INTENT_TOOLS` (currently `search_area`,
`get_spots`, `get_entity_full`, `get_entities_bulk`, `plan_feasibility_check`)
opts out — when adding a new structured-input tool, add it to that set rather
than fighting the classifier.

**Search infrastructure is content-neutral** (per
[`EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md)). BM25, embeddings, and RRF
**reorder** official content; they must not select or suppress it. Don't
introduce ranking signals like "famous", "popular", or "tourist-favourite" —
that's the LLM client's job, not the server's.

### Scraper pipeline (`scrapers/`)

Three orchestrators you'll touch most often:

- **`daily.ts`** — steady incremental scrape. Picks ~70 oldest-by-`last_scraped_at`
  municipalities, hits each domain once with a 5 s interval, updates
  `data/_state/scrape_state.json`. Triggered nightly by `scrape.yml` (legacy,
  active) and slated to migrate to `steady-scrape.yml` once enabled.
- **`r3_refresh.ts`** — refreshes R-3 sources (MAFF GI, METI, Japan Heritage,
  Bunka intangible, UNESCO, DMOs) on a day-of-week rotation, then incrementally
  translates new records via the Anthropic Batch API. Chained after `daily.ts`
  in the steady workflow.
- **`run_enriched_scrape.ts`** — multi-source burst: feeds municipal pages +
  prefecture portals + tourism-association sites into the same extractor.
  Triggered manually by `burst-scrape.yml`.

Top-level `merge_*_into_master.ts` scripts join secondary signals (Wikidata
P1435 heritage status, OSM tags, Wikipedia kinds) into the per-prefecture
master files. Run them when the underlying source has been re-fetched.

The shared modules in `scrapers/lib/` are well-tested (see `tests/lib/`)
and used by every orchestrator. New sources should reuse `fetcher`,
`extractor`, `robots`, `quality_score`, and `discover` rather than reinventing them.

**TS vs Python**: most fetchers are TypeScript. Python is used only where
an existing ecosystem tool fits better — currently DMO PDF parsing
(`scrapers/sources/fetch_dmo*.py`, `find_dmo_websites.py`) and HF dataset
upload (`scrapers/hf/*.py`). Don't add Python for anything that fits the TS pipeline.

### Data layer (`data/`)

Most of `data/` is **gitignored** because it's bulk runtime data that lives
on Hugging Face. See [`.gitignore`](.gitignore) for the authoritative list.
What **is** committed:

```
data/_state/
  scrape_state.json                # Steady-scrape SLA tracker (last_scraped_at, errors)
  prefecture_tourism_orgs.json     # Per-prefecture portal seed list
  tourism_org_urls.json            # Resolved multi-source URLs per muni (ADR 0001 A)
  dmo_website_overrides.json       # Manual DMO URL corrections
  translation_batch.json           # Anthropic batch IDs (transient)
  r3_translation_batch.json        # Same, for R-3 sources
data/_logs/                        # Run summaries (daily/pilot/quality, JSON + MD)
data/knowledge/taxonomies/         # japan_historical_eras.json, japan_regions.json
data/hotels/review/                # Reserved for human review of contested merges
data/hf_card_assets/               # Images / charts shipped with the HF dataset card
data/metadata.json                 # Dataset version metadata
```

What lives **only on Hugging Face** (downloaded at runtime, written by scrapers):

```
data/prefectures/<slug>.json       # 47 files — per-prefecture spots + wikidata_attractions
data/hotels/master.json            # Merged Wikidata + OSM hotels
data/hotels/raw/{wikidata,osm}.jsonl
data/translations/descriptions_complete.jsonl   # 17-lang descriptions
data/translations/multilingual_complete.jsonl   # 17-lang names
data/embeddings/spots.{f16.bin,index.json}      # Vector index (~50 MB)
data/r3/<source>.json + r3/translations/r3_translations.jsonl
data/_state/{municipalities,municipality_centroids,official_urls,wikidata_attractions}.json
```

**Don't commit anything in those paths** — `.gitignore` already excludes them,
but be aware that `git status` after a scrape run will look quiet even when
many MB have been written.

---

## Hard rules — do NOT violate without an ADR

These rules have product-level consequences. Breaking them is worse than
leaving a task unfinished.

### `DATA_SOURCES.md` is the SSOT for every fetcher

Any PR that adds, modifies, or removes a fetcher MUST update
[`DATA_SOURCES.md`](DATA_SOURCES.md) AND pass `npm run validate:data-sources`
(green CI via [`.github/workflows/validate-data-sources.yml`](.github/workflows/validate-data-sources.yml))
before merging. The validator cross-checks:

1. Every fetcher under `scrapers/sources/` is documented in `DATA_SOURCES.md`
2. Every `active` entry has fetcher + channel + cadence + output
3. R3-channel sources are wired into `scrapers/r3_refresh.ts` (`DAY_TO_SOURCES` + `SOURCE_INFO`)
4. Documented workflow files exist under `.github/workflows/`

The PR template (`.github/pull_request_template.md`) carries the per-channel
checklist; don't ship without ticking it. Channels currently in use:
**MUNI / R3 / DMO / WD-FOUNDATION / GLOSSARY / WIKIPEDIA-ABSTRACT / EVENTS / SEASONAL**.

### Source selection ([`DATA_POLICY.md`](DATA_POLICY.md), [`EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md))

- **Only public, official, or open-licensed sources.** Government registries,
  content published by the subject itself (a city, a hotel), or open data
  with traceable provenance.
- **No OTAs, no paywalled content, no member-only content, no user reviews,
  no UGC.** This is a hard line — don't relax it for "richer" data.
- **Faithful integration is allowed; personal curation is not.** If an
  official source describes a craft as "dying", tagging that record `dying-craft`
  is fine. Inventing tags like "hidden gem" or "off the beaten path" is not.
  Test: could another person reading the same source produce the same tag?
- **Search reorders, never selects.** No ranking signal that encodes editorial
  taste ("famous", "popular", "good for kids") — that work belongs in the LLM client.

### Crawling behaviour

- **5-second per-domain interval at steady state**, 2-second floor during
  initial bootstrap. Never lower without explicit operator instruction.
- **Always check `robots.txt`** via `scrapers/lib/robots.ts` before fetching.
  Respect private paths absolutely. The project's stance on public tourism
  content is documented in `DATA_POLICY.md` — don't quietly change it in code.
- **Refresh budget: ~30 days per domain.** The steady scraper enforces this;
  if you write a new orchestrator, it should respect the same budget.
- **No live source fetches at MCP query time.** All data is precomputed.
  `get_events` is the *only* tool that hits a live source (Wikidata SPARQL),
  and it caches in-memory.

### Concurrency

- `scrape.yml` (legacy), `steady-scrape.yml`, and `burst-scrape.yml` share
  the GitHub Actions concurrency group `scrape` and **must never run
  concurrently**. If you add a third scrape workflow, put it in the same group.

---

## Conventions

### TypeScript

- **ES2022, NodeNext, strict mode.** ESM only — `"type": "module"` in
  `package.json`. Use `.js` extensions on relative imports (NodeNext requirement).
- **Two tsconfigs**: `tsconfig.json` builds `src/` for shipping;
  `tsconfig.scrapers.json` extends it with `noEmit: true` and adds
  `scrapers/`, `tests/`, `vitest.config.ts` for type-checking only.
  `npm run typecheck:all` is the gate that catches scraper-side type errors.
- Don't add new packages without checking they're tree-shakeable and
  Node-compatible. The published `npx japan-travel-mcp` binary needs to start
  in <1 s on warm cache.

### Tests

- **Vitest, Node environment, `tests/**/*.test.ts`** (`vitest.config.ts`).
- Coverage targets `src/**/*.ts` and `scrapers/lib/**/*.ts`. Orchestrators
  (`daily.ts`, `pilot.ts`, etc.) and source fetchers are integration-level
  and not currently unit-tested — fixtures live in `tests/fixtures/`.
- HF download path is exercised against a stubbed `fetch` — tests run **fully
  offline**, no `HF_TOKEN` required.
- Bug-first when fixing: write a failing test first, then fix.

### Quality observability (`docs/quality/`)

A semi-automated LLM-judge harness lives under `docs/quality/`:
- `build_v3_prompts.py` / `build_v4data_prompts.py` — generate prompts from a test corpus
- `aggregate_v3.py` / `aggregate_v3_multijudge.py` / `aggregate_v4data*.py` — aggregate judge scores
- `auto_loop.sh` — iteration runner
- `DELTA_iter*.md` — per-iteration deltas (Iter54 baseline → current)

When tuning ranking, retrieval, or filter logic, run an iteration before/after
and commit the DELTA so the change is reviewable against the rubric.

### Commits & PRs

- **Don't add a `Co-Authored-By: Claude …` trailer** to commits in this repo.
- Commit style is short, prefix-emoji + scope:
  `✨ DMO URL discovery via Claude API (Haiku 4.5 + strict 'official' prompt)`,
  `🧹 DMO data hygiene: 12 manual URLs + isolate 201 contaminated plans`,
  `🐛 burst-scrape: rebuild-embeddings prefetches HF data first`.
  Match the existing style.
- See [`CONTRIBUTING.md`](CONTRIBUTING.md): the bar for merging is intentionally
  low for data PRs — accuracy + public source + helpful coverage.

### Editorial discipline when adding tools

If you add a new MCP tool, it must satisfy the Editorial Policy:

1. Trace every record back to an official source registered in `DATA_SOURCES.md`.
2. Don't bake editorial taste into ranking or filtering.
3. Default to comprehensive output; let the LLM client narrow it.
4. If translations exist, use the requested `lang`; otherwise return original
   Japanese with a `translation_meta` marker (see `get_local_specialty` for
   the pattern).
5. Decide whether the tool needs intent-classifier preprocessing or should be
   added to `SKIP_INTENT_TOOLS` in `src/index.ts`.

---

## Automation (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `scrape.yml` (legacy) | daily cron 03:00 JST + manual | Active steady scraper today; `daily.ts` + `r3_refresh.ts`, commits state, syncs to HF. To be retired when `steady-scrape.yml` is enabled. |
| `steady-scrape.yml` | manual + (cron commented; flip when KJ approves) | Replacement for `scrape.yml` with dynamic muni picker (overdue-first, 65–130 / day). |
| `burst-scrape.yml` | manual + PR label `burst-required` | Full re-scrape across 6 batches (3-1 … 3-6); `shallow` (~4-6h) or `full` (~12h) mode. |
| `translate.yml` | manual only | Anthropic Batch API translation pass for missing names. |
| `validate-data-sources.yml` | PR touching `scrapers/` / `DATA_SOURCES.md` / workflows + manual | Runs `validate:data-sources` — the SSOT gate. |
| `publish.yml` | git tag `v*` (or manual dry-run) | Publishes to npm with provenance. Bump via `npm version <part> && git push --follow-tags`. |

**Required secrets**: `HF_TOKEN`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`,
`NPM_TOKEN` (publish only). The HF token is required only while the dataset
is private — once public it's optional.

When changing a workflow, read [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md)
first — it documents the steady/burst split, the SLA reasoning, and the
shared-state schema in `data/_state/scrape_state.json`.

---

## Where to look for…

| Question | File |
|---|---|
| Which fetcher feeds which output, and on what cadence | [`DATA_SOURCES.md`](DATA_SOURCES.md) |
| Why we have multiple data sources per municipality | [`docs/decisions/0001-multi-source-tourism-data.md`](docs/decisions/0001-multi-source-tourism-data.md) |
| Editorial line on "hidden gems" / curation | [`docs/EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md) |
| Crawling rules / robots.txt stance | [`DATA_POLICY.md`](DATA_POLICY.md) |
| How steady vs burst differ; SLA / scrape-state schema | [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md) |
| Per-channel PR checklist | [`.github/pull_request_template.md`](.github/pull_request_template.md) |
| Coverage gaps per prefecture × topic | `docs/quality/GAP_ANALYSIS.md` (regenerated by `quality:report`) |
| Quality benchmark + LLM-judge iterations | `docs/quality/DELTA_iter*.md`, `docs/quality/TEST_*.md` |
| Burst batching playbook (which prefectures in which batch) | `docs/batches/README.md` |
| HF dataset card content | [`scrapers/hf/dataset_card.md`](scrapers/hf/dataset_card.md) |
| HF Space landing page | [`scrapers/hf/SPACE_README.md`](scrapers/hf/SPACE_README.md) |
| User-facing setup (MCP clients, dataset download) | [`README.md`](README.md) |
| How to add a hotel / muni / source | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
