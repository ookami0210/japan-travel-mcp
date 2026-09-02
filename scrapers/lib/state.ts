/**
 * Persistent scraper state.
 *
 * Tracks last_scraped_at per municipality so the daily cron can pick the
 * 30-day-stalest ~58 municipalities each run.
 */

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const STATE_PATH = new URL(
  "../../data/_state/scrape_state.json",
  import.meta.url,
);

export interface MunicipalityState {
  /** Null while a resumable crawl is still in progress (also treated as
   *  "never scraped" by the stale picker, so an unfinished municipality is
   *  re-picked first next window to continue). Stamped fresh only on
   *  completion. */
  last_scraped_at: string | null;
  last_status: "success" | "partial" | "failed" | "in_progress" | null;
  pages_fetched: number;
  spots_found: number;
  error_count: number;
  /** True when the last crawl hit the per-municipality page cap with URLs
   *  still queued — i.e. the official site is larger than the cap and was
   *  truncated. Lets the operator list municipalities that exceed the cap. */
  truncated_at_cap?: boolean;
  /** Tourism pages discovered in the last (or in-progress) crawl. */
  total_pages?: number;
}

export interface CoverageState {
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

// --- Refresh SLA thresholds ------------------------------------------------
// The refresh target is "every candidate municipality is re-scraped within
// ~30 days". Nightly throughput is NOT a batch-size knob — it is governed by
// the scrape run's wall-clock budget (DAILY_SCRAPE_MINUTES in
// steady-scrape.yml), working stale-first until the budget is spent (see
// daily.ts). These constants only define the SLA that the coverage verifier
// (coverage_check.ts) reports against; the grace band keeps 30 days a
// guideline, not a hard deadline.

/** Target full-cycle length. Slightly under 30 to leave a small grace margin. */
export const TARGET_CYCLE_DAYS = 28;
/** Age beyond which a municipality is "overdue" (reported by the verifier). */
export const SLA_DAYS = 33;

/**
 * Materialise picker output (codes, stalest-first) back into municipality
 * rows WITHOUT losing that order.
 *
 * Never consume picker output via `munis.filter(m => codes.includes(m.code))`
 * — filter preserves the source-array order (JIS code order), so in
 * time-bounded mode (where the picker returns every candidate) the daily
 * budget is spent on the lowest JIS codes every run and the stale tail is
 * never reached. The steady scraper looped on Hokkaido for weeks this way
 * while 1,700+ municipalities aged past the SLA.
 */
export function orderCodesToMunis<T extends { code: string }>(
  codes: string[],
  munis: T[],
): T[] {
  const byCode = new Map(munis.map((m) => [m.code, m]));
  const out: T[] = [];
  for (const c of codes) {
    const m = byCode.get(c);
    if (m) out.push(m);
  }
  return out;
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
  // Atomic write: a mid-run checkpoint (or a SIGKILL from a workflow step
  // timeout) must never leave a half-written scrape_state.json — a corrupt
  // state file would break the next run's HF prefetch. Write to a temp file
  // and rename, which is atomic on the same filesystem.
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, path);
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
