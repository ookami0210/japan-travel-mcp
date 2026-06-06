/**
 * Coverage verifier for the 30-day refresh SLA.
 *
 * Measures how fresh the municipal dataset actually is and auto-tunes the
 * daily batch size so the refresh stays inside the ~30-day window without
 * over-scraping. Chained at the end of steady-scrape.yml (cheap, local-only)
 * and runnable on its own via `npm run scrape:coverage`.
 *
 * What it does:
 *   1. Builds the candidate set (municipalities with a resolved official URL).
 *   2. Computes the stalest candidate's age, the count past the SLA, and the
 *      never-scraped count.
 *   3. Writes a recommended batch size into scrape_state.json. daily.ts reads
 *      it on the next run: overdue → scale up to clear the backlog; fresh →
 *      relax to the cost-efficient baseline.
 *   4. Posts a Slack summary and writes a JSON log.
 *
 * It NEVER fetches anything — it only reads state already on disk. Safe to run
 * as a `continue-on-error` step; a failure here must not affect the scrape.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { notify } from "./lib/slack.js";
import {
  loadState,
  saveState,
  recommendBatchSize,
  baselineBatchSize,
  SLA_DAYS,
  TARGET_CYCLE_DAYS,
  type CoverageState,
} from "./lib/state.js";

const ROOT = new URL("../", import.meta.url);
const MUNI_PATH = new URL("data/_state/municipalities.json", ROOT);
const URLS_PATH = new URL("data/_state/official_urls.json", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

const MS_PER_DAY = 86_400_000;

interface MunicipalityRaw {
  code: string;
}

async function buildCandidateCodes(): Promise<string[]> {
  const muniFile = JSON.parse(
    await readFile(fileURLToPath(MUNI_PATH), "utf8"),
  ) as { municipalities: MunicipalityRaw[] };
  const urlsFile = JSON.parse(
    await readFile(fileURLToPath(URLS_PATH), "utf8"),
  ) as { entries: { code: string; official_url: string | null }[] };

  const withUrl = new Set<string>();
  for (const e of urlsFile.entries) {
    if (e.official_url) withUrl.add(e.code);
  }
  return muniFile.municipalities
    .map((m) => m.code)
    .filter((code) => withUrl.has(code));
}

async function main(): Promise<void> {
  const now = Date.now();
  const state = await loadState();
  const candidateCodes = await buildCandidateCodes();

  let maxAgeDays = 0;
  let neverScraped = 0;
  let countOverSla = 0;
  for (const code of candidateCodes) {
    const last = state.per_municipality[code]?.last_scraped_at;
    if (!last) {
      neverScraped += 1;
      maxAgeDays = Infinity;
      continue;
    }
    const ageDays = (now - new Date(last).getTime()) / MS_PER_DAY;
    if (ageDays > maxAgeDays) maxAgeDays = ageDays;
    if (ageDays > SLA_DAYS) countOverSla += 1;
  }

  const candidateCount = candidateCodes.length;
  const baseline = baselineBatchSize(candidateCount);
  const recommended = recommendBatchSize(candidateCount, maxAgeDays);
  const onTrack = neverScraped === 0 && Number.isFinite(maxAgeDays) && maxAgeDays <= SLA_DAYS;

  const coverage: CoverageState = {
    recommended_batch_size: recommended,
    last_check_at: new Date(now).toISOString(),
    max_age_days: Number.isFinite(maxAgeDays) ? Math.round(maxAgeDays * 10) / 10 : null,
    count_over_sla: countOverSla,
    never_scraped: neverScraped,
  };
  state.coverage = coverage;
  await saveState(state);

  const logPath = new URL(
    `coverage_${new Date(now).toISOString().replace(/[:.]/g, "-")}.json`,
    LOG_DIR,
  );
  await mkdir(dirname(fileURLToPath(logPath)), { recursive: true });
  await writeFile(
    fileURLToPath(logPath),
    JSON.stringify(
      {
        run_type: "coverage",
        checked_at: coverage.last_check_at,
        candidate_count: candidateCount,
        target_cycle_days: TARGET_CYCLE_DAYS,
        sla_days: SLA_DAYS,
        max_age_days: coverage.max_age_days,
        never_scraped: neverScraped,
        count_over_sla: countOverSla,
        baseline_batch_size: baseline,
        recommended_batch_size: recommended,
        on_track: onTrack,
      },
      null,
      2,
    ),
    "utf8",
  );

  const ageLabel = Number.isFinite(maxAgeDays)
    ? `${Math.round(maxAgeDays)}d stalest`
    : `${neverScraped} never scraped`;
  if (onTrack) {
    await notify(
      `📅 Coverage OK — ${ageLabel} ≤ ${SLA_DAYS}d SLA across ${candidateCount} munis. Batch → ${recommended}/day (baseline).`,
    );
  } else {
    await notify(
      `⚠️ Coverage behind SLA — ${ageLabel}, ${countOverSla} over ${SLA_DAYS}d. Auto-tuning batch ${baseline}→${recommended}/day to catch up.`,
      "error",
    );
  }
}

main().catch(async (err) => {
  console.error("[coverage] FAILED:", err);
  await notify(`🚨 Coverage check crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
