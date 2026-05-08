# Delta: iter99 (multi-judge) → bigday-0508-pre-e5 (v3 single-judge)

## Headline KPIs

| KPI | iter99 multi-judge median | bigday-0508-pre-e5 v3 single | Δ |
|:---|---:|---:|---:|
| Satisfaction Accuracy (≥4.0) | 50% | **54%** | **+4pp** |
| Minimum Acceptable (≥3.0 + safety + hallucination) | 89% | **95%** | **+6pp** ← **Min launch target HIT** |
| Catastrophic Error Rate | 0% | **0%** | maintained |

NOTE on judge type: iter99 was scored by the multi-judge harness (median of two
independent Sonnet judges). bigday-0508-pre-e5 was scored by the v3 single-judge
harness, which historically tracks 1–3pp tighter than the multi-judge median for
the same dataset (judges agree on the easy cases, disagree on the marginal ≥4
threshold). The +4pp / +6pp lift is robust to that calibration noise.

## What drove the lift (12 commits, 2026-05-08)

**Data expansions** (master 71,110 → 74,918 / +3,808 entries, +5.4 %)
- 3646ce1 Wikidata shukubo anchor — 29 records (+5 new / +18 enriched)
- 9320dd2 Wikidata Japan national-park anchor — 94 records (+58 new / +31 enriched)
- 4d8cb22 23 wikipedia lists inject — +1,969 new / +823 enriched
- 6397b20 wikipedia_lists +11 first wave — +866 / +1,340
- c8b0eba wikipedia_lists +11 second wave (pilgrimage / kilns / mountains / regional stations) — +910 / +764
- bc287dd Wikidata description backfill — 31,223 entries gain description_ja
- 4ab4cc6 ja Wikipedia summaries — 2,811 entries upgraded short→richer description_ja
- ddd720b en Wikipedia summaries — 388 entries upgraded + 973 enwiki titles

**Structured Solver fields**
- 88f0151 nearest_transit (Q55488 stations, 5 km haversine cap) — 41,087 attractions annotated
- 5382600 nearby_pois (top-5 within 1.5 km) — 42,317 attractions annotated
- a408c64 WD_TYPE_KIND +37 Japan-tourism categories (48 → 85; 93.6 % kind coverage)

**Semantic index**
- b07faca embedder now ingests description_ja + wikipedia_kind_tags
  (the e5 rebuild absorbing this is in progress at the time of this baseline;
  bigday-0508-post-e5 will measure the incremental lift from the new vector index)

## Per-dimension distribution (v3 single-judge, n=100)

| Dimension | Mean |
|:---|---:|
| groundedness | 4.93 |
| factual_accuracy | 4.81 |
| specificity | 4.06 |
| travel_feasibility | 3.91 |
| expression_quality | 3.85 |
| intent_understanding | 3.53 |
| practical_usefulness | 3.34 |
| constraint_handling | 3.08 |

`groundedness` and `factual_accuracy` are essentially saturated (4.81–4.93).
The remaining lift on Sat / Min lives in:
- `constraint_handling` (3.08) — query terms like "anaba" / "from Tokyo" /
  "wild" / "uncrowded" / "dying" are not yet honoured by intent or filters.
- `practical_usefulness` (3.34) — some cases retrieve the right corpus but
  the matched record lacks practical detail (price / hours / access).
- `intent_understanding` (3.53) — a handful of cases still route to the
  wrong tool (shamanic → Kabuki, religious diversity → generic heritage).

## Recurring failure modes (from sub-agent summaries)

- **F (Constraint Failure)** — "anaba", "uncrowded", "wild", "from Tokyo",
  "dying-craft" filters not implemented. Highest-frequency failure category.
- **A (Retrieval Failure)** — wrong tool routed for shamanic / pilgrimage /
  religious-diversity / aurora intents.
- **B (Ranking Failure)** — yokocho query top hit was an unrelated park;
  Yumihama Kasuri buried under food GIs.
- **No safety / hallucination failures** across all 100 cases.

## Next levers

1. **bigday-0508-post-e5 re-measure** (after e5 rebuild completes) — will
   isolate the semantic-index contribution. Expected: +1-3pp on Sat for
   queries that hinge on multilingual paraphrase matching.
2. **Constraint-handling intents** — add anaba / uncrowded / from-X /
   wild-vs-captive / dying-craft to intent.ts target_kinds. Each is small
   but the cumulative lift on `constraint_handling` (3.08 → 3.5+) would
   move several borderline cases over the Sat ≥4.0 threshold.
3. **Phase 1.1 文化庁 文化財 DB scaffold completion** — the kunishitei DB
   has 30k+ records currently absent from master. The /search/map-move
   JSON endpoint was discovered (returns prefecture-level markers); a
   Playwright-based per-record drill-down is the proper path.
4. **Phase 1.2.b 京都 sect site scraping** — Wikidata covered 38/39 of
   the named sub-temples already. The remaining gap (specific shukubo
   facility names like 和順会館 / 御室会館) needs per-domain scraping
   from sect official sites; deferred to a focused next-session sprint.
