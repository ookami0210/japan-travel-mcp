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
