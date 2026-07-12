# Data Collection Policy

## What we collect

All data in this repository comes from publicly accessible web pages —  
the same pages any person can read in a browser.

We collect:
- Municipal tourism pages (official government websites)
- Prefectural tourism office content
- Prefectural ryokan business-license registries
- Hotel and ryokan official homepages
- JNTO (Japan National Tourism Organization) published data
- Japan Tourism Agency accommodation statistics
- OpenStreetMap and Wikidata

We do not collect:
- Content behind login walls
- Member-only or paywalled content
- OTA (Online Travel Agency) inventory or pricing data
- User reviews or user-generated content

---

## How we think about robots.txt

We retrieve `robots.txt` from every domain before crawling.  
We treat it as a signal of intent, not a binary on/off switch.

**We always respect:**  
Private paths — admin panels, member areas, anything clearly not meant for the public.

**Our position on public tourism content:**  
When a municipality or hotel publishes tourism information specifically  
to reach visitors from around the world,  
we don't believe that blocking AI agents serves that intent.  
We believe it contradicts it.

You may disagree. That's a fair conversation to have.

If you are a site owner and want your content removed,  
open an issue and we will act within 48 hours.

---

## How we crawl

- Each domain is refreshed **at most once every ~30 days** (rolling cycle)
- **Steady-state**: minimum **5-second interval** between requests to the same domain — slower than Googlebot, by design
- **Initial bootstrap**: may run faster, down to a 2-second per-domain interval, to finish the first build in hours
- We are a periodic snapshot, not a continuous crawler
- All data is cached statically in this repository
- Source sites are **never hit at query time**

---

## How freshness works

We aim to keep every record fresh within **30 days**.  
That's the freshness target — not a server-load mitigation.

**Implementation:**  
A GitHub Actions cron job runs daily in a 01:00–06:00 JST window. Each run is
**time-boxed**: it re-scrapes the stalest entities (oldest `last_scraped_at`
first) until a wall-clock budget is spent, then stops launching new work so the
R-3 refresh, state commit, and Hugging Face sync always complete within the job
timeout. Concretely:

- 1 daily cron run, stale-first selection
- Each domain hit at most once per run, with a 5-second per-domain interval
- The rolling cycle keeps every entity within the 30-day freshness target

The initial dataset is bootstrapped in a single run (a few hours, 2-second  
per-domain interval) — after that, the rolling daily cycle takes over.

---

## Consuming the dataset (stability contract)

For downstream consumers (e.g. itinerary or planning engines that gate on
verified feasibility), the dataset makes these guarantees:

- **Stable IDs.** Entity identifiers are invariant across snapshots.
  Wikidata-backed entities use their QID; scraped spots use a URL-derived id
  (sha256 of the source URL), so re-scraping unchanged content keeps the same
  id. Treat ids as durable keys across snapshots.
- **Honest nulls.** Absent data is `null`, never an inferred or estimated value
  presented as measured. A `null` means "not stated by an official source" —
  treat it as unknown, not as a fact. This lets a consumer safely skip a check
  rather than verify against a fabricated value.
- **Additive fields.** Field changes are additive and backward-compatible. New
  fields may appear; existing field meanings do not change without a
  `schema_version` bump in `metadata.json`.
- **Reproducible pinning.** For reproducibility, pin to a Hugging Face dataset
  commit revision (`snapshot_download(revision=<sha>)`). That revision is the
  immutable version of the snapshot you verified against. `metadata.json`
  also carries a `built_at` timestamp on the distributed copy.

---

## Licensing

We attribute all data to its original source.  
Where source data carries an explicit open license (e.g., CC BY),  
we honor and propagate that license.  
Our own compiled dataset is published under CC BY 4.0.

---

## Contact

For removal requests or questions about data sourcing,  
open an issue in this repository.  
We respond within 48 hours.
