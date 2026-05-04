# Scraper automation design (GitHub Actions)

Status: **DRAFT** (2026-05-01).
Owner: project maintainers.
Related memory: `project_japan_travel_mcp_diff_phases.md` (Phase A/B/C diff).

## Goals

Two scraper types, two workflows, one shared state on the HF dataset.

| Type | Goal | Cadence | Wall time | Trigger |
|:---|:---|:---|:---|:---|
| **steady** (定常) | Refresh every municipality within 30 days, smooth daily load | daily cron | ~40-80 min/day | scheduled + manual |
| **burst** (臨時) | Re-scrape all 1,938 munis after a feature/scope change, ≤24h | on demand | ~4-12h (split across batches) | manual + PR label |

Operational rule: **steady and burst NEVER run concurrently**. Enforced by
GitHub Actions `concurrency` key (`group: scrape`).

## Design decisions (approved 2026-05-01)

- **State storage**: HF dataset `open-travel/japan-travel-mcp-data` (no Firestore).
- **Burst trigger**: manual `workflow_dispatch` + PR label `burst-required` —
  a maintainer labels and confirms before merge. **No path-based auto-fire.**
- **Failure notifications**: Slack via existing `scrapers/lib/slack.ts`.
- **GitHub plan**: Pro upgrade ($4/month) if free tier exceeded.

## Steady scraper (`steady-scrape.yml`)

### Trigger

```yaml
on:
  schedule:
    - cron: "0 18 * * *"   # 03:00 JST (18:00 UTC previous day)
  workflow_dispatch:
    inputs:
      munis_per_day:
        description: "Override daily muni count (default: auto)"
        default: ""
```

### Picker logic (in `scrapers/daily.ts`, refactored)

```typescript
function pickToday(): MunicipalityInput[] {
  const overdue = munis.filter(m => daysSince(m.last_scraped_at) >= 30);
  const fresh   = munis.filter(m => daysSince(m.last_scraped_at) <  30)
                       .sort((a, b) => daysSince(b) - daysSince(a));

  // Hard SLA: every overdue muni MUST be in today's run.
  // Soft floor: even on slow days, do at least MIN_PER_DAY.
  // Soft ceiling: cap at MAX_PER_DAY to keep wall time under 80 min.
  const N = clamp(
    Math.max(MIN_PER_DAY, overdue.length, Math.ceil(stale.length / daysToHardLimit())),
    MIN_PER_DAY,
    MAX_PER_DAY,
  );
  return [...overdue, ...fresh.slice(0, Math.max(0, N - overdue.length))];
}
```

Env knobs:
- `MIN_PER_DAY` = 65 (= ceil(1938/30))
- `MAX_PER_DAY` = 130 (= ~80 min wall time)
- `MUNIS_PER_DAY` (workflow input) = override

### Steps

1. Checkout
2. Setup Node 20
3. `npm ci`
4. Pull state (`_state/scrape_state.json`) from HF
5. `tsx scrapers/daily.ts` (uses new picker)
6. R-3 weekly rotation (current behavior, preserved)
7. Commit `data/_state/*.json` + `data/_logs/*.json` to git
8. Upload `data/prefectures/*.json` + state to HF
9. Slack: success or failure summary

### Concurrency / safety

```yaml
concurrency:
  group: scrape         # shared with burst — they cannot overlap
  cancel-in-progress: false
```

## Burst scraper (`burst-scrape.yml`)

### Trigger

```yaml
on:
  workflow_dispatch:
    inputs:
      mode:
        type: choice
        options: [shallow, full]
        default: shallow
      prefs:
        description: "Comma-separated JIS codes (e.g. 01,02). Empty = all."
        default: ""
  pull_request:
    types: [labeled]    # only fires when 'burst-required' label is added
```

### Mode tradeoffs

| Param | full | shallow |
|:---|:---|:---|
| `maxPagesPerMunicipality` | 150 | 30 |
| `MAX_BODY_PARAGRAPHS` | 30 | 10 |
| `globalConcurrency` | 8 | 16 |
| `retries` | 2 | 1 |
| Wall time (1,938 munis) | ~12h | ~4-6h |
| Use case | Major feature launch, scope expansion | Quick refresh after small change |

### Steps

1. Wait for `burst-required` label on PR (maintainer review and approval first)
2. Steady cron is paused via concurrency group
3. Run all 6 batches sequentially with `RESUME=1` and per-prefecture flush
4. Each batch ≤ 6h GitHub Actions limit
5. Slack: progress per batch, success/failure summary

### Matrix per-batch (planned)

```yaml
strategy:
  matrix:
    batch: [3-1, 3-2, 3-3, 3-4, 3-5, 3-6]
  max-parallel: 1   # serial, not parallel — concurrency group enforces too
```

Single-job alternative: one job that loops through all 6 batches with
`RESUME=1`, max 12h. Risk: GitHub Actions hard 6h limit per job.
**Decision**: matrix with serial, so each batch fits in 6h cleanly.

## Shared state schema

`data/_state/scrape_state.json` (HF dataset):

```json
{
  "schema_version": 1,
  "last_full_burst_at": "2026-05-02T05:00:00Z",
  "last_burst_mode": "full",
  "municipalities": {
    "012025": {
      "last_scraped_at": "2026-04-15T03:42:11Z",
      "last_status": "ok",
      "spots_count": 47,
      "errors_count": 2
    }
  }
}
```

Updated by both steady and daily after each muni completes.

## Trigger workflow (recommendation pattern)

Project rule: no full auto-fire. A maintainer reviews and approves.

```
PR opened with scope-affecting change
  → reviewer reads diff
  → reviewer comments on PR with recommendation
  → maintainer reads recommendation, decides
  → maintainer adds 'burst-required' label (or 'burst-not-needed')
  → Merge to main
  → If 'burst-required' label was on the PR: burst-scrape.yml fires
  → Slack notifies completion
```

Implementation: a tiny CI step on PR open that posts a recommendation
comment. For now, manual recommendation in review is fine.

## Open questions

1. Steady cron time: 03:00 JST OK? (current default)
2. Slack channel: same `#scrape-alerts` as today, or dedicated `#mcp-automation`?
3. Burst PR label name: `burst-required` OK? (alternatives: `scope-expanded`, `re-scrape`)
4. GitHub plan upgrade timing: now (proactive) or only when we hit the limit?

## Future hooks

- Phase A (ETag) → adds `if-none-match` to fetcher; no workflow change
- Phase B (sitemap) → adds `--use-sitemap` flag; gradual rollout
- Phase C (content-hash) → embed pipeline becomes incremental; new
  `embed:incremental` script alongside existing `embed:build`
