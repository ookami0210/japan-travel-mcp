/**
 * Food-venue official-page enrichment — Schema.org JSON-LD facts.
 *
 * For every food/<slug>.json entry that carries an `official_url` (the OSM
 * website tag), fetch that ONE page politely (robots-checked, per-domain
 * rate limit) and extract machine-readable facts the venue itself
 * publishes: openingHoursSpecification / openingHours / priceRange /
 * acceptsReservations / telephone. Results are written back onto the entry
 * as `official_page{...}` with per-field provenance (source_url +
 * retrieved_at). Pages without JSON-LD record an honest
 * `jsonld: false` — no scraping of free text, no guessing.
 *
 * Idempotent + resumable: entries enriched within RECHECK_DAYS are skipped,
 * and each prefecture file is checkpointed (atomic write) as soon as its
 * venues finish, so a killed run keeps everything already fetched.
 *
 * Usage:
 *   npx tsx scrapers/sources/fetch_food_official_facts.ts              # all 47
 *   npx tsx scrapers/sources/fetch_food_official_facts.ts --pref 27    # one
 *   npx tsx scrapers/sources/fetch_food_official_facts.ts --limit 50   # per-pref cap (testing)
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import pLimit from "p-limit";
import { readFile, writeFile, rename } from "node:fs/promises";
import { rateLimitedFetch } from "../lib/fetcher.js";
import { shouldCrawl } from "../lib/robots.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";
import { extractJsonLdFacts } from "../lib/jsonld_facts.js";

const ROOT = new URL("../../", import.meta.url);
const FOOD_DIR = fileURLToPath(new URL("data/food/", ROOT));

/** Re-fetch a venue page only after this many days. */
const RECHECK_DAYS = 30;

const SLUGS: Record<string, string> = {
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

interface OfficialPage {
  retrieved_at: string;
  status: number;
  jsonld: boolean;
  hours_spec?: Array<Record<string, unknown>>;
  opening_hours?: string[];
  price_range_raw?: string;
  accepts_reservations?: string;
  telephone?: string;
  source_url: string;
}

interface FoodEntry {
  id: string;
  official_url: string | null;
  official_page?: OfficialPage;
  [key: string]: unknown;
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function isFresh(p: OfficialPage | undefined, now: number): boolean {
  if (!p?.retrieved_at) return false;
  return now - Date.parse(p.retrieved_at) < RECHECK_DAYS * 86_400_000;
}

async function enrichOne(
  entry: FoodEntry,
  opts: ScrapeOptions,
  now: string,
): Promise<"enriched" | "no_jsonld" | "blocked" | "error"> {
  const url = entry.official_url!;
  const decision = await shouldCrawl(url, opts);
  if (!decision.allowed) {
    entry.official_page = {
      retrieved_at: now,
      status: 0,
      jsonld: false,
      source_url: url,
    };
    return "blocked";
  }
  const res = await rateLimitedFetch(url, opts);
  if (!res.body || res.status >= 400 || res.status === 0) {
    entry.official_page = {
      retrieved_at: now,
      status: res.status,
      jsonld: false,
      source_url: url,
    };
    return "error";
  }
  const facts = extractJsonLdFacts(res.body);
  const page: OfficialPage = {
    retrieved_at: now,
    status: res.status,
    jsonld: !!facts,
    source_url: res.finalUrl ?? url,
  };
  if (facts) {
    if (facts.hours_spec) page.hours_spec = facts.hours_spec;
    if (facts.opening_hours) page.opening_hours = facts.opening_hours;
    if (facts.price_range_raw) page.price_range_raw = facts.price_range_raw;
    if (facts.accepts_reservations)
      page.accepts_reservations = facts.accepts_reservations;
    if (facts.telephone) page.telephone = facts.telephone;
  }
  entry.official_page = page;
  return facts ? "enriched" : "no_jsonld";
}

async function main(): Promise<void> {
  const only = argValue("--pref")?.padStart(2, "0") ?? null;
  const perPrefLimit = argValue("--limit")
    ? parseInt(argValue("--limit")!, 10)
    : Infinity;
  const opts: ScrapeOptions = {
    ...DEFAULT_OPTIONS,
    rateLimitMs: 5000, // public politeness policy: 5 s per domain
    timeoutMs: 12_000,
    retries: 1,
  };
  const limit = pLimit(opts.globalConcurrency);
  const nowMs = Date.now();

  const codes = only ? [only] : Object.keys(SLUGS);
  let tEnriched = 0;
  let tNoLd = 0;
  let tErr = 0;
  for (const code of codes) {
    const slug = SLUGS[code];
    const path = resolve(FOOD_DIR, `${slug}.json`);
    let file: { entries?: FoodEntry[] };
    try {
      file = JSON.parse(await readFile(path, "utf8")) as { entries?: FoodEntry[] };
    } catch {
      console.warn(`[enrich_food] ${slug}: no food file — skipped`);
      continue;
    }
    const targets = (file.entries ?? [])
      .filter((e) => e.official_url && !isFresh(e.official_page, nowMs))
      .slice(0, perPrefLimit);
    if (targets.length === 0) {
      console.log(`[enrich_food] ${slug}: nothing to do`);
      continue;
    }
    const now = new Date().toISOString();
    let enriched = 0;
    let noLd = 0;
    let errs = 0;
    await Promise.all(
      targets.map((e) =>
        limit(async () => {
          try {
            const r = await enrichOne(e, opts, now);
            if (r === "enriched") enriched += 1;
            else if (r === "no_jsonld") noLd += 1;
            else errs += 1;
          } catch {
            errs += 1;
          }
        }),
      ),
    );
    // Checkpoint: atomic write per prefecture, so a kill keeps completed work.
    const tmp = `${path}.tmp`;
    await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
    await rename(tmp, path);
    tEnriched += enriched;
    tNoLd += noLd;
    tErr += errs;
    console.log(
      `[enrich_food] ${slug}: ${targets.length} pages → jsonld facts ${enriched}, no-jsonld ${noLd}, errors ${errs}`,
    );
  }
  console.log(
    `[enrich_food] DONE — facts ${tEnriched}, no-jsonld ${tNoLd}, errors ${tErr}`,
  );
}

main().catch((err) => {
  console.error("[enrich_food] FAILED:", err);
  process.exit(1);
});
