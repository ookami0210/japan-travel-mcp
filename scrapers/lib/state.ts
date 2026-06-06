/**
 * Persistent scraper state.
 *
 * Tracks last_scraped_at per municipality so the daily cron can pick the
 * 30-day-stalest ~58 municipalities each run.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_PATH = new URL(
  "../../data/_state/scrape_state.json",
  import.meta.url,
);

export interface MunicipalityState {
  last_scraped_at: string | null;
  last_status: "success" | "partial" | "failed" | null;
  pages_fetched: number;
  spots_found: number;
  error_count: number;
}

export interface CoverageState {
  /** Recommended daily batch size, set by the coverage verifier. Null = use volume baseline. */
  recommended_batch_size: number | null;
  last_check_at: string | null;
  /** Days since the stalest candidate was last scraped (null when no data). */
  max_age_days: number | null;
  /** Candidates past the SLA threshold at the last check. */
  count_over_sla: number;
  /** Candidates never scraped at the last check. */
  never_scraped: number;
}

export interface ScraperState {
  schema_version: 1;
  last_run_at: string | null;
  per_municipality: Record<string, MunicipalityState>;
  auto_stop: {
    triggered: boolean;
    reason: string | null;
    triggered_at: string | null;
  };
  /** Optional — populated by coverage_check.ts. Absent in legacy state files. */
  coverage?: CoverageState;
}

const DEFAULT_STATE: ScraperState = {
  schema_version: 1,
  last_run_at: null,
  per_municipality: {},
  auto_stop: { triggered: false, reason: null, triggered_at: null },
};

// --- 30-day refresh SLA tuning ---------------------------------------------
// The refresh target is "every candidate municipality is re-scraped within
// ~30 days". The batch size is derived from the candidate count so it adapts
// to data volume automatically (more municipalities → larger daily batch).
// A grace band keeps cost down: 30 days is a guideline, not a hard deadline.

/** Target full-cycle length. Slightly under 30 to leave a small grace margin. */
export const TARGET_CYCLE_DAYS = 28;
/** Age beyond which a municipality is "overdue" and the verifier scales up. */
export const SLA_DAYS = 33;
/** Floor so a small dataset still makes daily progress. */
export const MIN_BATCH = 30;
/** Ceiling so a single daily run stays inside the runner time + politeness budget. */
export const MAX_BATCH = 130;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Cost-efficient baseline: just enough per day to touch every candidate
 * within TARGET_CYCLE_DAYS. Pure function of data volume.
 */
export function baselineBatchSize(candidateCount: number): number {
  if (candidateCount <= 0) return MIN_BATCH;
  return clamp(Math.ceil(candidateCount / TARGET_CYCLE_DAYS), MIN_BATCH, MAX_BATCH);
}

/**
 * Auto-tune the daily batch from observed coverage.
 *
 * - Fresh (stalest candidate within SLA): return the cost-efficient baseline,
 *   relaxing any earlier scale-up so we never over-scrape.
 * - Overdue (stalest candidate past SLA, or some never scraped): scale the
 *   baseline up in proportion to how far behind we are, capped at MAX_BATCH,
 *   so the backlog is cleared without a manual intervention.
 *
 * `maxAgeDays` is the age of the stalest candidate in days, or `Infinity`
 * when some candidate has never been scraped.
 */
export function recommendBatchSize(
  candidateCount: number,
  maxAgeDays: number,
): number {
  const baseline = baselineBatchSize(candidateCount);
  if (!Number.isFinite(maxAgeDays)) return MAX_BATCH; // never-scraped present
  if (maxAgeDays <= SLA_DAYS) return baseline; // comfortably fresh
  const scaled = Math.ceil(baseline * (maxAgeDays / TARGET_CYCLE_DAYS));
  return clamp(scaled, baseline, MAX_BATCH);
}

export async function loadState(): Promise<ScraperState> {
  const path = fileURLToPath(STATE_PATH);
  try {
    const txt = await readFile(path, "utf8");
    const data = JSON.parse(txt) as ScraperState;
    if (data.schema_version !== 1) return DEFAULT_STATE;
    return data;
  } catch {
    return DEFAULT_STATE;
  }
}

export async function saveState(state: ScraperState): Promise<void> {
  const path = fileURLToPath(STATE_PATH);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

export function pickStaleMunicipalities(
  state: ScraperState,
  allCodes: string[],
  count: number,
  now: Date = new Date(),
): string[] {
  const scored = allCodes.map((code) => {
    const ms = state.per_municipality[code];
    const last = ms?.last_scraped_at ? new Date(ms.last_scraped_at).getTime() : 0;
    return { code, last };
  });
  // Oldest first; never-scraped (last=0) always wins.
  scored.sort((a, b) => a.last - b.last);
  return scored.slice(0, count).map((s) => s.code);
}
