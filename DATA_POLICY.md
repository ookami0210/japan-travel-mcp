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
A GitHub Actions cron job runs daily at 03:00 JST and re-scrapes ~70 entities  
each run (1,938 entities ÷ ~28 days ≈ 70/day). Over the cycle, every entity  
is touched once. Concretely:

- 1 daily cron run
- ~70 entities per run, picked as the 70 oldest by `last_scraped_at`
- Each domain hit once per cycle, with a 5-second per-domain interval
- ~28-day full cycle (fits within the 30-day freshness target)

The initial dataset is bootstrapped in a single run (a few hours, 2-second  
per-domain interval) — after that, the rolling 30-day cycle takes over.

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
