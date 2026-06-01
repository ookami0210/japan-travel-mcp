# Scraper automation design (GitHub Actions)

Status: **v2 — launch-grade design** (2026-05-21). Supersedes the 2026-05-01 draft.
Scope: every `active` source in [`DATA_SOURCES.md`](../../DATA_SOURCES.md) has a
scheduled venue, a 30-day refresh SLA, and a single-switch launch path.

Related docs:
- [`DATA_SOURCES.md`](../../DATA_SOURCES.md) — fetcher SSOT (CI-enforced)
- [`DATA_POLICY.md`](../../DATA_POLICY.md) — crawl etiquette / 30-day SLA / robots.txt
- [`docs/EDITORIAL_POLICY.md`](../EDITORIAL_POLICY.md) — content principle (公式の積み上げ)

---

## TL;DR

- **30-day SLA on everything**. Every active fetcher in `DATA_SOURCES.md` is
  assigned to one of four steady workflows; each workflow guarantees its
  sources are touched within 30 days.
- **State is always restored from HF** before any scraper runs. The pre-2026-05-21
  failure mode (gitignored `_state/municipalities.json` missing on the runner)
  is eliminated by an explicit `Prefetch state from HF` step in every workflow.
- **Cron is disabled until launch**, every workflow file ships with the
  `schedule:` block commented and a `workflow_dispatch:` button for manual
  smoke-tests. Launching = uncommenting four `schedule:` blocks (one per workflow).
- **GitHub Actions budget fits the free private tier (2,000 min/mo)** with
  ~25% headroom; once the repo flips public at launch the budget becomes
  unlimited.
- **Failure containment**: every step that talks to a third party is wrapped in
  `continue-on-error: true` or `try/catch` so one source's outage cannot block
  the others or the surrounding orchestrator.

---

## Channel inventory (= what gets scheduled)

Every active source from `DATA_SOURCES.md` is assigned to exactly one steady
workflow. Inactive / planned sources are tracked separately and not scheduled
until they reach `active`.

| Channel | Workflow file | Cadence | Approx wall time/run | Sources (DATA_SOURCES.md ids) |
|:---|:---|:---|---:|:---|
| **MUNI** | `steady-scrape.yml` | daily 03:00 JST | 40–60 min | #23 (1,938 munis @ 65–130/day) |
| **R3** | chained inside `steady-scrape.yml` | day-of-week rotation (Mon/Tue/Wed/Thu) | +5–10 min | #5 / #6 / #7 / #8 / #9 |
| **DMO** | `dmo-refresh.yml` | bi-weekly (1st + 15th) 04:00 JST | 30–60 min | #10 / #11 / #12 / #13 |
| **WD-FOUNDATION + GLOSSARY + WIKIPEDIA-SUMMARY** | `wd-foundation.yml` (matrix) | monthly (1st of month) 05:00 JST | 30–180 min per matrix leg | #1–4, #15–22, #24, #25, #29–38 |
| **EMBEDDINGS rebuild** | `embeddings-rebuild.yml` (`workflow_run`) | on successful `wd-foundation.yml` | 30–60 min | n/a (consumes upstream) |
| **BURST** (re-scrape) | `burst-scrape.yml` (manual + PR-label) | on demand | 4–12 h (6-batch matrix) | #23 (all munis) |
| **TRANSLATE** | `translate.yml` (manual) | as needed | <30 min (submit; Anthropic Batch is async) | — (incremental translate of new R-3 rows) |

> SEASONAL (#P9) and EVENTS (#P4/#P10/#P14) channels remain unscheduled — their
> fetchers are still `planned` in DATA_SOURCES.md. Add a row to the table here
> in the PR that flips them to `active`.

---

## Launch switch (one-page checklist)

To flip the steady cadences on once the repo goes public:

1. **Uncomment `schedule:` blocks** in:
   - `.github/workflows/steady-scrape.yml`
   - `.github/workflows/dmo-refresh.yml`
   - `.github/workflows/wd-foundation.yml`
   - (`embeddings-rebuild.yml` triggers automatically on successful `wd-foundation.yml` and needs no edit.)
2. **Delete the legacy `scrape.yml`** (replaced by `steady-scrape.yml`).
3. **Run each workflow once manually via `workflow_dispatch`** to verify HF
   prefetch + scrape + commit path, before the first cron fires.
4. **Watch the first 24 h of Slack notifications**. Failures during the
   transition are expected only if HF token or state-file schema drifts.

That is the entire launch sequence for automation. No code changes required.

---

## Workflow detail

### `steady-scrape.yml` — MUNI + chained R3 (daily)

**Trigger** (launch-state):
```yaml
on:
  schedule:
    - cron: "0 18 * * *"        # 03:00 JST = 18:00 UTC (previous day)
  workflow_dispatch:
    inputs:
      munis_per_day:
        description: "Override daily muni count (empty = auto)"
        default: ""
```

**Pre-launch state**: the `schedule:` block is commented; `workflow_dispatch:`
remains so a maintainer can smoke-test on demand.

**Steps**:

1. Checkout, Node 20, `npm ci`.
2. **Prefetch state from HF** (`_state/municipalities.json`,
   `official_urls.json`, `municipality_centroids.json`, `tourism_org_urls.json`,
   `wikidata_attractions.json`, `scrape_state.json`). Missing-file is logged
   but not fatal — daily.ts has its own auto-stop guard.
3. `npx tsx scrapers/daily.ts` (MUNI). Reads `DAILY_BATCH_SIZE` env, falls
   back to dynamic picker (overdue-first).
4. `npx tsx scrapers/r3_refresh.ts` (R3) — gated by `continue-on-error: true`
   so an R3 outage doesn't block the MUNI commit.
5. Commit `data/_logs/` + `data/_state/` (small, in-git). All bulk data
   (prefectures/*, translations/*, hotels/*) stays gitignored.
6. **Push bulk data to HF** dataset via `scrapers/hf/upload_dataset.py`.
7. Slack notification on failure.

**Concurrency**: `group: scrape` (shared with `burst-scrape.yml` so they cannot
overlap).

**Picker** (`scrapers/daily.ts` → `lib/state.ts:pickStaleMunicipalities`): selects
the `DAILY_BATCH_SIZE` (default 70) oldest-by-`last_scraped_at` municipalities
with a resolved official URL. 70/day × 28 days = 1,960 ≥ 1,938 — the picker
self-tunes to keep every muni inside the 30-day window.

**Wall time**: 40–60 min/day (observed historical median = 47 min over the
last successful run window).

### `dmo-refresh.yml` — DMO sources (bi-weekly)

**Trigger** (launch-state):
```yaml
on:
  schedule:
    - cron: "0 19 1,15 * *"     # 04:00 JST, 1st and 15th of each month
  workflow_dispatch:
```

**Steps**:

1. Checkout, Node 20, Python 3, `npm ci`.
2. **Prefetch state from HF** (`_state/dmo_seed_urls.json`,
   `_state/dmo_website_overrides.json`).
3. `find_dmo_websites.py` (quarterly cadence enforced internally — skip if last
   run < 90 days). DMO seed URL discovery.
4. `fetch_dmo.py` (monthly cadence — skip if last run < 28 days). 観光庁 registry.
5. `fetch_dmo_plans.py` (quarterly cadence). DMO plan PDFs.
6. `scrape_dmo_websites.ts` (bi-weekly — runs every invocation). Per-DMO site scrape.
7. Commit operational state; push bulk to HF.
8. Slack on failure.

**Why a separate workflow** (not chained inside steady-scrape): the DMO chain
adds ~30–60 min on its run days. Bundling into `steady-scrape.yml` would push
daily wall time past 90 min in the worst case and risk the 6 h GitHub-Actions
job ceiling on slow days.

### `wd-foundation.yml` — monthly Wikidata/OSM/Wikipedia refresh (matrix)

**Trigger** (launch-state):
```yaml
on:
  schedule:
    - cron: "0 20 1 * *"        # 05:00 JST on the 1st of each month
  workflow_dispatch:
    inputs:
      legs:
        description: "Comma-separated leg names to run (empty = all)"
        default: ""
```

**Matrix legs**:

| Leg | Sources | Approx wall time | Notes |
|:---|:---|---:|:---|
| `municipalities` | #1 / #2 / #3 | <5 min | rare drift; SPARQL |
| `tourism-orgs` | #4 | 20–40 min | search-engine API throttled |
| `wikidata-attractions` | #15 / #16 | 30–60 min | SPARQL paged |
| `hotels` | #17 / #18 / #19 | 60–90 min | Wikidata + Overpass + merge |
| `osm-poi-tags` | #24 | 30–60 min | Overpass batched |
| `wikidata-anchors` | #30 / #31 / #32 / #38 | 30–60 min | SPARQL + per-name resolver |
| `wikidata-descriptions` | #33 / #36 | 60–120 min | wbgetentities pagination |
| `wikipedia-summaries` | #34 / #35 | 60–180 min | 35 k entities @ Wikipedia REST budget |
| `wikipedia-lists` | #29 | 10–20 min | jawiki action=parse |
| `glossary` | #20 / #21 / #22 | 20–40 min | seed pairs + 17-lang names |
| `kunishitei` | #25 | 30–60 min | 文化庁 paginated POST |
| `industry-shukubo` | #26 / #27 / #37 | 10–20 min | small registries |

All legs run in parallel (`max-parallel: 6` default) with `fail-fast: false` so
one outage doesn't kill the rest. Each leg ends with a per-leg HF push.

**Concurrency**: `group: wd-foundation` (separate from `scrape`; MUNI and
wd-foundation can overlap because they touch disjoint domains).

### `embeddings-rebuild.yml` — e5 index rebuild after WD-FOUNDATION

**Trigger**:
```yaml
on:
  workflow_run:
    workflows: ["wd-foundation"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
```

Gated by `if: ${{ github.event.workflow_run.conclusion == 'success' }}` —
embeddings only rebuild when the upstream refresh actually succeeded.

**Steps**: prefetch full corpus from HF (state + all 47 prefecture files +
r3/*), run `scrapers/embed/build_embeddings.ts`, push embeddings index back to HF.

### `burst-scrape.yml` — full re-scrape (on demand)

Unchanged from v1 design. Manual `workflow_dispatch` (with `mode=shallow|full`,
`parallelism=1..6`, `resume_from_hf=false|true`) or PR-label `burst-required`.
6-batch matrix; shares `concurrency: scrape` so it cannot overlap with steady.

### Auxiliary workflows (unchanged)

- `translate.yml` — manual Anthropic Batch translate pass.
- `validate-data-sources.yml` — PR validator (CI gate).
- `no-internal-leakage.yml` — voice-policy enforcement on PRs.
- `publish.yml` — tag-driven npm release.

---

## GitHub Actions budget (private repo, free tier = 2,000 min/mo)

Pre-launch the repo is private; the budget below assumes the free tier. Post-launch the repo goes public and Actions minutes become unlimited.

| Workflow | Run frequency / month | Wall time / run | Total min / month |
|:---|---:|---:|---:|
| `steady-scrape.yml` (MUNI + R3) | 30 | 50 min | **1,500** |
| `dmo-refresh.yml` | 2 | 50 min | 100 |
| `wd-foundation.yml` (matrix sum) | 1 | sum of legs ≈ 250 min wall, but matrix-parallel ≈ 180 min billed minutes | 180 |
| `embeddings-rebuild.yml` | 1 | 50 min | 50 |
| `burst-scrape.yml` | 0–1 (only on scope-shift PRs) | 6×60 min matrix-parallel ≈ 360 min billed | 0–360 |
| `validate-data-sources.yml` + `no-internal-leakage.yml` (per PR) | ~20 (= 10 PRs × 2 jobs) | 3 min | 60 |
| `translate.yml` | 1 | 10 min | 10 |
| **Total (typical month, no burst)** | | | **~1,900 min** |
| **Total (with one burst)** | | | **~2,260 min** |

**Conclusion**: a typical month fits the free private tier with ~5% headroom.
A month containing a burst overflows by ~13% and would trip GitHub's hard-stop
on the runner; the mitigation is either (a) the repo is already public by then,
(b) upgrade to GitHub Pro ($4/mo → 3,000 min/mo), or (c) defer the burst by
one calendar month. Pre-launch we never schedule a burst that crosses the
month boundary.

**Once public** (post-launch), private-minute accounting stops applying.

---

## State restoration contract

Every workflow that runs a TypeScript scraper which reads `data/_state/*.json`
MUST execute the HF prefetch step before invoking the scraper. The list of
"essential" files differs per workflow but the pattern is identical:

```yaml
- name: Prefetch state from HF
  env:
    HF_TOKEN: ${{ secrets.HF_TOKEN }}
    HF_DATASET_REPO: ${{ secrets.HF_DATASET_REPO || 'open-travel/japan-travel-mcp-data' }}
  run: |
    python3 -m pip install --quiet huggingface_hub
    python3 scrapers/hf/prefetch_state.py --files <space-separated paths>
```

See `burst-scrape.yml` for the canonical implementation; the helper is being
extracted into `scrapers/hf/prefetch_state.py` so every workflow can call the
same code.

Hard rule: **a workflow that scrapes MUST NOT assume `_state/*.json` exists
in the runner FS**. The state is rebuilt from HF every run.

---

## Concurrency groups

| Group | Members | Why |
|:---|:---|:---|
| `scrape` | `steady-scrape.yml`, `burst-scrape.yml` | Both write per-prefecture files; cannot overlap |
| `dmo` | `dmo-refresh.yml` | Independent of MUNI; own group avoids accidental serial wait |
| `wd-foundation` | `wd-foundation.yml` | Independent of MUNI; own group |
| `embeddings` | `embeddings-rebuild.yml` | Sequence-gated by `workflow_run` |

`scrape.cancel-in-progress: false` — a steady run already in progress wins
over a newly-scheduled one; the new run gets skipped, not the active one.

---

## Failure handling

- **Source-level**: each fetcher's invocation in `r3_refresh.ts` and in the
  matrix legs of `wd-foundation.yml` is wrapped in `try/catch` so one outage
  doesn't take down its siblings.
- **Workflow-level**: every job ends with a `Slack on failure` step (only
  fires on `failure()`), keeping noise low.
- **State auto-stop**: `daily.ts` reads `auto_stop.triggered` from
  `scrape_state.json` and refuses to run until cleared. A run that triggers
  auto-stop posts a Slack with the reason.

---

## Migration plan (from current state to launch-ready)

| Step | When | Action |
|:---|:---|:---|
| 1 | now (this PR) | Update `AUTOMATION_DESIGN.md` (this doc) |
| 2 | now (this PR) | Add HF prefetch step to `steady-scrape.yml` |
| 3 | now (this PR) | Scaffold `dmo-refresh.yml` (cron commented; HF prefetch + DMO chain) |
| 4 | now (this PR) | Scaffold `wd-foundation.yml` (cron commented; matrix of legs) |
| 5 | now (this PR) | Scaffold `embeddings-rebuild.yml` (`workflow_run` trigger) |
| 6 | now (this PR) | Update `DATA_SOURCES.md` channel→workflow mapping |
| 7 | now (this PR) | Delete legacy `scrape.yml` (cron already disabled; replaced by `steady-scrape.yml`) |
| 8 | at launch | Flip 4 `schedule:` blocks ON; run each workflow once via `workflow_dispatch`; watch first 24 h |

Pre-launch the failure mode (daily-cron mail spam) is already silenced because
`scrape.yml`'s cron is commented. Steps 2–7 prepare the launch-ready state
without firing any new cron.

---

## Open questions (defer to operator at launch)

1. **Pro plan upgrade**: stay on free tier until we hit the cap, or upgrade
   proactively for headroom during the first burst month? — recommend: stay
   on free until repo flips public.
2. **Slack channel split**: today everything posts to one webhook. Split into
   `#mcp-scrape-alerts` (failure-only) vs `#mcp-scrape-summary` (daily
   success)? — recommend: keep single channel until volume justifies a split.
3. **Burst auto-fire on PR label**: keep `burst-required` label as the
   trigger, or require a manual `workflow_dispatch` even after merge? —
   recommend: keep label-trigger; the maintainer reviews the label decision
   during PR review.
4. **WD-FOUNDATION cadence**: monthly may be aggressive for `tourism-orgs`
   (drift is quarterly). Add a per-leg `if: dayOfMonth == 1 || (dayOfMonth == 1 && month % 3 == 1)` style gate to skip quarterly legs on non-quarterly months? — recommend: defer until first month's run reveals the actual delta.

---

## Future hooks

- **Phase A (ETag)** — adds `if-none-match` to the shared fetcher; no
  workflow change required.
- **Phase B (sitemap)** — adds `--use-sitemap` flag to `daily.ts`; rolled out
  gradually.
- **Phase C (content-hash)** — `embed:incremental` script alongside the
  existing `embed:build`; would be wired into `embeddings-rebuild.yml`.
- **Workflow generation** — once Phase A–C lands, `DATA_SOURCES.md` (or a
  paired structured registry) becomes the input to a generator that emits
  the workflow yml files automatically.
