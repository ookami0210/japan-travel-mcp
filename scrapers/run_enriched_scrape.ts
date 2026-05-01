/**
 * Enriched re-scrape runner — used by the multi-source sprint (ADR 0001).
 *
 * Difference from daily.ts:
 *   - Iterates ALL municipalities in a JIS-prefecture range, not just the
 *     "stalest 70" picked by pickStaleMunicipalities.
 *   - Reads BOTH official_urls.json AND tourism_org_urls.json, passes both
 *     to scrapeOneMunicipality as multi-seed input.
 *   - Designed to be split into operator-runnable batches sized for ~2h
 *     of wall time on a personal machine.
 *   - Writes per-prefecture files with the merge semantics of daily.ts:
 *     existing entries are kept and overwritten only by fresh entries for
 *     the same municipality code.
 *
 * Run:
 *   # Batch 3-1 of 6 (Hokkaido + Tohoku, JIS 01-07)
 *   BATCH=3-1 npx tsx scrapers/run_enriched_scrape.ts
 *
 *   # Or pick a custom prefecture range:
 *   PREFS=01,02,03 npx tsx scrapers/run_enriched_scrape.ts
 *
 *   # Dry run — list what would be scraped, don't fetch:
 *   DRY_RUN=1 BATCH=3-1 npx tsx scrapers/run_enriched_scrape.ts
 *
 * Output:
 *   - data/prefectures/<slug>.json (merged, same shape as daily.ts)
 *   - data/_logs/enriched_<batch>_<timestamp>.json (run summary)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { scrapeOneMunicipality } from "./municipal/scrape_one.js";
import { ErrorCounter } from "./lib/fetcher.js";
import { notify } from "./lib/slack.js";
import {
  DEFAULT_OPTIONS,
  type MunicipalityInput,
  type MunicipalityScrapeResult,
  type PrefectureFile,
  type ScrapeOptions,
} from "./lib/types.js";

const ROOT = new URL("../", import.meta.url);
const PREFECTURES_DIR = new URL("data/prefectures/", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

// State files (municipalities.json etc.) are gitignored after the Phase C
// HF migration — they live on the HF dataset and are mirrored into the
// per-user cache on `npx japan-travel-mcp` first run. Resolve them through
// the same fallback chain used by quality_report.ts so a fresh checkout +
// HF cache is enough to run the enriched scrape locally.
const STATE_DATA_ROOTS: URL[] = [
  new URL("data/", ROOT),
  new URL("file://" + (process.env.HOME ?? "") + "/.japan-travel-mcp/data/"),
  new URL("file:///tmp/jtm-e2e-cache/"),
];

function findStateFile(relPath: string): URL | null {
  for (const root of STATE_DATA_ROOTS) {
    const candidate = new URL(relPath, root);
    if (existsSync(fileURLToPath(candidate))) return candidate;
  }
  return null;
}

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

// Six batches sized so each ~333 municipalities → roughly 1.5-2h wall time
// at our concurrency / rate limits.
const BATCHES: Record<string, string[]> = {
  "3-1": ["01", "02", "03", "04", "05", "06", "07"],            // Hokkaido + Tohoku
  "3-2": ["08", "09", "10", "11", "12", "13", "14"],            // Kanto
  "3-3": ["15", "16", "17", "18", "19", "20", "21", "22", "23"],// Chubu
  "3-4": ["24", "25", "26", "27", "28", "29", "30"],            // Kinki
  "3-5": ["31", "32", "33", "34", "35", "36", "37", "38", "39"],// Chugoku + Shikoku
  "3-6": ["40", "41", "42", "43", "44", "45", "46", "47"],      // Kyushu + Okinawa
};

interface MunicipalityRaw {
  code: string;
  name: string;
  prefecture_code: string;
  prefecture_name: string;
}

interface TourismOrgEntry {
  code: string;
  primary?: string | null;
  candidates?: { url: string; confidence: string }[];
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

async function loadOfficialUrls(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const path = findStateFile("_state/official_urls.json");
  if (!path) return out;
  try {
    const f = JSON.parse(await readFile(fileURLToPath(path), "utf8")) as {
      entries: { code: string; official_url: string | null }[];
    };
    for (const e of f.entries) {
      if (e.official_url) out.set(e.code, e.official_url);
    }
  } catch {
    // file missing → empty map
  }
  return out;
}

async function loadTourismOrgUrls(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const path = findStateFile("_state/tourism_org_urls.json");
  if (!path) return out;
  try {
    const f = JSON.parse(
      await readFile(fileURLToPath(path), "utf8"),
    ) as { entries: TourismOrgEntry[] };
    for (const e of f.entries ?? []) {
      const urls: string[] = [];
      if (e.primary) urls.push(e.primary);
      // Also include high-confidence candidates that aren't the primary.
      for (const c of e.candidates ?? []) {
        if (c.confidence === "high" && !urls.includes(c.url)) urls.push(c.url);
      }
      if (urls.length > 0) out.set(e.code, urls);
    }
  } catch {
    // ignore parse errors → no tourism-org seeds
  }
  return out;
}

function selectTargetPrefectures(): string[] {
  const explicit = process.env.PREFS;
  if (explicit) {
    return explicit.split(",").map((s) => s.trim()).filter(Boolean);
  }
  const batch = process.env.BATCH;
  if (batch && BATCHES[batch]) return BATCHES[batch];
  // default: every prefecture (use carefully — 6+ hours of wall time)
  return Object.keys(PREFECTURE_SLUGS);
}

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === "1";
  // RESUME=1: skip prefectures whose per-prefecture file already exists.
  // Designed for the post-Mac-sleep restart pattern (added 2026-05-01) —
  // pair with per-prefecture flushing so each completed prefecture is
  // checkpointed and never re-fetched.
  const resume = process.env.RESUME === "1";

  // Per-domain rate limit. Default 5s for the steady-state policy. The
  // burst-scrape workflow overrides this to 800ms (KJ-approved 2026-05-01)
  // because a one-off burst can be more aggressive than the daily cron
  // without violating polite-scrape norms.
  const rateLimitMs = parseInt(process.env.RATE_LIMIT_MS ?? "5000", 10);
  const maxPages = parseInt(
    process.env.MAX_PAGES_PER_MUNICIPALITY ??
      String(DEFAULT_OPTIONS.maxPagesPerMunicipality),
    10,
  );
  const concurrency = parseInt(
    process.env.GLOBAL_CONCURRENCY ?? String(DEFAULT_OPTIONS.globalConcurrency),
    10,
  );
  const retries = parseInt(
    process.env.RETRIES ?? String(DEFAULT_OPTIONS.retries),
    10,
  );
  const opts: ScrapeOptions = {
    ...DEFAULT_OPTIONS,
    rateLimitMs,
    maxPagesPerMunicipality: maxPages,
    globalConcurrency: concurrency,
    retries,
  };
  process.stderr.write(
    `[enriched] config: rateLimitMs=${rateLimitMs} maxPages=${maxPages} concurrency=${concurrency} retries=${retries}\n`,
  );

  const requestedPrefs = selectTargetPrefectures();
  const targetPrefs = resume
    ? requestedPrefs.filter((code) => {
        const slug = PREFECTURE_SLUGS[code];
        if (!slug) return true;
        const path = new URL(`${slug}.json`, PREFECTURES_DIR);
        return !existsSync(fileURLToPath(path));
      })
    : requestedPrefs;
  const skippedPrefs = resume
    ? requestedPrefs.filter((c) => !targetPrefs.includes(c))
    : [];
  const batchLabel = process.env.BATCH ?? `prefs-${requestedPrefs.join("-")}`;

  process.stderr.write(
    `[enriched] batch=${batchLabel}, prefectures=${targetPrefs.join(",")}, dry_run=${isDryRun}, resume=${resume}${skippedPrefs.length > 0 ? `, skipped=${skippedPrefs.join(",")}` : ""}\n`,
  );

  if (targetPrefs.length === 0) {
    process.stderr.write(`[enriched] all prefectures already complete (RESUME=1) — nothing to do\n`);
    return;
  }

  const muniPath = findStateFile("_state/municipalities.json");
  if (!muniPath) {
    throw new Error(
      "Could not find _state/municipalities.json in repo, ~/.japan-travel-mcp/data, " +
        "or /tmp/jtm-e2e-cache. Run `npm run fetch:municipalities` first or " +
        "ensure the HF cache is populated.",
    );
  }
  const muniFile = JSON.parse(
    await readFile(fileURLToPath(muniPath), "utf8"),
  ) as { municipalities: MunicipalityRaw[] };

  const officialByCode = await loadOfficialUrls();
  const tourismOrgsByCode = await loadTourismOrgUrls();

  process.stderr.write(
    `[enriched] municipalities: ${muniFile.municipalities.length} (from ${muniPath.href}), official_urls: ${officialByCode.size} muni, tourism_org_urls: ${tourismOrgsByCode.size} muni\n`,
  );

  let centroids: Record<string, { lat: number; lng: number }> = {};
  const centroidsPath = findStateFile("_state/municipality_centroids.json");
  if (centroidsPath) {
    try {
      const f = JSON.parse(
        await readFile(fileURLToPath(centroidsPath), "utf8"),
      ) as { centroids: Record<string, { lat: number; lng: number }> };
      centroids = f.centroids ?? {};
    } catch {
      // missing centroids → fallback chain skips the centroid step
    }
  }

  // All municipalities in the target prefecture set that have AT LEAST ONE
  // seed URL (either official or tourism-org).
  const targetMunis = muniFile.municipalities.filter((m) => {
    if (!targetPrefs.includes(m.prefecture_code)) return false;
    return (
      officialByCode.has(m.code) || (tourismOrgsByCode.get(m.code)?.length ?? 0) > 0
    );
  });

  const noSeed = muniFile.municipalities.filter(
    (m) =>
      targetPrefs.includes(m.prefecture_code) &&
      !officialByCode.has(m.code) &&
      (tourismOrgsByCode.get(m.code)?.length ?? 0) === 0,
  );

  process.stderr.write(
    `[enriched] in-range municipalities: ${targetMunis.length} with seeds, ${noSeed.length} without (skipped)\n`,
  );

  if (isDryRun) {
    process.stderr.write(`[enriched] DRY_RUN — listing first 20 targets:\n`);
    for (const m of targetMunis.slice(0, 20)) {
      const off = officialByCode.get(m.code) ?? "(none)";
      const orgs = tourismOrgsByCode.get(m.code) ?? [];
      process.stderr.write(
        `  ${m.code} ${m.prefecture_name}/${m.name} :: official=${off} :: orgs=[${orgs.join(", ")}]\n`,
      );
    }
    return;
  }

  await notify(
    `🚀 Enriched re-scrape ${batchLabel} started — ${targetMunis.length} municipalities`,
  );

  const counter = new ErrorCounter();
  const limit = pLimit(opts.globalConcurrency);
  const runStart = Date.now();
  let aborted = false;
  let abortReason = "";

  const byPref = new Map<string, MunicipalityScrapeResult[]>();
  // Per-prefecture flushing — added 2026-05-01 after a Mac sleep killed
  // 6h of work because the original code only flushed at the very end.
  // Track how many municipalities we expect per prefecture; flush each
  // prefecture's file as soon as its last municipality completes.
  const expectedPerPref = new Map<string, number>();
  const completedPerPref = new Map<string, number>();
  const flushedPrefs = new Set<string>();
  for (const m of targetMunis) {
    expectedPerPref.set(m.prefecture_code, (expectedPerPref.get(m.prefecture_code) ?? 0) + 1);
  }

  async function flushPrefectureIfReady(prefCode: string): Promise<void> {
    if (flushedPrefs.has(prefCode)) return;
    const expected = expectedPerPref.get(prefCode) ?? 0;
    const done = completedPerPref.get(prefCode) ?? 0;
    if (done < expected) return;
    const slug = PREFECTURE_SLUGS[prefCode];
    if (!slug) return;
    const results = byPref.get(prefCode) ?? [];
    if (results.length === 0) return;
    const prefName = results[0]?.municipality.prefecture_name ?? prefCode;
    await writePrefectureFile(slug, prefCode, prefName, results);
    flushedPrefs.add(prefCode);
    process.stderr.write(
      `[enriched] flushed ${slug} (${results.length} munis, ${results.reduce((s, r) => s + r.spots.length, 0)} spots) — ${flushedPrefs.size}/${expectedPerPref.size} prefectures done\n`,
    );
  }

  const tasks = targetMunis.map((m) =>
    limit(async () => {
      if (aborted) return;
      const abortCheck = counter.shouldAbort(opts);
      if (abortCheck.abort) {
        aborted = true;
        abortReason = abortCheck.reason;
        return;
      }
      const input: MunicipalityInput = {
        code: m.code,
        name: m.name,
        prefecture_code: m.prefecture_code,
        prefecture_name: m.prefecture_name,
        official_url: officialByCode.get(m.code) ?? null,
        tourism_org_urls: tourismOrgsByCode.get(m.code) ?? [],
      };
      try {
        const r = await scrapeOneMunicipality(input, opts, counter, centroids);
        if (!byPref.has(m.prefecture_code)) byPref.set(m.prefecture_code, []);
        byPref.get(m.prefecture_code)!.push(r);
      } catch (err) {
        process.stderr.write(
          `[enriched] ${m.name} threw: ${(err as Error).message}\n`,
        );
      } finally {
        completedPerPref.set(m.prefecture_code, (completedPerPref.get(m.prefecture_code) ?? 0) + 1);
        await flushPrefectureIfReady(m.prefecture_code);
      }
    }),
  );

  await Promise.all(tasks);

  // Safety net: flush anything that didn't reach its expected count (e.g.
  // because the run aborted before all municipalities finished).
  for (const prefCode of byPref.keys()) {
    if (flushedPrefs.has(prefCode)) continue;
    const slug = PREFECTURE_SLUGS[prefCode];
    if (!slug) continue;
    const results = byPref.get(prefCode) ?? [];
    if (results.length === 0) continue;
    const prefName = results[0]?.municipality.prefecture_name ?? prefCode;
    await writePrefectureFile(slug, prefCode, prefName, results);
    flushedPrefs.add(prefCode);
  }

  const totalSpots = Array.from(byPref.values())
    .flat()
    .reduce((s, r) => s + r.spots.length, 0);
  const totalErrors = Array.from(byPref.values())
    .flat()
    .reduce((s, r) => s + r.errors.length, 0);
  const elapsedSec = Math.round((Date.now() - runStart) / 1000);
  const summary = counter.summary();

  const logPath = new URL(
    `enriched_${batchLabel}_${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
    LOG_DIR,
  );
  await mkdir(dirname(fileURLToPath(logPath)), { recursive: true });
  await writeFile(
    fileURLToPath(logPath),
    JSON.stringify(
      {
        run_type: "enriched_rescrape",
        batch: batchLabel,
        prefectures: targetPrefs,
        municipalities_processed: targetMunis.length,
        municipalities_skipped_no_seed: noSeed.length,
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
      `🚨 Enriched re-scrape ${batchLabel} aborted: ${abortReason}. ${targetMunis.length - byPref.size} municipalities not processed.`,
      "error",
    );
    process.exit(2);
  }

  await notify(
    `✅ Enriched re-scrape ${batchLabel} done in ${elapsedSec}s — ${totalSpots} spots, ${totalErrors} errors across ${byPref.size} prefectures (HTTP ${summary.success}✅/${summary.fivexx}5xx/${summary.fourxx}4xx)`,
  );
}

main().catch(async (err) => {
  console.error("[enriched] FAILED:", err);
  await notify(`🚨 Enriched re-scrape crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
