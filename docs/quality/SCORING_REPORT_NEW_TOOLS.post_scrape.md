# Quality test scoring — new-tools (post-scrape)

Generated: 2026-05-01 09:17:20 UTC
Cases: 11
Judge: claude-sonnet-4-5 (LLM judge against KJ × Nancy 0/1/2 rubric)

## Totals

- score-2 (strong):  **  7** / 11
- score-1 (partial): **  2** / 11
- score-0 (off):     **  2** / 11
- judge-failed:      0 / 11

**Raw points: 16 / 22 (72.7%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| S1 | search_hybrid | 2 | Top result is precisely on-target: a comprehensive page about traditional crafts in Fukuoka, including METI-designated items with 100+ year  |
| S2 | search_hybrid | 1 | Query is Korean for 'winter festival Hokkaido'. Response contains relevant content: rank 3 shows Korean-language Hokkaido tourism page menti |
| S3 | search_hybrid | 1 | Response contains relevant lantern festival content (#1 is Wind Bell Festival at temple, #4 describes Yumura lantern festival), but these ar |
| S4 | search_semantic | 2 | Top result is a dedicated fermented food tourism course in Yasugi featuring soy sauce, miso, and dairy products—exactly what a researcher wo |
| K1 | get_festivals | 0 | Empty result list (count=0) for a common festival keyword '花火' (fireworks). Japan has numerous fireworks festivals that should appear in tou |
| K2 | get_traditional_arts | 2 | Perfect response: returns exactly 2 歌舞伎 entries (Important Intangible Cultural Property + UNESCO designation) with complete metadata includi |
| K3 | get_local_food | 2 | Query for "発酵" (fermentation) returns 5 highly relevant GI-designated foods: fermented black vinegar, unsalted lacto-fermented pickles, ferm |
| K4 | get_local_food | 0 | Empty result (count=0) for a query that should return Kyoto tofu specialties like yudofu. The English keyword 'tofu' appears not to match Ja |
| D1 | get_dmo | 2 | Response correctly returns all 3 registered DMOs covering Yamagata prefecture: one regional (Tohoku-wide), one prefectural (Yamagata Tourism |
| D2 | get_dmo | 2 | Perfect response for a DMO candidate-status filter query. Returns exactly 24 candidate DMOs with complete metadata (names, prefectures, muni |
| D3 | get_dmo | 2 | Query requested broad-region DMOs and received exactly that: 10 registered 広域連携 (broad-area) DMOs with complete metadata including names, pr |
