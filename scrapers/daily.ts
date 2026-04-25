/**
 * Daily incremental scrape — invoked by GitHub Actions cron.
 *
 * Picks the ~58 stalest municipalities (last_scraped_at oldest) and runs
 * the same pipeline as pilot.ts. Over 30 days this covers all 1,741.
 *
 * Output: appends to data/prefectures/<slug>.json by merging municipalities
 *         in-place by code (existing entries overwritten with fresh ones).
 *
 * Slack: notifies start, daily summary, and any auto-stop.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { scrapeOneMunicipality } from "./municipal/scrape_one.js";
import { ErrorCounter } from "./lib/fetcher.js";
import { notify } from "./lib/slack.js";
import { loadState, saveState, pickStaleMunicipalities } from "./lib/state.js";
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
const PREFECTURES_DIR = new URL("data/prefectures/", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

const DAILY_BATCH_SIZE = parseInt(
  process.env.DAILY_BATCH_SIZE ?? "58",
  10,
);

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

async function readPrefectureFile(slug: string): Promise<PrefectureFile | null> {
  const path = new URL(`${slug}.json`, PREFECTURES_DIR);
  try {
    return JSON.parse(await readFile(fileURLToPath(path), "utf8")) as PrefectureFile;
  } catch {
    return null;
  }
}

async function writePrefectureFile(
  slug: string,
  prefCode: string,
  prefName: string,
  results: MunicipalityScrapeResult[],
): Promise<void> {
  const existing = await readPrefectureFile(slug);
  const byCode = new Map<string, MunicipalityScrapeResult>();
  if (existing) {
    for (const r of existing.municipalities) byCode.set(r.municipality.code, r);
  }
  for (const r of results) byCode.set(r.municipality.code, r);

  const merged: PrefectureFile = {
    prefecture: { code: prefCode, name: prefName, name_en: slug },
    data_as_of: new Date().toISOString(),
    source: "https://github.com/ookami0210/japan-travel-mcp",
    disclaimer:
      "Data sourced from public websites. Verify directly with the property before making decisions.",
    municipalities: Array.from(byCode.values()).sort((a, b) =>
      a.municipality.code.localeCompare(b.municipality.code),
    ),
  };

  const path = new URL(`${slug}.json`, PREFECTURES_DIR);
  await mkdir(dirname(fileURLToPath(path)), { recursive: true });
  await writeFile(fileURLToPath(path), JSON.stringify(merged, null, 2), "utf8");
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

  // Only consider municipalities that have a resolved official URL.
  const candidateCodes = muniFile.municipalities
    .filter((m) => urlByCode.has(m.code))
    .map((m) => m.code);

  const todayCodes = pickStaleMunicipalities(state, candidateCodes, DAILY_BATCH_SIZE);
  const todayMunis = muniFile.municipalities.filter((m) =>
    todayCodes.includes(m.code),
  );

  const counter = new ErrorCounter();
  const limit = pLimit(opts.globalConcurrency);

  await notify(
    `🌅 Daily scrape started — ${todayMunis.length} municipalities (batch size ${DAILY_BATCH_SIZE})`,
  );

  const runStart = Date.now();
  let aborted = false;
  let abortReason = "";

  // Group by prefecture for output file management
  const byPref = new Map<string, MunicipalityScrapeResult[]>();

  const tasks = todayMunis.map((m) =>
    limit(async () => {
      if (aborted) return;
      const abortCheck = counter.shouldAbort(opts);
      if (abortCheck.abort) {
        aborted = true;
        abortReason = abortCheck.reason;
        return;
      }
      try {
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
        );
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

  // Persist per-prefecture files
  for (const [prefCode, results] of byPref) {
    const slug = PREFECTURE_SLUGS[prefCode];
    if (!slug) continue;
    const prefName = results[0]?.municipality.prefecture_name ?? prefCode;
    await writePrefectureFile(slug, prefCode, prefName, results);
  }

  state.last_run_at = new Date().toISOString();
  if (aborted) {
    state.auto_stop = {
      triggered: true,
      reason: abortReason,
      triggered_at: new Date().toISOString(),
    };
  }
  await saveState(state);

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
        municipalities_processed: todayMunis.length,
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
      `🚨 Daily aborted: ${abortReason}. ${todayMunis.length - byPref.size} municipalities not processed. Investigate before next run.`,
      "error",
    );
    process.exit(2);
  }

  await notify(
    `✅ Daily done in ${elapsedSec}s — ${totalSpots} spots, ${totalErrors} errors across ${byPref.size} prefectures (HTTP ${summary.success}✅/${summary.fivexx}5xx/${summary.fourxx}4xx)`,
  );
}

main().catch(async (err) => {
  console.error("[daily] FAILED:", err);
  await notify(`🚨 Daily crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
