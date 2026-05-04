/**
 * Pilot scrape: Tottori (31) + Kochi (39).
 *
 * Reads:
 *   data/_state/municipalities.json    — all 47 prefectures, ~1,938 records
 *   data/_state/official_urls.json     — Wikidata-resolved official URLs
 *
 * Writes per prefecture:
 *   data/prefectures/<name>.json
 *
 * Notifies Slack at start, per prefecture completion, and end (or abort).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { scrapeOneMunicipality } from "./municipal/scrape_one.js";
import { ErrorCounter } from "./lib/fetcher.js";
import { notify } from "./lib/slack.js";
import { loadState, saveState } from "./lib/state.js";
import {
  DEFAULT_OPTIONS,
  type MunicipalityInput,
  type MunicipalityScrapeResult,
  type PrefectureFile,
  type ScrapeOptions,
} from "./lib/types.js";

import {
  PREFECTURE_SLUGS,
  PREFECTURE_NAMES_JA,
  ALL_PREFECTURE_CODES,
} from "./lib/prefectures.js";

// PILOT_PREFECTURES env var:
//   "31,39"   → just those two
//   "all"     → all 47 prefectures (initial bootstrap)
//   unset     → defaults to 31,39
const PILOT_ENV = process.env.PILOT_PREFECTURES ?? "31,39";
const PILOT_CODES =
  PILOT_ENV.toLowerCase() === "all"
    ? ALL_PREFECTURE_CODES
    : PILOT_ENV.split(",").map((s) => s.trim()).filter(Boolean);

const PILOT_PREFECTURES: { code: string; slug: string; name: string }[] =
  PILOT_CODES.filter((c) => PREFECTURE_SLUGS[c]).map((code) => ({
    code,
    slug: PREFECTURE_SLUGS[code],
    name: PREFECTURE_NAMES_JA[code] ?? code,
  }));

const ROOT = new URL("../", import.meta.url);
const MUNI_PATH = new URL("data/_state/municipalities.json", ROOT);
const URLS_PATH = new URL("data/_state/official_urls.json", ROOT);
const CENTROIDS_PATH = new URL(
  "data/_state/municipality_centroids.json",
  ROOT,
);
const PREFECTURES_DIR = new URL("data/prefectures/", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

interface MunicipalitiesFile {
  municipalities: {
    code: string;
    name: string;
    prefecture_code: string;
    prefecture_name: string;
  }[];
}

interface UrlsFile {
  entries: { code: string; official_url: string | null }[];
}

async function main(): Promise<void> {
  const opts: ScrapeOptions = { ...DEFAULT_OPTIONS };

  const muniFile = JSON.parse(
    await readFile(fileURLToPath(MUNI_PATH), "utf8"),
  ) as MunicipalitiesFile;
  const urlsFile = JSON.parse(
    await readFile(fileURLToPath(URLS_PATH), "utf8"),
  ) as UrlsFile;
  let centroids: Record<string, { lat: number; lng: number }> = {};
  try {
    const centroidFile = JSON.parse(
      await readFile(fileURLToPath(CENTROIDS_PATH), "utf8"),
    ) as { centroids: Record<string, { lat: number; lng: number }> };
    centroids = centroidFile.centroids ?? {};
    console.error(
      `[pilot] loaded ${Object.keys(centroids).length} municipality centroids`,
    );
  } catch {
    console.error(
      "[pilot] no municipality_centroids.json — coord fallback chain will skip the centroid step",
    );
  }

  const urlByCode = new Map<string, string>();
  for (const e of urlsFile.entries) {
    if (e.official_url) urlByCode.set(e.code, e.official_url);
  }

  const counter = new ErrorCounter();
  const limit = pLimit(opts.globalConcurrency);
  const state = await loadState();

  await notify(
    `🚀 Pilot scrape started — ${PILOT_PREFECTURES.map((p) => p.name).join(" + ")}`,
  );

  const runStart = Date.now();
  let aborted = false;
  let abortReason = "";

  for (const pref of PILOT_PREFECTURES) {
    if (aborted) break;

    const munisInPref = muniFile.municipalities.filter(
      (m) => m.prefecture_code === pref.code,
    );
    const inputs: MunicipalityInput[] = munisInPref.map((m) => ({
      code: m.code,
      name: m.name,
      prefecture_code: m.prefecture_code,
      prefecture_name: m.prefecture_name,
      official_url: urlByCode.get(m.code) ?? null,
    }));

    const withUrl = inputs.filter((i) => i.official_url).length;
    await notify(
      `📍 ${pref.name} — ${inputs.length} municipalities (${withUrl} with official URL)`,
    );

    const results: MunicipalityScrapeResult[] = [];
    let processed = 0;

    const tasks = inputs.map((input) =>
      limit(async () => {
        if (aborted) return null;
        const abortCheck = counter.shouldAbort(opts);
        if (abortCheck.abort) {
          aborted = true;
          abortReason = abortCheck.reason;
          return null;
        }
        try {
          const r = await scrapeOneMunicipality(input, opts, counter, centroids);
          processed += 1;
          if (processed % 5 === 0) {
            console.error(
              `[pilot] ${pref.slug}: ${processed}/${inputs.length} done`,
            );
          }
          return r;
        } catch (err) {
          console.error(
            `[pilot] ${input.name} threw:`,
            (err as Error).message,
          );
          return {
            municipality: {
              code: input.code,
              name: input.name,
              prefecture_code: input.prefecture_code,
              prefecture_name: input.prefecture_name,
            },
            official_url: input.official_url,
            tourism_pages_found: 0,
            pages_fetched: 0,
            pages_failed: 0,
            spots: [],
            multilingual: { en: 0, zh: 0, ko: 0 },
            errors: [{ url: "", reason: `unhandled: ${(err as Error).message}` }],
            started_at: new Date().toISOString(),
            finished_at: new Date().toISOString(),
            data_as_of: new Date().toISOString(),
          } as MunicipalityScrapeResult;
        }
      }),
    );

    const settled = await Promise.all(tasks);
    for (const r of settled) {
      if (r) results.push(r);
    }

    // Update per-municipality state
    for (const r of results) {
      state.per_municipality[r.municipality.code] = {
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
    }

    const fileBody: PrefectureFile = {
      prefecture: { code: pref.code, name: pref.name, name_en: pref.slug },
      data_as_of: new Date().toISOString(),
      source: "https://github.com/ookami0210/japan-travel-mcp",
      disclaimer:
        "Data sourced from public websites. Verify directly with the property before making decisions.",
      municipalities: results,
    };

    const outPath = new URL(`${pref.slug}.json`, PREFECTURES_DIR);
    await mkdir(dirname(fileURLToPath(outPath)), { recursive: true });
    await writeFile(
      fileURLToPath(outPath),
      JSON.stringify(fileBody, null, 2),
      "utf8",
    );

    const totalSpots = results.reduce((s, r) => s + r.spots.length, 0);
    const totalPages = results.reduce((s, r) => s + r.pages_fetched, 0);
    const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
    const noSpotsCount = results.filter((r) => r.spots.length === 0).length;
    await notify(
      `✅ ${pref.name} done — ${totalSpots} spots across ${totalPages} pages, ${totalErrors} errors, ${noSpotsCount} municipalities with 0 spots → \`data/prefectures/${pref.slug}.json\``,
    );
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

  // Write a run log for the morning report
  const elapsedSec = Math.round((Date.now() - runStart) / 1000);
  const summary = counter.summary();
  const logPath = new URL(
    `pilot_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    LOG_DIR,
  );
  await mkdir(dirname(fileURLToPath(logPath)), { recursive: true });
  await writeFile(
    fileURLToPath(logPath),
    JSON.stringify(
      {
        run_type: "pilot",
        prefectures: PILOT_PREFECTURES,
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
      `🚨 Pilot aborted: ${abortReason}. Partial results saved.`,
      "error",
    );
    process.exit(2);
  }

  await notify(
    `🎉 Pilot complete in ${elapsedSec}s — HTTP ${summary.success}✅ / ${summary.fivexx}5xx / ${summary.fourxx}4xx / ${summary.network_errors}net-err`,
  );
}

main().catch(async (err) => {
  console.error("[pilot] FAILED:", err);
  await notify(`🚨 Pilot crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
