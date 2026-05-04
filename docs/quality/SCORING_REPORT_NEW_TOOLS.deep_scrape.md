# Quality test scoring — new-tools (deep-scrape, rubric v1 — canonical-asset)

Generated: 2026-05-01 22:01:27 UTC
Cases: 11
Judge: claude-sonnet-4-5 (LLM judge against our 0/1/2 rubric)

## Totals

- score-2 (strong):  **  8** / 11
- score-1 (partial): **  1** / 11
- score-0 (off):     **  2** / 11
- judge-failed:      0 / 11

**Raw points: 17 / 22 (77.3%)**

## Per-case detail

| ID | Tool | Score | Reason |
|:---|:-----|:-----:|:-------|
| S1 | search_hybrid | 2 | The top result is highly relevant, providing comprehensive information about traditional crafts in Fukuoka Prefecture, including seven METI- |
| S2 | search_hybrid | 1 | Query 겨울 축제 홋카이도 (winter festival Hokkaido) returns some relevant content—rank #2 is the Korean language Hokkaido tourism portal mentioning  |
| S3 | search_hybrid | 2 | Top results include highly relevant lantern festivals at temples: #1 is Nyoirinji Temple Wind Bell Festival, #3 is Yumura's lantern-on-river |
| S4 | search_semantic | 2 | Top result is a dedicated fermented food tourism course featuring soy sauce, Kinzanji miso, and dairy products—exactly what the query seeks. |
| K1 | get_festivals | 0 | Empty result (count=0, items=[]) for a common query term '花火' (fireworks). Japan has numerous fireworks festivals that should be discoverabl |
| K2 | get_traditional_arts | 2 | Query for '歌舞伎' returns exactly the two canonical designations: Important Intangible Cultural Property and UNESCO ICH. Both entries have com |
| K3 | get_local_food | 2 | Query for keyword '発酵' (fermentation) returns 5 highly relevant items. Top 4 are official GI-designated fermented foods (black vinegar, pick |
| K4 | get_local_food | 0 | Empty result list (count=0) for a valid query. Kyoto is famous for tofu dishes like yudofu, which should be in municipal/tourism content. Th |
| D1 | get_dmo | 2 | Response correctly returns all 3 registered DMOs covering Yamagata prefecture: the regional Tohoku DMO, the prefectural DMO, and a local-are |
| D2 | get_dmo | 2 | The response correctly returns exactly 24 candidate-status DMOs as specified by the filter. Each item contains complete, structured metadata |
| D3 | get_dmo | 2 | Query requests broad-region tier DMOs and the response correctly returns 10 registered 広域連携 (broad-region) DMOs with complete metadata inclu |
