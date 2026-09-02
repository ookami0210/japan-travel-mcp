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
import { hybridMergeSpots } from "./lib/crawl_merge.js";
import {
  DEFAULT_OPTIONS,
  type MunicipalityInput,
  type MunicipalityCheckpoint,
  type MunicipalityScrapeResult,
  type PrefectureFile,
  type ScrapeOptions,
  type TouristSpot,
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
// Per-municipality resume state for crawls that span multiple windows. Keyed by
// JIS code; a municipality is present only while its crawl is unfinished.
// gitignored (HF-only, like the other bulk _state files) — prefetched at run
// start and pushed to HF in the tail, so a fresh runner resumes correctly.
const CHECKPOINTS_PATH = new URL(
  "data/_state/crawl_checkpoints.json",
  ROOT,
);

/** Load the per-municipality resume checkpoints (missing/corrupt → empty). */
async function loadCheckpoints(): Promise<Map<string, MunicipalityCheckpoint>> {
  try {
    const raw = JSON.parse(
      await readFile(fileURLToPath(CHECKPOINTS_PATH), "utf8"),
    ) as Record<string, MunicipalityCheckpoint>;
    return new Map(Object.entries(raw));
  } catch {
    return new Map();
  }
}

/** Persist the resume checkpoints (atomic write). */
async function saveCheckpoints(
  checkpoints: Map<string, MunicipalityCheckpoint>,
): Promise<void> {
  const path = fileURLToPath(CHECKPOINTS_PATH);
  await mkdir(dirname(path), { recursive: true });
  const obj = Object.fromEntries(checkpoints.entries());
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(obj), "utf8");
  await rename(tmp, path);
}


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

// Total pages crawled per municipality across ALL resume windows (cumulative,
// not per-window). Large official sites finish over several windows up to this
// ceiling, then stop. There is no per-municipality time cap any more: a crawl
// runs until it completes, hits this cap, or the window deadline. The
// per-request fetch timeout plus this page cap bound it, so no municipality can
// hang — which is what the old 20-minute cap protected against, at the cost of
// abandoning (and never finishing) big sites.
const MAX_PAGES_PER_MUNICIPALITY = (() => {
  const raw = process.env.MAX_PAGES_PER_MUNICIPALITY?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 5000;
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

// Parallelism = how many municipalities are crawled at once. Each municipality
// lives on its own domain and the fetcher enforces the 5-second per-domain
// interval regardless, so raising this speeds a run up by hitting MORE distinct
// official sites in parallel — never by hitting any single site faster, so the
// public politeness policy is unaffected. Bounded by runner memory (the crawl
// holds page buffers per in-flight municipality); ramp gradually. Env override
// lets the workflow run a higher parallelism at night and a gentler one by day.
const GLOBAL_CONCURRENCY = (() => {
  const raw = process.env.GLOBAL_CONCURRENCY?.trim();
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_OPTIONS.globalConcurrency;
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

  // Hybrid resume merge: union each municipality's fresh spots with what the
  // file already holds (coverage grows, never drops mid-crawl), and drop
  // stale-cycle spots once the crawl completes. Only then does the
  // preservation-first block merge replace the municipality block.
  const existingSpotsByCode = new Map<string, TouristSpot[]>();
  for (const b of existing?.municipalities ?? []) {
    const code = (b as { municipality?: { code?: string } }).municipality?.code;
    const spots = (b as { spots?: TouristSpot[] }).spots;
    if (code) existingSpotsByCode.set(code, spots ?? []);
  }
  const mergedResults = results.map((r) => ({
    ...r,
    spots: hybridMergeSpots(
      existingSpotsByCode.get(r.municipality.code) ?? [],
      r.spots,
      r.complete ?? true,
      r.crawl_started_at,
    ),
  }));

  const merged = mergePrefectureFile(existing, {
    prefCode,
    prefName,
    slug,
    results: mergedResults as unknown as PrefFileMuniBlock[],
  });
  await writePrefFileAtomic(path, merged);
}


async function main(): Promise<void> {
  const opts: ScrapeOptions = {
    ...DEFAULT_OPTIONS,
    rateLimitMs: 5000, // daily runs respect the public 5-second policy
    globalConcurrency: GLOBAL_CONCURRENCY,
    maxPagesPerMunicipality: MAX_PAGES_PER_MUNICIPALITY,
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
  // Per-municipality resume state for crawls still in progress from earlier
  // windows (prefetched from HF with the other _state files).
  const checkpoints = await loadCheckpoints();
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
      // Persist resume state too, so a killed window doesn't lose the crawl
      // progress of in-flight municipalities.
      await saveCheckpoints(checkpoints);
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
        // Resume from any saved checkpoint and hand the crawl the window
        // deadline so it stops cleanly (returning a checkpoint) instead of
        // being cut at a per-municipality time cap. This is what lets a large
        // site finish across several windows at the polite 5 s pace.
        const r = await scrapeOneMunicipality(
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
          checkpoints.get(m.code) ?? null,
          deadlineMs,
        );

        if (!byPref.has(m.prefecture_code)) byPref.set(m.prefecture_code, []);
        byPref.get(m.prefecture_code)!.push(r);

        // Keep the resume checkpoint for an unfinished crawl; drop it once done.
        if (r.complete) checkpoints.delete(m.code);
        else if (r.checkpoint) checkpoints.set(m.code, r.checkpoint);

        // Stamp last_scraped_at fresh ONLY on completion. While a crawl is
        // still in progress leave it null, so the stale picker treats the
        // municipality as oldest and re-picks it first next window to continue.
        const prev = state.per_municipality[m.code];
        state.per_municipality[m.code] = {
          last_scraped_at: r.complete ? r.finished_at : null,
          last_status: r.complete
            ? r.spots.length > 0
              ? r.errors.length === 0
                ? "success"
                : "partial"
              : "failed"
            : "in_progress",
          pages_fetched: r.pages_fetched,
          spots_found: r.spots.length,
          error_count: r.errors.length,
          truncated_at_cap: r.truncated_at_cap ?? prev?.truncated_at_cap,
          total_pages: r.total_pages ?? prev?.total_pages,
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

  const allResults = Array.from(byPref.values()).flat();
  const processedCount = allResults.length;
  const completedCount = allResults.filter((r) => r.complete).length;
  const inProgressCount = processedCount - completedCount;
  // Municipalities whose official site is larger than the page cap (crawl hit
  // the cap with URLs still queued) — measured this run and, durably, in
  // scrape_state.json per municipality.
  const truncatedCount = allResults.filter((r) => r.truncated_at_cap).length;
  const totalSpots = allResults.reduce((s, r) => s + r.spots.length, 0);
  const totalErrors = allResults.reduce((s, r) => s + r.errors.length, 0);
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
        municipalities_completed: completedCount,
        municipalities_in_progress: inProgressCount,
        municipalities_truncated_at_cap: truncatedCount,
        crawl_checkpoints_open: checkpoints.size,
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
    `✅ Daily done in ${elapsedSec}s — ${processedCount} municipalities (${completedCount} completed, ${inProgressCount} still crawling), ${totalSpots} spots, ${totalErrors} errors across ${byPref.size} prefectures. ${truncatedCount} hit the ${MAX_PAGES_PER_MUNICIPALITY}-page cap; ${checkpoints.size} crawls open. (HTTP ${summary.success}✅/${summary.fivexx}5xx/${summary.fourxx}4xx)`,
  );

  // Exit explicitly: every write above is awaited, so the run is durably done.
  // Municipalities that exceeded MUNI_TIMEOUT_MINUTES were abandoned mid-fetch
  // (see the withTimeout branch above) and their detached sockets keep the Node
  // event loop alive after main() resolves. Without this the process lingers
  // idle until the workflow step timeout kills it and marks the whole run
  // failed — even though the scrape, state commit, and HF sync all succeeded.
  process.exit(0);
}

main().catch(async (err) => {
  console.error("[daily] FAILED:", err);
  await notify(`🚨 Daily crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
