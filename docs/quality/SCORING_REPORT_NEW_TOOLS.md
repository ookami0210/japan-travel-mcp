# New-tools quality test — preliminary scoring (2026-05-01)

This report scores the 11-case `test_calls_new_tools.json` corpus against
the post-Phase 1/2/3 build. Embeddings were built against the **pre-scrape**
corpus (HF cache snapshot from 2026-04-30); the post-scrape rerun is the
launch-prep gate that needs to land in the next session.

Build: `49a0a48` + new-tools harness `523ab80`.
Index: `data/embeddings/spots.f16.bin` — 66,994 entries, multilingual-e5-small q8.

## Score rubric (KJ × Nancy original 100-case scoring)

- **2** — strong: tool returned what a human would have hand-picked
- **1** — partial: returned something useful but missed the central asset
- **0** — empty / off-topic

## Per-case scoring

| ID | Tool | Query | Result | Score | Notes |
|:---|:-----|:------|:------|:-----:|:------|
| S1 | search_hybrid | "endangered traditional craft" | 益子参考館 / 葛城地蔵尊 (top 3 hybrid hits) | **1** | Surfaced a Mashiko reference center (traditional pottery heritage), but didn't pull a 失われゆく / 後継者 phrase explicitly because they're rare in the pre-scrape corpus. Will re-test post-scrape. |
| S2 | search_hybrid | "겨울 축제 홋카이도" (Korean) + Hokkaido | "イベント案内" / "イベント" listings | **0** | Korean tokens never tokenised by BM25, vec retrieval pulled generic event-listing pages from the noise floor. Real Hokkaido winter festival assets need a richer scrape. |
| S3 | search_hybrid | "lantern festival temple" | 御柱祭 / 西隆寺 / 普門院 | **2** | Solid: a major festival + two temples. RRF boosted these because BM25 found "祭"/"寺" and vec liked the embedding. |
| S4 | search_semantic | "fermented Japanese food" | 松浜軒 / 日本料理 / 保食神社 | **1** | Top hits are a tea house and a food-related shrine. Misses the obvious miso/sake/natto hits — corpus needs the fermentation-specific MAFF GI items mixed into the index more aggressively. |
| K1 | get_festivals | keyword=花火 | 0 | **0** | No formal-designation festival has 花火 in its bunka/UNESCO name. Schema events from scrape will fix this once enriched scrape lands. |
| K2 | get_traditional_arts | keyword=歌舞伎 | 2 hits (歌舞伎 / 歌舞伎) | **2** | Returns the two designated kabuki entries. ✓ |
| K3 | get_local_food | keyword=発酵 | 5 hits (黒酢 / すんき / 紀州金山寺味噌 etc.) | **2** | All canonical fermented foods. ✓ |
| K4 | get_local_food | prefecture=kyoto + keyword=tofu | 0 | **0** | Latin keyword doesn't match Japanese "豆腐". Add bilingual translation pre-pass in next iteration, or document that keyword should be in source language. |
| D1 | get_dmo | prefecture=yamagata | 3 (東北観光推進機構 / 山形県観光物産協会 / おもてなし山形) | **2** | Correct broad → prefectural → regional cascade. ✓ |
| D2 | get_dmo | status=candidate | 24 hits | **2** | Matches official 候補DMO一覧 PDF row count. ✓ |
| D3 | get_dmo | type=broad | 10 hits | **2** | Matches official 広域連携DMO count (10 法人). ✓ |

**Total**: 14/22 (64%) — see also "Total possible" raw points = 22.

## Observations

1. **DMO + keyword-filter tools are gates we cleared** — D1/D2/D3 + K2/K3 all land **2** because they read directly from the canonical-source data. No further model improvement needed; this is a "done" tier.

2. **Hybrid retrieval is bottlenecked on corpus quality, not on the retrieval algorithm**. S3 (lantern festival temple) lands solidly because the targets exist in the index. S1 / S4 score only 1 because 失われゆく / 発酵 phrases are sparse in the pre-scrape data — the Phase 1 body_paragraphs widening (8→30) plus the in-flight enriched scrape will surface much more of this content.

3. **Cross-lingual queries (S2)** need either:
   - Better cross-lingual embeddings (e5-large, ~280MB → not for alpha)
   - OR a query-side language-detect + translate pass before retrieval (cheap, MVP-friendly)

4. **K1 (花火) and K4 (tofu)** failed for predictable, fixable reasons: keyword needs to be in the source language. Document this in the tool description, or add a bilingual seed list for common terms in a follow-up.

## Next session — what to verify

After the enriched scrape (Tasks 4) completes and `npm run embed:build` reruns:

- Re-run `python3 docs/quality/run_tests.py` against the 100-case set; expect uplift from 13/100 baseline driven by:
  - Phase 1 body widening (more spots have informative descriptions)
  - DMO entries surface in `search_area` once seeded into the lookup tables
  - Schema.org Event objects from the scrape now flow into get_festivals
- Re-run `python3 docs/quality/run_tests_new_tools.py` against the 11-case set; expect S1 / S4 / K1 to improve to **1** or **2** as the corpus gains "失われゆく" / "発酵" / "花火" body content.

Done state for launch: ≥75/100 on the original corpus, ≥17/22 on the new-tools corpus.
