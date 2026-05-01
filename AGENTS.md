# AGENTS.md

Operator's guide for AI agents (Claude Code, Cursor, Codex, Aider, etc.) working
on this repository. User-facing docs live in [`README.md`](README.md);
this file is the **engineering** brief.

> Companion files: [`DATA_POLICY.md`](DATA_POLICY.md) (what we crawl),
> [`docs/EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md) (what content we
> surface), [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md)
> (how scrapers run), [`docs/decisions/`](docs/decisions/) (ADRs).

---

## TL;DR

`japan-travel-mcp` is **two things wired together**:

1. An **MCP server** (`src/`) — TypeScript, Node 20+, stdio + HTTP transports,
   exposes 15 tools over a static dataset of Japanese tourism data.
2. A **multi-source scraper pipeline** (`scrapers/`) — TypeScript with a few
   Python helpers, runs on GitHub Actions, writes JSON/JSONL artefacts to
   `data/` and syncs them to a Hugging Face dataset.

The runtime data in `data/` is **not committed to git** — it's fetched from
[`kjsunada/japan-travel-mcp-data`](https://huggingface.co/datasets/kjsunada/japan-travel-mcp-data)
on first server start and cached at `~/.japan-travel-mcp/data/`. Scrapers
write into the local `data/` tree at dev time; the GitHub Actions cron jobs
push results back to HF.

Code is MIT, dataset is CC BY 4.0. No API keys at runtime once the dataset
is public.

---

## Repository layout

```
japan-travel-mcp/
├── src/                          # MCP server
│   ├── index.ts                  # stdio transport + 15 tool definitions (~3300 lines)
│   ├── index_http.ts             # Streamable-HTTP transport (HF Spaces / Cloudflare)
│   └── lib/
│       ├── hf_data.ts            # Hugging Face download + cache resolution
│       ├── match.ts              # Prefecture / municipality name matching
│       ├── semantic.ts           # multilingual-e5 vector search (Phase 2)
│       └── hybrid.ts             # BM25 + vector + RRF fusion (Phase 3-min)
│
├── scrapers/                     # Data pipeline
│   ├── lib/                      # Shared modules: fetcher, extractor, robots,
│   │                             #   discover (URL graph), quality_score,
│   │                             #   canonical, geocode, prefecture_match,
│   │                             #   spot_filter, state, slack, types
│   ├── sources/                  # Per-source fetchers (TS + a few Python)
│   ├── municipal/scrape_one.ts   # Single-municipality scraper entry
│   ├── translate/                # Anthropic Batch API translation passes
│   ├── embed/build_embeddings.ts # multilingual-e5 embedding builder
│   ├── quality/quality_report.ts # Coverage gap + per-spot quality scoring
│   ├── matcher/                  # Wikidata ↔ scrape entity matching
│   ├── glossary/                 # Multilingual canonical-name pairs
│   ├── hf/                       # Hugging Face dataset card + upload scripts
│   ├── daily.ts                  # Steady scrape orchestrator (30-day SLA)
│   ├── pilot.ts                  # Dev-only Tottori+Kochi smoke run
│   ├── r3_refresh.ts             # R-3 official-source refresh (day-of-week rotation)
│   ├── run_enriched_scrape.ts    # Multi-source burst orchestrator (ADR 0001)
│   └── merge_wikidata.ts         # Wikidata → prefecture-file merge
│
├── data/                         # Mostly gitignored — see "Data layer" below
├── tests/lib/                    # Vitest unit tests for scrapers/lib + src/lib
├── tests/fixtures/               # Static input fixtures (prefectures, municipalities)
├── docs/                         # Policy, ADRs, automation design, quality reports
└── .github/workflows/            # Five workflows: see "Automation" below
```

---

## Common commands

```sh
# Build / run
npm run build                  # tsc → dist/, chmod +x
npm start                      # node dist/src/index.js (stdio MCP)
npm run dev                    # tsx watch src/index.ts

# Type-check
npm run typecheck              # src/ only (uses tsconfig.json)
npm run typecheck:all          # + scrapers/ + tests/ (uses tsconfig.scrapers.json)

# Tests
npm test                       # vitest run (tests/**/*.test.ts)
npm run test:watch
npm run test:coverage

# Scraper orchestrators
npm run scrape:pilot           # Tottori (31) + Kochi (39); PILOT_PREFECTURES=all to override
npm run scrape:daily           # Steady incremental scrape (used by steady-scrape.yml)
npm run scrape:r3              # R-3 official sources rotation
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

---

## Architecture

### MCP server (`src/`)

The server registers **15 tools**, all defined in a single `TOOLS` array
near the bottom of `src/index.ts` (search for `name: "search_area"`).
Both transports share the same registry via `buildServer()`:

| Tool | Purpose |
|---|---|
| `search_area` | Lexical search across prefectures / municipalities / attractions / R-3 records (4 langs) |
| `search_semantic` | Vector search over `multilingual-e5-small` embeddings (Phase 2) |
| `search_hybrid` | BM25 + vector + RRF fusion — preferred general-purpose retriever (Phase 3-min) |
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

**Two transports**: `index.ts` is stdio (Claude Desktop, Cursor); `index_http.ts`
is Streamable-HTTP for HF Spaces / Cloudflare Workers (default port 7860).
Both call `buildServer()` — keep tool changes in `index.ts` and they apply to both.

**Search infrastructure is content-neutral** (per
[`EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md)). BM25, embeddings, and RRF
**reorder** official content; they must not select or suppress it. Don't
introduce ranking signals like "famous" or "tourist-favourite" — that's the
LLM client's job, not the server's.

### Scraper pipeline (`scrapers/`)

Three orchestrators you'll touch most often:

- **`daily.ts`** — steady incremental scrape. Picks ~70 oldest-by-`last_scraped_at`
  municipalities, hits each domain once with a 5s interval, updates
  `data/_state/scrape_state.json`. Triggered nightly by `steady-scrape.yml`.
- **`r3_refresh.ts`** — refreshes R-3 sources (MAFF GI, METI, Japan Heritage,
  Bunka, UNESCO, DMOs) on a day-of-week rotation, then incrementally translates
  new records via the Anthropic Batch API.
- **`run_enriched_scrape.ts`** — multi-source burst: feeds municipal pages +
  prefecture portals + tourism-association sites into the same extractor.
  Triggered manually by `burst-scrape.yml`.

The scraper-side modules in `scrapers/lib/` are well-tested (see `tests/lib/`)
and shared by every orchestrator. New sources should reuse `fetcher`,
`extractor`, `robots`, and `quality_score` rather than reinventing them.

**TS vs Python**: most fetchers are TypeScript. Python is used only where
an existing ecosystem tool fits better — currently DMO PDF parsing (`fetch_dmo*.py`)
and the Hugging Face card upload (`scrapers/hf/`). Don't add Python for
anything that fits the TS pipeline.

### Data layer (`data/`)

Most of `data/` is **gitignored** because it's bulk runtime data that lives
on Hugging Face. See [`.gitignore`](.gitignore) for the authoritative list.
What **is** committed:

```
data/_state/
  dmo_website_overrides.json     # Manual DMO URL corrections
  prefecture_tourism_orgs.json   # Per-prefecture portal seed list
  scrape_state.json              # Steady-scrape SLA tracker (last_scraped_at, errors)
  tourism_org_urls.json          # Resolved multi-source URLs per muni (ADR 0001 A)
  translation_batch.json         # Anthropic batch IDs (transient)
  r3_translation_batch.json      # Same, for R-3 sources
data/_logs/                      # Run summaries (daily/pilot/quality, JSON + MD)
data/knowledge/taxonomies/       # japan_historical_eras.json, japan_regions.json
data/hotels/review/              # Reserved for human review of contested merges
data/hf_card_assets/             # Images / charts shipped with the HF dataset card
data/metadata.json               # Dataset version metadata
```

What lives **only on Hugging Face** (downloaded at runtime, written by scrapers):

```
data/prefectures/<slug>.json     # 47 files — per-prefecture spots + wikidata_attractions
data/hotels/master.json          # Merged Wikidata + OSM hotels
data/hotels/raw/{wikidata,osm}.jsonl
data/translations/descriptions_complete.jsonl    # 17-lang descriptions
data/translations/multilingual_complete.jsonl    # 17-lang names
data/embeddings/spots.{f16.bin,index.json}       # Vector index (~50MB)
data/r3/<source>.json + r3/translations/r3_translations.jsonl
data/_state/{municipalities,municipality_centroids,official_urls,wikidata_attractions}.json
```

**Don't commit anything in those paths** — `.gitignore` already excludes
them, but be aware that `git status` after a scrape run will look quiet
even when many MB have been written.

---

## Hard rules — do NOT violate without an ADR

These are the rules that have product-level consequences. Breaking them is
worse than leaving a task unfinished.

### Source selection ([`DATA_POLICY.md`](DATA_POLICY.md), [`EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md))

- **Only public, official, or open-licensed sources.** Government registries,
  content published by the subject itself (a city, a hotel), or open data
  with traceable provenance.
- **No OTAs, no paywalled content, no member-only content, no user reviews,
  no UGC.** This is a hard line — don't relax it for "richer" data.
- **Faithful integration is allowed; personal curation is not.** If an
  official source describes a craft as "dying", tagging the record `dying-craft`
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

- `steady-scrape` and `burst-scrape` **must never run concurrently** — they
  share a GitHub Actions concurrency group `scrape`. If you add a third
  scrape workflow, put it in the same group.

---

## Conventions

### TypeScript

- **ES2022, NodeNext, strict mode.** ESM only — `"type": "module"` in
  `package.json`. Use `.js` extensions on relative imports (NodeNext requirement).
- **Two tsconfigs**: `tsconfig.json` builds `src/` for shipping;
  `tsconfig.scrapers.json` extends it with `noEmit: true` and adds
  `scrapers/`, `tests/`, `vitest.config.ts` for type-checking only.
  `npm run typecheck:all` is the gate that catches scraper-side type errors.
- Don't add new packages without checking they're tree-shakeable / Node-compatible.
  The published binary needs to start in <1s on first run.

### Tests

- **Vitest, Node environment, `tests/**/*.test.ts`** (`vitest.config.ts`).
- Coverage targets `src/**/*.ts` and `scrapers/lib/**/*.ts`. The orchestrators
  (`daily.ts`, `pilot.ts`, etc.) and source fetchers are integration-level
  and not currently unit-tested — fixtures live in `tests/fixtures/`.
- Bug-first when fixing: write a failing test first, then fix.

### Commits & PRs

- **Don't add a `Co-Authored-By: Claude …` trailer** to commits in this repo.
- Recent commit style is short, prefix-emoji + scope: `✨ DMO URL discovery via …`,
  `🧹 DMO data hygiene: …`, `🔧 DMO websites: …`. Match the existing style.
- See [`CONTRIBUTING.md`](CONTRIBUTING.md): the bar for merging is intentionally
  low for data PRs — accuracy + public source + helpful coverage.

### Editorial discipline when adding tools

If you add a new MCP tool, it must satisfy the Editorial Policy:

1. Trace every record back to an official source.
2. Don't bake editorial taste into ranking or filtering.
3. Default to comprehensive output; let the LLM client narrow it.
4. If translations exist, use the requested `lang`; otherwise return original
   Japanese with a `translation_meta` marker (see `get_local_specialty` for
   the pattern).

---

## Automation (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|---|---|---|
| `steady-scrape.yml` | daily cron (currently disabled — flip when KJ approves) + manual | Incremental scrape; runs `daily.ts`, then `r3_refresh.ts`, commits state, syncs to HF |
| `burst-scrape.yml` | manual + PR label `burst-required` | Full re-scrape across 6 batches (3-1 … 3-6); shallow (~4-6h) or full (~12h) mode |
| `scrape.yml` | daily cron (legacy, **still active**) + manual | Predecessor of `steady-scrape.yml`; will be retired when steady-scrape goes live |
| `translate.yml` | manual only | Anthropic Batch API translation pass for missing names |
| `publish.yml` | git tag matching version | Publish package to npm |

**Required secrets**: `HF_TOKEN`, `ANTHROPIC_API_KEY`, `SLACK_WEBHOOK_URL`,
`NPM_TOKEN` (publish only). The HF token is required only while the dataset
is private — once public it's optional.

When changing a workflow, read [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md)
first — it documents the steady/burst split and the SLA reasoning.

---

## Where to look for…

| Question | File |
|---|---|
| Why do we have multiple data sources per municipality? | [`docs/decisions/0001-multi-source-tourism-data.md`](docs/decisions/0001-multi-source-tourism-data.md) |
| Editorial line on "hidden gems" / curation | [`docs/EDITORIAL_POLICY.md`](docs/EDITORIAL_POLICY.md) |
| Crawling rules / robots.txt stance | [`DATA_POLICY.md`](DATA_POLICY.md) |
| How steady vs burst differ | [`docs/automation/AUTOMATION_DESIGN.md`](docs/automation/AUTOMATION_DESIGN.md) |
| Coverage gaps per prefecture × topic | [`docs/quality/GAP_ANALYSIS.md`](docs/quality/GAP_ANALYSIS.md) |
| Quality benchmark (100 test queries) | [`docs/quality/TEST_100CASES.md`](docs/quality/TEST_100CASES.md) |
| Burst batching playbook (which prefectures in which batch) | [`docs/batches/README.md`](docs/batches/README.md) |
| HF dataset card content | [`scrapers/hf/dataset_card.md`](scrapers/hf/dataset_card.md) |
| arXiv preprint draft | [`docs/arxiv/japan_travel_mcp.tex`](docs/arxiv/japan_travel_mcp.tex) |
| User-facing setup (MCP clients, dataset download) | [`README.md`](README.md) |
| How to add a hotel / muni / source | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
