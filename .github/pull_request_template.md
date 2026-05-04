<!-- Pull request template — japan-travel-mcp -->

## Summary

<!-- 1-3 lines describing the change -->

## Test plan

<!-- How was this tested? Local run? Sample query? -->

---

## Data source checklist (FILL IF this PR touches scrapers/ OR data fetching)

If this PR adds, modifies, or removes a data source / fetcher, **all boxes
below must be checked**. Skip this section only if your PR has nothing to
do with data sources.

- [ ] **`DATA_SOURCES.md` updated** — added/modified/removed entry
- [ ] **Source ID assigned** (e.g. `#24` for new active, `#P15` for new planned)
- [ ] **Status** set correctly (`active` / `planned` / `deprecated`)
- [ ] **Channel** assigned (one of: MUNI / R3 / DMO / WD-FOUNDATION /
      GLOSSARY / WIKIPEDIA-ABSTRACT / EVENTS / SEASONAL / **NEW channel**)
- [ ] **Cadence (steady)** documented (e.g. "weekly Mon", "monthly+", "30-day SLA")
- [ ] **License / 公式機関 確認**: source 由来が `DATA_POLICY.md` に整合
      (公式機関の公開情報 OR 明示ライセンス CC0/CC BY/ODbL/政府標準利用規約)
- [ ] **Output path** documented (e.g. `data/r3/<name>.json`)
- [ ] **Fetcher reference** in DATA_SOURCES.md points to the actual file
- [ ] **Validation script passes**: `npm run validate:data-sources`

### If channel = R3 (weekly rotation chained after MUNI):

- [ ] Added to `scrapers/r3_refresh.ts` `DAY_TO_SOURCES` + `SOURCE_INFO`
- [ ] Day-of-week assigned (Mon / Tue / Wed / Thu / Fri / Sat / Sun)

### If channel = MUNI / DMO / WD-FOUNDATION / EVENTS / SEASONAL:

- [ ] Existing workflow `.github/workflows/<channel>.yml` covers this source,
      OR a new workflow is added in this PR
- [ ] Cron schedule in workflow matches DATA_SOURCES.md cadence

### If a NEW channel is being introduced:

- [ ] New workflow `.github/workflows/<new-channel>-scrape.yml` created
- [ ] `concurrency.group` set so it doesn't conflict with `scrape` group
      where appropriate
- [ ] Notification (Slack) wired
- [ ] DATA_SOURCES.md "Master rotation contract" table updated

### Execution venue note

- [ ] If still **cold-start running locally on local machine** at merge time,
      `Execution venue (current)` set to `local`. Note this is operational
      metadata only — the data source identity and steady cadence are
      already locked in this PR
- [ ] When the steady GH Actions workflow flips ON, a follow-up PR will
      change `Execution venue (current)` from `local` → `gh-actions`

---

## Other concerns

- [ ] Tests pass (`npm test`)
- [ ] Typecheck passes (`npm run typecheck`)
- [ ] No secrets / credentials in diff
- [ ] No commented-out code left behind
- [ ] Memory file or doc updated if architectural change

## Reviewer notes

<!-- Anything specific you want reviewers to focus on -->
