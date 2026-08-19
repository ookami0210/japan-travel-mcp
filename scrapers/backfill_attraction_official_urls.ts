/**
 * Backfill official_url (Wikidata P856) into existing wikidata_attractions.
 *
 * The v2 attraction fetcher (fetch_wikidata_attractions_v2.ts) now collects
 * P856 natively, so a full WD-FOUNDATION refresh populates official_url from
 * source. This script fills the gap for the CURRENT snapshot without waiting
 * for that refresh: it reads each prefecture file, looks up P856 for every
 * attraction that has no official_url yet, and writes the URL back in place.
 *
 * Why the entity REST API (not the SPARQL endpoint): wbgetentities resolves
 * a fixed list of QIDs directly and stays available even when the Wikidata
 * Query Service is rate-limited or in an outage. We only ever ask for the
 * exact QIDs already in the dataset, so this is a bounded, polite lookup.
 *
 * Contract:
 *   - Non-destructive. Only sets official_url where it is currently absent or
 *     null; an existing value (e.g. from the OSM tag merge) is never
 *     overwritten. Honest null stays null when Wikidata has no P856.
 *   - Idempotent. Re-running only touches records still missing a URL.
 *
 * Env:
 *   DRY_RUN=1        Report the coverage lift per prefecture, write nothing.
 *   PREFECTURES=...  Comma-separated slugs to scope (default: all present).
 *   BATCH_SIZE=50    QIDs per wbgetentities call (API max 50).
 *
 * Run:
 *   DRY_RUN=1 npx tsx scrapers/backfill_attraction_official_urls.ts
 *   npx tsx scrapers/backfill_attraction_official_urls.ts
 *   PREFECTURES=kyoto,osaka npx tsx scrapers/backfill_attraction_official_urls.ts
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PREF_DIR = new URL("../data/prefectures/", import.meta.url);
const ENTITY_API = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const DRY_RUN = process.env.DRY_RUN === "1";
const BATCH_SIZE = Math.min(
  Math.max(Number(process.env.BATCH_SIZE ?? "50") || 50, 1),
  50,
);
const SCOPE = process.env.PREFECTURES?.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

interface Attraction {
  qid?: string;
  official_url?: string | null;
  [key: string]: unknown;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Resolve P856 (official website) for a batch of QIDs. Returns a map of
 * qid -> url for the entities that carry one. Retries transient failures a
 * few times, then gives up on the batch (those QIDs are simply left missing
 * and picked up on the next run).
 */
async function fetchOfficialUrls(
  qids: string[],
): Promise<Map<string, string>> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qids.join("|"),
    props: "claims",
    format: "json",
  });
  const url = `${ENTITY_API}?${params.toString()}`;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as {
        entities?: Record<string, { claims?: Record<string, unknown[]> }>;
      };
      const out = new Map<string, string>();
      for (const [qid, ent] of Object.entries(json.entities ?? {})) {
        const p856 = ent.claims?.P856;
        if (!Array.isArray(p856)) continue;
        for (const claim of p856) {
          const value = (
            claim as {
              mainsnak?: { datavalue?: { value?: unknown } };
            }
          ).mainsnak?.datavalue?.value;
          if (typeof value === "string" && value.length > 0) {
            out.set(qid, value);
            break; // first official website wins
          }
        }
      }
      return out;
    } catch (err) {
      const backoff = 1000 * 2 ** attempt;
      process.stderr.write(
        `  batch attempt ${attempt + 1} failed (${(err as Error).message}) — retry in ${backoff}ms\n`,
      );
      await sleep(backoff);
    }
  }
  process.stderr.write(`  batch of ${qids.length} gave up — left for next run\n`);
  return new Map();
}

async function prefectureFiles(): Promise<string[]> {
  const names = (await readdir(fileURLToPath(PREF_DIR)))
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.replace(/\.json$/, ""))
    .sort();
  if (!SCOPE || SCOPE.length === 0) return names;
  const set = new Set(SCOPE);
  return names.filter((n) => set.has(n));
}

function hasUrl(a: Attraction): boolean {
  return typeof a.official_url === "string" && a.official_url.length > 0;
}

async function main(): Promise<void> {
  const slugs = await prefectureFiles();
  process.stderr.write(
    `[backfill_official_urls] ${slugs.length} prefectures, batch ${BATCH_SIZE}${DRY_RUN ? " (DRY RUN)" : ""}\n`,
  );

  let totalAttractions = 0;
  let totalHadUrl = 0;
  let totalFilled = 0;

  for (const slug of slugs) {
    const path = new URL(`${slug}.json`, PREF_DIR);
    const pref = JSON.parse(
      await readFile(fileURLToPath(path), "utf8"),
    ) as Record<string, unknown> & { wikidata_attractions?: Attraction[] };
    const attractions = pref.wikidata_attractions ?? [];
    if (attractions.length === 0) continue;

    const hadUrl = attractions.filter(hasUrl).length;
    const missing = attractions.filter((a) => a.qid && !hasUrl(a));
    totalAttractions += attractions.length;
    totalHadUrl += hadUrl;

    let filled = 0;
    for (const batch of chunk(missing, BATCH_SIZE)) {
      const found = await fetchOfficialUrls(
        batch.map((a) => a.qid as string),
      );
      for (const a of batch) {
        const url = found.get(a.qid as string);
        if (url) {
          if (!DRY_RUN) a.official_url = url;
          filled += 1;
        } else if (!DRY_RUN && a.official_url === undefined) {
          // Materialise the honest null so every record carries the key.
          a.official_url = null;
        }
      }
      await sleep(1000); // polite: ~1 req/s against the entity API
    }

    totalFilled += filled;
    const before = attractions.length
      ? ((100 * hadUrl) / attractions.length).toFixed(1)
      : "0.0";
    const after = attractions.length
      ? ((100 * (hadUrl + filled)) / attractions.length).toFixed(1)
      : "0.0";
    process.stderr.write(
      `[${slug}] attractions ${attractions.length}: official_url ${before}% → ${after}% (+${filled})\n`,
    );

    if (!DRY_RUN && filled > 0) {
      await writeFile(
        fileURLToPath(path),
        JSON.stringify(pref, null, 2),
        "utf8",
      );
    }
  }

  const beforePct = totalAttractions
    ? ((100 * totalHadUrl) / totalAttractions).toFixed(1)
    : "0.0";
  const afterPct = totalAttractions
    ? ((100 * (totalHadUrl + totalFilled)) / totalAttractions).toFixed(1)
    : "0.0";
  process.stderr.write(
    `[backfill_official_urls] done — ${totalAttractions} attractions, official_url ${beforePct}% → ${afterPct}% (+${totalFilled})${DRY_RUN ? " [DRY RUN — nothing written]" : ""}\n`,
  );
}

main().catch((err) => {
  console.error("[backfill_official_urls] FAILED:", err);
  process.exit(1);
});
