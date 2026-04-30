# ADR 0001 — Multi-source tourism data acquisition for the long tail

- **Status**: Accepted
- **Date**: 2026-04-30
- **Affects**: scrapers/, data/_state/, data/prefectures/, src/index.ts (new tools)

## Context

While preparing the launch demo, we picked three illustrative queries to show
the breadth of the dataset:

1. **Tea fields of Minamiyamashiro village (Kyoto), in English**
2. **Yoshida no Hi-matsuri (the fire festival of Fuji-Yoshida), in Spanish**
3. **Tajima beef, in Arabic**

Two of the three failed. The Tajima beef record (a MAFF Geographical
Indication) returned a rich Arabic description as expected. The other two
returned either zero results or only navigation-menu fragments
("Event calendar", "Tourism PR video"). The actual tourism content for those
two — for instance the official Fuji-Yoshida tourism association page at
`https://fujiyoshida.net/feature/yoshidafirefes/yoshidafirefes` — was never
ingested by our scrapers.

This is a quality failure of the kind that would be obvious to any first-time
user of the MCP server. With three example queries, getting two of them wrong
is not a presentational issue — it is a product issue.

## Problem

The current scraping architecture has five compounding limitations that
together produce the observed coverage gap:

1. **One URL per municipality.** `data/_state/official_urls.json` resolves
   each of the 1,938 municipalities to a single official URL — typically the
   city-hall website (`*.lg.jp`). In practice the substantive tourism
   content for most municipalities lives on a separately-operated
   tourism-association site (`fujiyoshida.net`, `kyoto.travel`,
   `visitokinawa.jp`, etc.). With only one URL per entity, those sites
   are entirely outside our crawl frontier.

2. **Crawl depth is too shallow.** `maxPagesPerMunicipality: 35` only
   reaches the first two layers of a typical tourism site: the home page
   and the index pages it links to ("Sightseeing", "Events calendar",
   "Festival overview"). The detailed feature article for an individual
   festival or speciality typically lives 3–4 hops deeper than the home
   page; we never get there.

3. **Tourism-keyword vocabulary is index-page level.** `discover.ts`
   recognises a narrow set of broad terms — 観光 (sightseeing),
   見どころ (highlights), イベント (events), 祭り (festival), plus
   English "festival" and "event". It does NOT recognise the longer
   tail of feature-page vocabulary that tourism-association sites
   actually use: 祭礼 / 催事 / 年中行事 / 神事 / 行事 (variants of
   ritual / festival / annual event), 特産 / 名物 / 銘菓 / 土産 / 逸品
   (regional speciality / famous local product / renowned confection /
   souvenir / exceptional item), 特集 (feature article), and English
   "things-to-do" / "must-see" / "guide" / "experience". Many of the
   pages we want to reach use exactly those terms and get skipped.

4. **The extractor only stores page-level metadata.** Each scraped page
   contributes `name / description / address / coordinates / language`,
   where description is the meta description or first paragraph. The
   article body — the actual narrative content tourists want — is
   discarded. Even when we *do* reach a rich feature page, we keep only
   one paragraph of it.

5. **Festivals, year-round events, and regional foods are not first-class
   entity types.** They are flattened into `municipality.spots[]`. Festival-
   specific fields (date pattern, scale, history, ritual elements) have no
   schema. The `get_events` tool depends entirely on Wikidata SPARQL, which
   has very uneven coverage outside major events — Yamanashi prefecture
   currently returns zero festivals.

These limitations have been latent since the project started, masked by
demos that happened to query well-covered topics (large attractions with
strong Wikidata anchors, MAFF/METI-designated items with their own scrape
pipeline). They surface immediately when we test the actual stated use
case: a long-tail municipality and a regional festival.

## Decision

We are pausing the launch (Phase 1 of the GTM plan) and running a
focused two-to-three-week data-quality sprint that addresses all five
limitations.

The scope is not a "fix the demo" patch. It is a redesign of the data
acquisition layer. The five workstreams (A–E) are:

- **A. Multi-source URL graph.** Replace the single `official_urls.json`
  with a multi-source URL graph per municipality: city-hall site +
  tourism-association site(s) + relevant prefecture / theme portals.
  All 1,938 municipalities, not a curated subset.
- **B. Deeper, broader crawls.** Expand the tourism-keyword vocabulary
  (Japanese and English), raise `maxPagesPerMunicipality` from 35 to 100,
  and add a depth-2 pass that follows feature-page links into individual
  articles.
- **C. Article-body extraction.** Extend the extractor to keep the first
  N paragraphs of article bodies and to parse JSON-LD / Schema.org
  `Event` and `Place` entities when present.
- **D. New entity types.** Promote festivals and regional foods to
  first-class types with their own tools (`get_festivals`,
  enriched `get_local_food`).
- **E. Quality observability.** Build a coverage-gap dashboard
  (language × prefecture × topic) and per-entity quality scores so we
  can see, week over week, where the dataset is thin.

## Decision rationale

> **We judged for not only main sightseeing regions but also local
> regions, as the concept is fair and flat data organization. The
> judgment of where to go must rely on the users who use this dataset
> and the end users.**

The temptation in this kind of sprint is to fix the top-100 tourism
destinations and ship. We are explicitly rejecting that path. The whole
point of this dataset is that the long tail is treated equally with the
head — Tokyo and Kyoto get the same depth as Tottori and Saga. A
"cover the famous places, leave the rest for v2" approach would
contradict the project's stated promise:

> "All 47 prefectures and all 1,938 entities are covered in parallel —
> no prioritization by population, fame, or tourism volume.
> Tokyo and Kyoto are here too — but the point of this dataset is
> everywhere else."

Whether a particular long-tail spot is interesting to a particular
traveller is a judgement that belongs to the end user. Our job is to
make sure the spot is *visible* and *equally well-described* when the
user goes looking. That is the actual contribution of the project.

A second rationale: the 99/1 quality rule. Three illustrative demo
queries, two failures. From an end-user perspective, that is a 67%
failure rate, not "two unfortunate edge cases". A demo cannot ship with
that ratio because every first-time user picks their own three queries
and most of them will look like the long-tail cases, not the head.

## Alternatives considered

### Alternative 1: Patch only the demo cases

Add `fujiyoshida.net` and a few other major tourism-association URLs
to a manual override list, ship Phase 1 on schedule.

Rejected. It would unblock the launch demo but leave the underlying
single-source design intact. The next user who tries a different
long-tail query would hit the same gap. This is exactly the kind of
"make the demo work, ignore the structural problem" path that the 99/1
rule is meant to prevent.

### Alternative 2: Top-100 tourism-association URL list

Manually compile tourism-association URLs for the top-100 most-visited
municipalities. Solves the demo and the most common queries.

Rejected. Contradicts the project's flat-coverage promise. Creates a
two-tier dataset: famous places get the full multi-source treatment,
everywhere else stays single-source. The point of this dataset is
specifically not that.

### Alternative 3: Ship with limitations documented

Phase 1 launches as planned. README and dataset card add a "known
limitations" section describing the long-tail coverage gap. Plan v1.1
to fix it.

Rejected. A launch is a one-shot event — the first impression of the
dataset compounds for months via Hacker News, Reddit, blog posts, and
LLM training corpora. Shipping with documented gaps means the dataset
gets indexed as "the one with patchy long-tail coverage" rather than
"the one that finally treats the long tail seriously".

## Consequences

### Schedule

- Launch (Phase 2 of the GTM plan onwards) is delayed by 2–3 weeks.
- Phase 1 deliverables already completed (HF dataset, npm CI, HF Space,
  README rewrite, arXiv draft, outreach list, coverage chart) remain
  done. We do not redo them.
- Phase 1 deliverables still pending on KJ (demo video, npm account,
  arXiv endorser, outreach list review) can proceed in parallel.

### Operational

- Daily scrape continues at 70 entities / day on the existing pipeline
  to maintain freshness during the sprint.
- A separate "enriched re-scrape" pipeline runs against all 1,938
  municipalities once during the sprint, applying the new URL graph,
  expanded keyword set, deeper crawl, and richer extractor. This is
  one-time work; afterwards the daily cron picks up the new schema
  automatically.
- `maxPagesPerMunicipality` rising from 35 to 100 increases the per-day
  crawl cost from ~2,500 page-fetches to ~7,000. Per-domain rate limit
  (5s) is unchanged, so per-domain load does not change. Total wall-
  clock for the daily run rises from ~30 min to ~90 min — within the
  GitHub Actions 6 h ceiling.

### Data layout

- New file: `data/_state/tourism_org_urls.json` — multi-source URL graph.
- Existing file: `data/_state/official_urls.json` — kept, becomes the
  "primary" source per municipality.
- Existing file: `data/_state/prefecture_tourism_orgs.json` (new) —
  47-row table of prefecture-level tourism associations.
- Per-prefecture data files (`data/prefectures/*.json`) gain new fields:
  `spots[].body_paragraphs[]`, `spots[].schema_org` (when present).

### Code

- New tools: `get_festivals`, enriched `get_local_food`.
- Extractor and discovery libraries gain new parameters and tests.
- The reference MCP server (`src/index.ts`) gains the two new tools and
  exposes the new fields where appropriate.

## Lineage of this decision

This decision was triggered by a single demo-preparation session on
2026-04-30 in which three out of three test queries surfaced the
underlying issue. The chat log of that session is the primary source
material; this ADR is the durable summary.

The three test queries were chosen to exercise three different
coverage patterns: a small-municipality landscape feature
(Minamiyamashiro tea fields, English), a regionally-famous festival
near a famous mountain (Yoshida fire festival, Spanish), and a
nationally-known designated product (Tajima beef, Arabic). Two of those
patterns turned out not to be supported by the current architecture.

We chose to preserve the discovery — including the failure — in this
ADR and in the commit history of the resulting changes, rather than
quietly fix the bug. The reason for this resource layer existing in
this form is part of the project's identity, and future contributors
should be able to read why.
