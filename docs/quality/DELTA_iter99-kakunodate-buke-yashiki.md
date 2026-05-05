# DELTA iter99 — Kakunodate buke-yashiki injection

## KPI (v4-data multi-judge median, n=100)

|        | Sat | Min | Cat |
|--------|----:|----:|----:|
| iter98 |  49 |  89 |   0 |
| iter99 |  50 |  89 |   0 |

Per-judge solo:
- judge1: 58 / 92 / 0 (was 58 / 92 / 0)
- judge2: 46 / 88 / 0 (was 44 / 88 / 0)

**Sat ≥ 50% target met.** Min 95% target not yet met.

## What changed

Three Wikidata records were added to `data/_state/wikidata_attractions.json`
and `data/prefectures/akita.json`:

| QID         | name_ja        | kinds                                                                  |
|-------------|----------------|------------------------------------------------------------------------|
| Q11428562   | 角館武家屋敷   | preservation_district, buke_yashiki, kominka, jokamachi, sakura_meisho_100 |
| Q11456008   | 青柳家         | buke_yashiki, kominka                                                  |
| Q11432009   | 石黒家         | buke_yashiki, kominka                                                  |

Each carries EN/ZH/KO labels, full description, dual heritage_designations
(`Q850649` Important Preservation District for Groups of Traditional Buildings
+ `Q11414752` Place of Scenic Beauty), `tier=must_see`, prominence_score 1.15
for the parent district.

## Cases affected

- **L1-14** (samurai district, Akita): wsat 3.79 → 4.85 → **flips Sat**
  (j1 5.00, j2 4.70).
- **L2-06** (Tohoku sakura): wsat j1 +0.10, j2 +0.70 → j2 flips Sat at 4.10;
  multi median still NOT-Sat (held by Aomori/Fukushima entities being out of
  Akita scope).
- **L2-16** (samurai districts search_area): wsat j1 +0.05, j2 +0.80 → both
  judges Sat; multi median already Sat at iter98, gets stronger.

All other 97 cases byte-identical to iter98 (verified via diff per batch).

## Files touched

- `data/_state/wikidata_attractions.json` (+3 entries)
- `data/prefectures/akita.json` (+3 entries)

No code changes; this is a pure data injection.
