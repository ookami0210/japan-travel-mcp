# Data Collection Policy

## What we collect

All data in this repository comes from publicly accessible web pages —  
the same pages any person can read in a browser.

We collect:
- Municipal tourism pages (official government websites)
- Prefectural tourism office content
- Prefectural ryokan business license registries (旅館業許可リスト)
- Hotel and ryokan official homepages
- JNTO (Japan National Tourism Organization) published data
- 観光庁 (Japan Tourism Agency) accommodation statistics
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

- Each domain is visited **at most once per month**
- Minimum **5-second interval** between page requests within a session
- This is slower than Googlebot, by design
- We are a periodic snapshot, not a continuous crawler
- All data is cached statically in this repository
- Source sites are **never hit at query time**

---

## Initial dataset

The initial dataset was collected over **30 days**,  
spreading requests across time to minimize any impact on source servers.

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
