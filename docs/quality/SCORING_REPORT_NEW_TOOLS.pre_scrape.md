# Quality test scoring — new-tools (pre-scrape baseline)

> Pre-scrape baseline of the 11-case new-tools harness — same harness as
> the post-scrape rerun, but against the embedding index built on the
> pre-scrape HF dataset snapshot. Pre-scrape totals are 12/22 (54.5%);
> post-scrape will land in SCORING_REPORT_NEW_TOOLS.post_scrape.md.

Generated: 2026-04-30 17:47:07 UTC
Cases: 11
Judge: claude-sonnet-4-5 (LLM judge against KJ × Nancy 0/1/2 rubric)

## Totals

- score-2 (strong):  **  5** / 11
- score-1 (partial): **  2** / 11
- score-0 (off):     **  4** / 11
- judge-failed:      0 / 11

**Raw points: 12 / 22 (54.5%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| S1 | search_hybrid | 1 | Top result mentions traditional arts and crafts from Edo period, which is relevant. However, results are scattered (folk craft museum, stela |
| S2 | search_hybrid | 0 | Query asks for Hokkaido winter festivals (겨울 축제 = winter festival) but all results are generic event category pages with null descriptions.  |
| S3 | search_hybrid | 0 | Query seeks lantern festivals at temples, but results return unrelated temples and a festival (御柱祭) with no lantern connection. No actual la |
| S4 | search_semantic | 1 | Response includes '日本料理' (Japanese cuisine) at rank 2, which is broadly relevant to fermented Japanese food. However, the top result is an u |
| K1 | get_festivals | 0 | Empty result list (count=0) for a common query term '花火' (fireworks), which should return multiple Japanese festivals. No explanation given  |
| K2 | get_traditional_arts | 2 | Perfect response for a keyword filter query on '歌舞伎'. Returns exactly 2 canonical kabuki entries: the Important Intangible Cultural Property |
| K3 | get_local_food | 2 | Strong response. The keyword "発酵" (fermentation) filters correctly, returning 5 GI-designated foods that prominently feature fermentation in |
| K4 | get_local_food | 0 | Empty result list (count=0, items=[]) for a valid query about Kyoto tofu, a famous local food. The response provides no content to help answ |
| D1 | get_dmo | 2 | Response returns exactly what a DMO lookup for Yamagata should provide: 3 registered DMOs operating in Yamagata Prefecture (1 broad regional |
| D2 | get_dmo | 2 | Query explicitly requests DMOs with status='candidate'. Response returns exactly that: 24 candidate DMOs with complete metadata (names, pref |
| D3 | get_dmo | 2 | Query requested broad-region DMOs with type='broad' filter. Response returns exactly 10 registered 広域連携 (broad regional alliance) DMOs with  |
