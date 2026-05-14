# Drop non-Japan OSM hotels before matching

**Status:** Draft — pending review
**Area:** `scrapers/matcher/match_hotels.ts`
**Channel:** WD-FOUNDATION + OSM (hotels pipeline)

## Problem

`data/hotels/review/` is the queue of "likely but not confirmed" hotel matches
that the entity matcher cannot auto-merge. The folder currently holds **200**
files. A full scan (`scripts/inspect_hotel_review.py`) shows the queue is
dominated by noise:

| Bucket | Count | Share |
|---|---:|---:|
| Pairs of hotels **outside Japan** (`prefecture_code: null` on both candidates) | **113** | 56.5 % |
| Mixed pair (one Japan, one foreign) | 0 | 0 % |
| Pairs entirely inside Japan (genuine domain decisions) | 87 | 43.5 % |
| **Total** | **200** | 100 % |

Every non-Japan file costs a human a triage step that should never have been
asked for, and dilutes the signal of the 87 genuine Japan-domain decisions
the queue is supposed to surface.

The "mixed" bucket being empty is significant for the safety of the fix:
the matcher never groups a foreign hotel with a Japanese hotel (they are
hundreds of kilometres apart and never share a grid cell), so filtering
foreign-only records cannot break any genuine Japan pair.

### Concrete examples of the noise

The leaks are not limited to one country — the OSM bounding box pulls in
hotels from every neighbour:

- **Korea** — `00a0201d024b.json`: 뉴 힐탑 관광호텔 / 힐탑관광호텔, Seoul (37.51 N, 127.03 E).
- **China** — `0798bb674274.json`: 香格里拉公寓 / 香格里拉酒店, Dalian (38.92 N, 121.65 E).
- **Taiwan** — `0bf91f5ef845.json`: 新站旅店 / 新驛旅店, Taipei (25.05 N, 121.51 E).

All 113 off-Japan files have `prefecture_code: null` on both candidates.
All 87 genuine-Japan files have a real `prefecture_code`. The signal is
clean.

### Concrete examples of the genuine queue (which the fix preserves)

These are the hotel-domain decisions a reviewer should actually be asked
to make:

- `0f1387b700a6.json` — Mitsui Garden Hotel Sapporo vs *Sapporo West* (sibling).
- `15533456734d.json` — 札幌プリンスホテル vs 札幌プリンスホテルタワー (main + tower).
- `17750b82dcd9.json` — JR Inn Sapporo vs JR Inn Sapporo Kita-2-jō (sibling location).
- `13de10826f0f.json` — Hotel Clement Tokushima vs JR Hotel Clement Tokushima (rebrand?).

## Root cause

Two existing pieces of the pipeline interact incorrectly:

1. **`scrapers/sources/fetch_osm_hotels.ts:27`** queries Overpass with
   `JAPAN_BBOX = "20,120,46,154"`. That rectangle covers all of Japan but
   also includes the Korean peninsula, NE China (Liáoníng, Jílín), Taiwan,
   and the Russian Far East. The query has been pulling foreign hotels
   from every one of those regions.

2. **`scrapers/matcher/match_hotels.ts:285-302`** defines
   `nearestPrefecture()`, which already detects this situation: if no
   Japanese municipality centroid is within 30 km of a record's
   coordinates, the function returns `null` and the record's
   `prefecture_code` is set to `null`.

The defect is that the matcher **does not use that signal as a filter**.
Records with `prefecture_code: null` are still indexed into the matching
grid (line ~312), still paired with their neighbours, and still written
out to `data/hotels/review/` when their name similarity falls in the
"likely" band.

## Proposed fix

Insert a single filtering step in `match_hotels.ts` immediately after the
loop that assigns `prefecture_code` to records missing one (around the
existing line 309). Records with `prefecture_code === null` are dropped
before the grid is built, before matching runs, before review files are
emitted.

```typescript
// Drop records that nearestPrefecture() could not place inside Japan.
// These are foreign hotels pulled in by the generous OSM bounding box.
const before = all.length;
all = all.filter((h) => h.prefecture_code !== null);
const dropped = before - all.length;
console.log(`[matcher] dropped ${dropped} records with no Japan prefecture`);
```

### Why filter at the matcher, not at the source

We considered tightening the Overpass query in `fetch_osm_hotels.ts` to
use a polygonal Japan boundary (`area["ISO3166-1"="JP"]`) instead of a
rectangle. That would be cleaner in principle but:

- The query becomes meaningfully slower and depends on Overpass relation
  data being current.
- The matcher already has the geographic gate (`nearestPrefecture`); we
  would be duplicating the check.
- The matcher path is the one already producing the visible defect; a
  fix there has the smallest possible blast radius.

A future PR can tighten the Overpass query as well, at which point the
matcher filter becomes belt-and-braces.

## Residual risk

The 30 km threshold inside `nearestPrefecture` could theoretically null
out a legitimate Japanese hotel in a very remote location — Ogasawara,
remote Okinawa islands, an alpine refuge with no nearby municipality
centroid. The centroid file covers all 1,938 municipalities so this is
expected to be empty in practice, but the PR should:

1. Log the count of dropped records (the proposed snippet does this).
2. Print one sample dropped name + coordinates per pass for spot-check.
3. The reviewer eyeballs the sample for Japanese-looking names before
   accepting the new `master.json` / cleaned `review/`.

If the spot-check uncovers any Japanese hotels being dropped, the
mitigation is to raise the threshold (e.g. 30 km → 50 km) rather than
abandon the filter.

## Test plan

1. **Unit test** in `tests/lib/` (new file `match_hotels.test.ts`). Build
   a tiny fixture of three records:
   - One in Tōkyō (real `prefecture_code: "13"`).
   - One in Seoul (`prefecture_code: null` after `nearestPrefecture`).
   - One in the Sea of Japan (`prefecture_code: null`).

   Assert that after the new filter the matcher only considers the Tōkyō
   record and that no review file mentioning the Seoul / open-water
   record is emitted.

2. **Local end-to-end run.** Execute `tsx scrapers/matcher/match_hotels.ts`
   against the current raw inputs. Expected:
   - The "[matcher] dropped N records …" line is present.
   - `data/hotels/review/` shrinks from 200 files to approximately 87
     (the genuine-Japan count from the baseline inspection).
   - Re-running `python3 scripts/inspect_hotel_review.py` shows
     `both candidates null = 0` and an empty non-Japan sample.
   - A spot-check of the new `review/` shows the remaining files are
     all Japan-domain decisions (sibling annexes, Wikidata×OSM pairs).

3. **No regression in `master.json`.** Confirmed-match counts in the
   matcher's stats summary should be unchanged or slightly increased
   (foreign hotels were never confirming with Japanese hotels anyway).

## Open questions for review

1. **Is the matcher meant to run on a schedule?** The script is not
   wired into any `npm` script or workflow today; it appears to be run
   manually. If a scheduled run is intended, that is a separate small
   follow-up. The fix itself is independent of that decision.

2. **Should `DATA_SOURCES.md` be updated?** The fetcher entry for
   `match_hotels.ts` already exists. This change does not add or remove
   a source, so the validator should still pass. To be re-confirmed via
   `npm run validate:data-sources` before opening the PR.

3. **Commit the regenerated `master.json` and `review/` folder in the
   same PR, or in a follow-up data-only commit?** Bundling them keeps
   the before/after evidence reviewable in one place; the maintainer's
   preference decides.

## Out of scope

- Tightening `JAPAN_BBOX` in `fetch_osm_hotels.ts` (potential follow-up).
- Improving the matcher's sibling/annex false-positive rate
  (e.g. "Mitsui Garden Hotel Sapporo" vs "Mitsui Garden Hotel Sapporo
  West"). That is a separate, larger problem about name-similarity
  heuristics, not about country filtering.
- Wiring `match_hotels.ts` into a scheduled workflow.
