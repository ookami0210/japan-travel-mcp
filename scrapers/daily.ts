/**
 * Daily incremental scrape — invoked by GitHub Actions cron.
 *
 * Picks the ~70 stalest municipalities (last_scraped_at oldest) and runs
 * the same pipeline as pilot.ts. Over ~28 days this covers all 1,938
 * entities (1,741 municipalities + 197 designated-city wards) within the
 * 30-day freshness target.
 *
 * Output: appends to data/prefectures/<slug>.json by merging municipalities
 *         in-place by code (existing entries overwritten with fresh ones).
 *
 * Slack: notifies start, daily summary, and any auto-stop.
 */

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { scrapeOneMunicipality } from "./municipal/scrape_one.js";
import { ErrorCounter } from "./lib/fetcher.js";
import { notify } from "./lib/slack.js";
import {
  loadState,
  saveState,
  pickStaleMunicipalities,
  orderCodesToMunis,
} from "./lib/state.js";
import {
  mergePrefectureFile,
  readPrefFile,
  writePrefFileAtomic,
  type PrefFileMuniBlock,
} from "./lib/pref_file.js";
import {
  DEFAULT_OPTIONS,
  type MunicipalityInput,
  type MunicipalityScrapeResult,
  type PrefectureFile,
  type ScrapeOptions,
} from "./lib/types.js";

const ROOT = new URL("../", import.meta.url);
const MUNI_PATH = new URL("data/_state/municipalities.json", ROOT);
const URLS_PATH = new URL("data/_state/official_urls.json", ROOT);
const CENTROIDS_PATH = new URL(
  "data/_state/municipality_centroids.json",
  ROOT,
);
const PREFECTURES_DIR = new URL("data/prefectures/", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

// Manual override only. Empty/unset → the size is derived dynamically from
// the candidate count and the coverage verifier's recommendation (see main()).
const DAILY_BATCH_OVERRIDE = (() => {
  const raw = process.env.DAILY_BATCH_SIZE?.trim();
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

// Wall-clock budget for the scrape phase, in minutes. The run keeps starting
// stale municipalities until this budget is spent, then stops launching new
// ones so it can persist progress and push to Hugging Face inside the job's
// hard timeout. The workflow allots a longer job timeout than this budget so
// the commit + HF-sync tail always has room. A manual DAILY_BATCH_SIZE
// override disables the budget and runs a fixed count to completion.
const DAILY_SCRAPE_MINUTES = (() => {
  const raw = process.env.DAILY_SCRAPE_MINUTES?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 240;
})();

// Hard per-municipality wall-clock cap. The fetcher already times out each
// HTTP request, but a pathological site (dozens of slow pages + retries) can
// still keep one municipality in-flight far past the budget deadline. Because
// the run waits on Promise.all(), a single hung municipality would block the
// whole persist tail and eventually trip the workflow's job timeout — losing
// the entire night's scrape. Capping each municipality bounds the overshoot.
const MUNI_TIMEOUT_MINUTES = (() => {
  const raw = process.env.MUNI_TIMEOUT_MINUTES?.trim();
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

// How often the run flushes in-memory progress to disk. Persisting mid-run
// means a SIGKILL (workflow step timeout / job cancellation) loses at most
// this much work instead of the whole night — completed municipalities are
// already on disk and get committed + pushed to HF by the always()-guarded
// tail steps.
const CHECKPOINT_MINUTES = (() => {
  const raw = process.env.CHECKPOINT_MINUTES?.trim();
  const n = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5;
})();

const PREFECTURE_SLUGS: Record<string, string> = {
  "01": "hokkaido", "02": "aomori", "03": "iwate", "04": "miyagi",
  "05": "akita", "06": "yamagata", "07": "fukushima", "08": "ibaraki",
  "09": "tochigi", "10": "gunma", "11": "saitama", "12": "chiba",
  "13": "tokyo", "14": "kanagawa", "15": "niigata", "16": "toyama",
  "17": "ishikawa", "18": "fukui", "19": "yamanashi", "20": "nagano",
  "21": "gifu", "22": "shizuoka", "23": "aichi", "24": "mie",
  "25": "shiga", "26": "kyoto", "27": "osaka", "28": "hyogo",
  "29": "nara", "30": "wakayama", "31": "tottori", "32": "shimane",
  "33": "okayama", "34": "hiroshima", "35": "yamaguchi", "36": "tokushima",
  "37": "kagawa", "38": "ehime", "39": "kochi", "40": "fukuoka",
  "41": "saga", "42": "nagasaki", "43": "kumamoto", "44": "oita",
  "45": "miyazaki", "46": "kagoshima", "47": "okinawa",
};

interface MunicipalityRaw {
  code: string;
  name: string;
  prefecture_code: string;
  prefecture_name: string;
}

async function writePrefectureFile(
  slug: string,
  prefCode: string,
  prefName: string,
  results: MunicipalityScrapeResult[],
): Promise<void> {
  const path = fileURLToPath(new URL(`${slug}.json`, PREFECTURES_DIR));
  // Preservation-first merge (see scrapers/lib/pref_file.ts): keeps the
  // existing wikidata_attractions layer and every municipality block not
  // scraped tonight. Requires the workflow to prefetch prefectures/* from HF
  // so `existing` is the real current file, not empty-runner nothing.
  const existing = await readPrefFile(path);
  const merged = mergePrefectureFile(existing, {
    prefCode,
    prefName,
    slug,
    results: results as unknown as PrefFileMuniBlock[],
  });
  await writePrefFileAtomic(path, merged);
}

// Resolves to the promise's value, or to MUNI_TIMEOUT if `ms` elapses first.
// The timer is cleared as soon as the promise settles so a fast municipality
// never holds the event loop open waiting on a stale timeout.
const MUNI_TIMEOUT = Symbol("muni-timeout");
function withTimeout<T>(
  p: Promise<T>,
  ms: number,
): Promise<T | typeof MUNI_TIMEOUT> {
  let handle: ReturnType<typeof setTimeout>;
  const timeout = new Promise<typeof MUNI_TIMEOUT>((resolve) => {
    handle = setTimeout(() => resolve(MUNI_TIMEOUT), ms);
  });
  return Promise.race([
    p.finally(() => clearTimeout(handle)),
    timeout,
  ]);
}

async function main(): Promise<void> {
  const opts: ScrapeOptions = {
    ...DEFAULT_OPTIONS,
    rateLimitMs: 5000, // daily runs respect the public 5-second policy
  };

  const muniFile = JSON.parse(
    await readFile(fileURLToPath(MUNI_PATH), "utf8"),
  ) as { municipalities: MunicipalityRaw[] };
  const urlsFile = JSON.parse(
    await readFile(fileURLToPath(URLS_PATH), "utf8"),
  ) as { entries: { code: string; official_url: string | null }[] };
  let centroids: Record<string, { lat: number; lng: number }> = {};
  try {
    const f = JSON.parse(
      await readFile(fileURLToPath(CENTROIDS_PATH), "utf8"),
    ) as { centroids: Record<string, { lat: number; lng: number }> };
    centroids = f.centroids ?? {};
  } catch {
    /* missing centroids file — fallback chain will skip the centroid step */
  }

  const urlByCode = new Map<string, string>();
  for (const e of urlsFile.entries) {
    if (e.official_url) urlByCode.set(e.code, e.official_url);
  }

  const state = await loadState();
  if (state.auto_stop.triggered) {
    await notify(
      `⛔ Daily run skipped — auto_stop is active: ${state.auto_stop.reason}. Clear data/_state/scrape_state.json (auto_stop block) once resolved.`,
      "error",
    );
    return;
  }

  // Only consider municipalities that have a resolved official URL. A small,
  // expected set is permanently excluded because no official municipal website
  // exists to scrape — currently the six villages in the Nemuro Subprefecture
  // disputed-islands range (codes 0169xx–0170xx). They are not a coverage gap:
  // there is no site to fetch, so they are simply never candidates and never
  // count against the refresh SLA.
  const candidateCodes = muniFile.municipalities
    .filter((m) => urlByCode.has(m.code))
    .map((m) => m.code);

  // Selection is time-bounded by default: consider every stale candidate,
  // ordered stalest-first, and stop launching new scrapes once the time
  // budget is spent (see deadlineMs below). A manual DAILY_BATCH_SIZE override
  // switches back to a fixed count that runs to completion with no deadline.
  const timeBounded = DAILY_BATCH_OVERRIDE === null;
  const selectCount = DAILY_BATCH_OVERRIDE ?? candidateCodes.length;

  const todayCodes = pickStaleMunicipalities(state, candidateCodes, selectCount);
  // Stalest-first order MUST survive into the task list — in time-bounded
  // mode todayCodes covers every candidate, so an order-losing filter here
  // would burn the whole budget on the lowest JIS codes each night (see
  // orderCodesToMunis docs for the incident this caused).
  const todayMunis = orderCodesToMunis(todayCodes, muniFile.municipalities);

  const counter = new ErrorCounter();
  const limit = pLimit(opts.globalConcurrency);

  const runStart = Date.now();
  const deadlineMs = timeBounded
    ? runStart + DAILY_SCRAPE_MINUTES * 60_000
    : Number.POSITIVE_INFINITY;

  await notify(
    timeBounded
      ? `🌅 Daily scrape started — up to ${todayMunis.length} stale municipalities, time budget ${DAILY_SCRAPE_MINUTES} min`
      : `🌅 Daily scrape started — ${todayMunis.length} municipalities (manual override)`,
  );

  let aborted = false;
  let abortReason = "";

  // Group by prefecture for output file management
  const byPref = new Map<string, MunicipalityScrapeResult[]>();

  // Persist everything scraped so far to disk. Called on a timer during the
  // run (checkpoint) and once at the end. Idempotent: writePrefectureFile
  // merges by municipality code, so re-flushing the same prefecture with a
  // growing result set is safe. Making progress durable mid-run is what lets
  // a killed run keep the municipalities it already finished.
  let flushing = false;
  async function flushProgress(): Promise<void> {
    if (flushing) return; // never overlap two flushes
    flushing = true;
    try {
      for (const [prefCode, results] of Array.from(byPref.entries())) {
        const slug = PREFECTURE_SLUGS[prefCode];
        if (!slug) continue;
        const prefName = results[0]?.municipality.prefecture_name ?? prefCode;
        await writePrefectureFile(slug, prefCode, prefName, results);
      }
      state.last_run_at = new Date().toISOString();
      await saveState(state);
    } finally {
      flushing = false;
    }
  }

  // Periodic checkpoint. Sleeps CHECKPOINT_MINUTES between flushes; `wake()`
  // interrupts the sleep so the loop exits promptly once scraping finishes.
  let scrapingDone = false;
  let wake: () => void = () => {};
  const checkpointLoop = (async () => {
    while (!scrapingDone) {
      await new Promise<void>((resolve) => {
        const h = setTimeout(resolve, CHECKPOINT_MINUTES * 60_000);
        wake = () => {
          clearTimeout(h);
          resolve();
        };
      });
      if (scrapingDone) break;
      try {
        await flushProgress();
      } catch (err) {
        console.error(
          "[daily] checkpoint flush failed:",
          (err as Error).message,
        );
      }
    }
  })();

  const tasks = todayMunis.map((m) =>
    limit(async () => {
      if (aborted) return;
      // Time budget: once the deadline passes, stop LAUNCHING new
      // municipalities. In-flight scrapes run to completion; the remaining
      // job time is reserved for the R-3 refresh, state commit, and HF sync.
      if (Date.now() >= deadlineMs) return;
      const abortCheck = counter.shouldAbort(opts);
      if (abortCheck.abort) {
        aborted = true;
        abortReason = abortCheck.reason;
        return;
      }
      try {
        const r = await withTimeout(
          scrapeOneMunicipality(
            {
              code: m.code,
              name: m.name,
              prefecture_code: m.prefecture_code,
              prefecture_name: m.prefecture_name,
              official_url: urlByCode.get(m.code) ?? null,
            },
            opts,
            counter,
            centroids,
          ),
          MUNI_TIMEOUT_MINUTES * 60_000,
        );
        if (r === MUNI_TIMEOUT) {
          // Leave last_scraped_at untouched so this municipality stays stale
          // and is re-picked next run. The abandoned scrape's in-flight fetch
          // finishes in the background and is ignored.
          console.error(
            `[daily] ${m.name} exceeded ${MUNI_TIMEOUT_MINUTES}min cap — skipped (retries next run)`,
          );
          return;
        }
        if (!byPref.has(m.prefecture_code)) byPref.set(m.prefecture_code, []);
        byPref.get(m.prefecture_code)!.push(r);

        state.per_municipality[m.code] = {
          last_scraped_at: r.finished_at,
          last_status:
            r.spots.length > 0
              ? r.errors.length === 0
                ? "success"
                : "partial"
              : "failed",
          pages_fetched: r.pages_fetched,
          spots_found: r.spots.length,
          error_count: r.errors.length,
        };
      } catch (err) {
        console.error(
          `[daily] ${m.name} threw:`,
          (err as Error).message,
        );
      }
    }),
  );

  await Promise.all(tasks);

  // Stop the checkpoint timer and do the final durable flush.
  scrapingDone = true;
  wake();
  await checkpointLoop;

  if (aborted) {
    state.auto_stop = {
      triggered: true,
      reason: abortReason,
      triggered_at: new Date().toISOString(),
    };
  }
  await flushProgress();

  const processedCount = Array.from(byPref.values()).flat().length;
  const totalSpots = Array.from(byPref.values())
    .flat()
    .reduce((s, r) => s + r.spots.length, 0);
  const totalErrors = Array.from(byPref.values())
    .flat()
    .reduce((s, r) => s + r.errors.length, 0);
  const elapsedSec = Math.round((Date.now() - runStart) / 1000);
  const summary = counter.summary();

  const logPath = new URL(
    `daily_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    LOG_DIR,
  );
  await mkdir(dirname(fileURLToPath(logPath)), { recursive: true });
  await writeFile(
    fileURLToPath(logPath),
    JSON.stringify(
      {
        run_type: "daily",
        municipalities_processed: processedCount,
        candidates_considered: todayMunis.length,
        time_budget_min: timeBounded ? DAILY_SCRAPE_MINUTES : null,
        prefectures_touched: Array.from(byPref.keys()),
        total_spots: totalSpots,
        total_errors: totalErrors,
        started_at: new Date(runStart).toISOString(),
        finished_at: new Date().toISOString(),
        elapsed_seconds: elapsedSec,
        aborted,
        abort_reason: abortReason || null,
        http: summary,
      },
      null,
      2,
    ),
    "utf8",
  );

  if (aborted) {
    await notify(
      `🚨 Daily aborted: ${abortReason}. ${processedCount} municipalities processed before abort. Investigate before next run.`,
      "error",
    );
    process.exit(2);
  }

  await notify(
    `✅ Daily done in ${elapsedSec}s — ${processedCount} municipalities, ${totalSpots} spots, ${totalErrors} errors across ${byPref.size} prefectures (HTTP ${summary.success}✅/${summary.fivexx}5xx/${summary.fourxx}4xx)`,
  );
}

main().catch(async (err) => {
  console.error("[daily] FAILED:", err);
  await notify(`🚨 Daily crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
