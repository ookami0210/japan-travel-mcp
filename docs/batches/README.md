# Batch runs (operator playbook)

Some scrapes take long enough that we run them as discrete batches on
the operator's local machine. Each batch is sized to finish in roughly
two hours so the machine doesn't need to be left unattended overnight.

This page lists the available batches, the env vars to set, and the
expected duration. Run from the repo root.

## Multi-source sprint (ADR 0001)

### `discover:tourism_orgs` — discover the tourism-portal URL graph

Builds `data/_state/tourism_org_urls.json` from three strategies:

1. Prefecture-portal harvest (BFS over the 47 prefecture tourism portals,
   attribute outbound anchors to municipalities by name match).
2. Wikidata SPARQL (P856 / P973 URLs on entities anchored to a JIS code).
3. (Optional) DNS pattern probe — disabled by default, enable with
   `ENABLE_DNS_PROBE=1`.

State is saved after every prefecture portal so a crash mid-run loses at
most one portal's worth of work.

#### Three batches by JIS prefecture code

| Batch | Prefectures (JIS code) | Approx. wall time |
|:---:|:---|:---:|
| 1 | 01–15 (Hokkaido → Niigata) | 90–120 min |
| 2 | 16–32 (Toyama → Shimane) | 90–120 min |
| 3 | 33–47 (Okayama → Okinawa) | 90–120 min |

#### Run

```bash
# Batch 1
BATCH=1 npm run discover:tourism_orgs

# Batch 2 (after batch 1 finishes — same output file is appended to)
BATCH=2 npm run discover:tourism_orgs

# Batch 3
BATCH=3 npm run discover:tourism_orgs
```

#### Skip a strategy

```bash
SKIP=portal BATCH=1 npm run discover:tourism_orgs   # only Wikidata
SKIP=wikidata BATCH=1 npm run discover:tourism_orgs # only portal harvest
```

#### After all three batches

```bash
git add data/_state/tourism_org_urls.json
git commit -m "🌐 discover: tourism-org URL graph (batches 1-3)"
git push
```

The committer should also note the summary line at the bottom of the
JSON file:

```json
"summary": {
  "total_municipalities_seen": 1938,
  "with_at_least_one_candidate": 1500,    // example
  "with_primary": 1500
}
```

— roughly the count we want to see climb above ~1,200 to call this
"good enough" coverage. (~1,200 is a soft floor: it leaves the obvious
remaining gaps as known good-first-issue PRs.)

---

### `scrape:enriched` — re-scrape every municipality with the new pipeline

After `discover:tourism_orgs` produces `tourism_org_urls.json`, re-run
the municipal scrape across all 1,938 entities so the new article-body /
Schema.org / multi-seed extraction lands in `data/prefectures/*.json`.

The runner picks up every municipality in a JIS-prefecture range that
has at least one seed (city-hall URL OR tourism-org URL). Result is
merged into the per-prefecture file with the same semantics as
`scrape:daily`.

#### Six batches by region

| Batch | Region | Prefectures (JIS code) | Approx. wall time |
|:---:|:---|:---|:---:|
| 3-1 | Hokkaido + Tohoku | 01–07 | ~110 min |
| 3-2 | Kanto | 08–14 | ~110 min |
| 3-3 | Chubu | 15–23 | ~130 min |
| 3-4 | Kinki | 24–30 | ~90 min |
| 3-5 | Chugoku + Shikoku | 31–39 | ~95 min |
| 3-6 | Kyushu + Okinawa | 40–47 | ~110 min |

#### Run

```bash
# Dry run first to confirm seed counts:
DRY_RUN=1 BATCH=3-1 npm run scrape:enriched

# Actual run:
BATCH=3-1 npm run scrape:enriched

# Repeat for 3-2 ... 3-6 between operator-PC slots.
```

Custom prefecture range:

```bash
PREFS=19,22 npm run scrape:enriched   # Yamanashi + Shizuoka only
```

#### After all six batches

```bash
git add data/prefectures/ data/_logs/enriched_*.json
git commit -m "🌐 enriched re-scrape: full pipeline against new seeds (batches 3-1..3-6)"
git push
```

Then push the new `data/prefectures/*.json` to the HF dataset:

```bash
python3 scrapers/hf/upload_dataset.py \
  --commit-message "Enriched re-scrape: multi-source seeds, body paragraphs, Schema.org" \
  --no-card
```

Then re-run the demo queries (Yoshida fire festival, Minamiyamashiro tea
fields, Tajima beef) against a fresh local checkout to confirm the
quality target is hit before resuming the launch plan.
