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

export interface ScraperState {
  schema_version: 1;
  last_run_at: string | null;
  per_municipality: Record<string, MunicipalityState>;
  auto_stop: {
    triggered: boolean;
    reason: string | null;
    triggered_at: string | null;
  };
}

const DEFAULT_STATE: ScraperState = {
  schema_version: 1,
  last_run_at: null,
  per_municipality: {},
  auto_stop: { triggered: false, reason: null, triggered_at: null },
};

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
