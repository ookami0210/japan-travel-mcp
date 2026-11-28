/**
 * 観光庁 地域観光資源の多言語解説文データベース (DATA_SOURCES.md #53).
 *
 * The Japan Tourism Agency publishes about 9,400 explanatory texts that
 * regional councils (DMOs, municipalities, national-park offices) had written
 * for inbound visitors: English, Japanese and, for later years, Simplified /
 * Traditional Chinese and Korean.
 *
 * 1. Read every page of the search listing (100 entries a page) to learn the
 *    entry ids. If any listing page fails, no entry is dropped this run.
 * 2. Read the entry pages that are new, or were last read more than
 *    REREAD_DAYS ago, until DEADLINE_MINUTES. An entry page holds the
 *    complete record (title, prefectures, genre, council, location, texts).
 *    Entries not read this run keep their previous record, so a first build
 *    fills over several runs.
 *
 * Texts are stored verbatim. The source terms allow reuse with a credit line
 * (see src/lib/official_texts.ts) and ask that texts not be rewritten, so the
 * file is never fed to the translation pipeline.
 *
 * Politeness: robots.txt, 5 s between requests (one host), one at a time.
 *
 * Output: data/official_texts/mlit_tagengo.json, refused when it collapses
 * against the file it would replace.
 *
 * `entries_pending` / `entries_read` in the output let
 * `.github/workflows/mlit-tagengo-continue.yml` start the next run until the
 * build is complete, so a first build needs no one to dispatch it again.
 *
 * Env: LIMIT=N (entry pages this run), DEADLINE_MINUTES=300, REREAD_DAYS=180.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MLIT_TAGENGO_CREDIT_EN,
  MLIT_TAGENGO_CREDIT_PREFIX,
  MLIT_TAGENGO_REUSE,
  parseTagengoFile,
  type MlitTagengoRecord,
} from "../../src/lib/official_texts.js";
import { ErrorCounter, rateLimitedFetch } from "../lib/fetcher.js";
import { entryUrl, listingEntryIds, listingTotal, listingUrl, LISTING_PAGE_SIZE, parseEntryPage } from "../lib/mlit_tagengo.js";
import { assertNotCollapsed, previousRecordCount } from "../lib/r3_write_guard.js";
import { shouldCrawl } from "../lib/robots.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/official_texts/mlit_tagengo.json");

const LIMIT = Number(process.env.LIMIT ?? "0");
const DEADLINE_MS = Date.now() + Number(process.env.DEADLINE_MINUTES ?? "300") * 60_000;
const REREAD_MS = Number(process.env.REREAD_DAYS ?? "180") * 86_400_000;

const OPTIONS: ScrapeOptions = {
  ...DEFAULT_OPTIONS,
  rateLimitMs: 5_000,
  globalConcurrency: 1,
  timeoutMs: 30_000,
  retries: 2,
  userAgent: "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; official explanatory texts)",
};

/**
 * Which entries to read this run: new ids first (listing order), then the
 * longest-unread ones past the re-read age.
 */
export function selectEntriesToRead(
  listed: string[],
  previous: Map<string, MlitTagengoRecord>,
  now: number,
  rereadMs: number,
): string[] {
  const fresh = listed.filter((id) => !previous.has(id));
  const stale = listed
    .filter((id) => previous.has(id))
    .map((id) => ({ id, at: Date.parse(previous.get(id)!.fetched_at) || 0 }))
    .filter((e) => now - e.at > rereadMs)
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
    .map((e) => e.id);
  return [...fresh, ...stale];
}

async function loadPrevious(): Promise<Map<string, MlitTagengoRecord>> {
  const out = new Map<string, MlitTagengoRecord>();
  if (!existsSync(OUT_FILE)) return out;
  try {
    for (const r of parseTagengoFile(JSON.parse(await readFile(OUT_FILE, "utf8")))) out.set(r.entry_id, r);
  } catch {
    // unreadable: treated as absent
  }
  return out;
}

async function readListing(counter: ErrorCounter): Promise<{ ids: string[]; complete: boolean; total: number | null }> {
  const first = await rateLimitedFetch(listingUrl(1), OPTIONS, counter);
  if (!first.body || first.status >= 400) return { ids: [], complete: false, total: null };
  const total = listingTotal(first.body);
  const ids = listingEntryIds(first.body);
  if (total === null) return { ids, complete: false, total };
  const pages = Math.ceil(total / LISTING_PAGE_SIZE);
  let complete = true;
  for (let p = 2; p <= pages; p += 1) {
    const res = await rateLimitedFetch(listingUrl(p), OPTIONS, counter);
    if (!res.body || res.status >= 400) {
      complete = false;
      continue;
    }
    for (const id of listingEntryIds(res.body)) if (!ids.includes(id)) ids.push(id);
  }
  // A listing that came back short of the count it reports is not complete.
  if (ids.length < total * 0.98) complete = false;
  return { ids, complete, total };
}

async function main(): Promise<void> {
  if (!(await shouldCrawl(listingUrl(1), OPTIONS)).allowed) {
    throw new Error("robots.txt disallows the tagengo-db listing");
  }
  const previous = await loadPrevious();
  const counter = new ErrorCounter();
  const listing = await readListing(counter);
  console.log(
    `[mlit_tagengo] listing: ${listing.ids.length} ids (reported ${listing.total ?? "?"}),` +
      ` complete=${listing.complete}; previous file has ${previous.size}`,
  );
  if (listing.ids.length === 0) throw new Error("listing returned no entries");

  let toRead = selectEntriesToRead(listing.ids, previous, Date.now(), REREAD_MS);
  if (LIMIT > 0) toRead = toRead.slice(0, LIMIT);
  console.log(`[mlit_tagengo] ${toRead.length} entry pages to read`);

  const records = new Map<string, MlitTagengoRecord>(previous);
  if (listing.complete) {
    for (const id of [...records.keys()]) if (!listing.ids.includes(id)) records.delete(id);
  }
  let attempted = 0;
  let read = 0;
  let gone = 0;
  let failed = 0;
  for (const id of toRead) {
    if (Date.now() > DEADLINE_MS) break;
    attempted += 1;
    const res = await rateLimitedFetch(entryUrl(id), OPTIONS, counter);
    if (res.status === 404) {
      records.delete(id);
      gone += 1;
      continue;
    }
    if (!res.body || res.status >= 400 || res.status === 0) {
      failed += 1;
      continue;
    }
    const rec = parseEntryPage(res.body, id, new Date().toISOString());
    if (rec) {
      records.set(id, rec);
      read += 1;
    } else {
      failed += 1;
    }
    if (read % 250 === 0) console.log(`  entries ${read}/${toRead.length}`);
  }
  console.log(
    `[mlit_tagengo] read ${read} entry pages (${failed} without text or failed, ${gone} gone);` +
      ` ${records.size} records; ${toRead.length - attempted} left for later runs`,
  );
  if (read > 20 && failed / (read + failed) > 0.2) {
    throw new Error(`too many entry pages failed (${failed}); not writing`);
  }

  if (LIMIT === 0) {
    const prevCount = await previousRecordCount("mlit_tagengo", OUT_FILE);
    assertNotCollapsed("mlit_tagengo", prevCount, records.size);
  }
  const out = {
    source: "観光庁 地域観光資源の多言語解説文データベース",
    source_url: "https://www.mlit.go.jp/tagengo-db/",
    terms_url: "https://www.mlit.go.jp/tagengo-db/sitepolicy.html",
    credit_ja: MLIT_TAGENGO_CREDIT_PREFIX,
    credit_en: MLIT_TAGENGO_CREDIT_EN,
    reuse: MLIT_TAGENGO_REUSE,
    fetched_at: new Date().toISOString(),
    fetcher_version: "v1",
    listing_total: listing.total,
    listing_complete: listing.complete,
    // Read by mlit-tagengo-continue.yml: another run is started while
    // entries are pending and this run made progress.
    entries_read: read,
    entries_pending: toRead.length - read - gone,
    records: [...records.values()].sort((a, b) => a.entry_id.localeCompare(b.entry_id)),
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(out));
  await rename(tmp, OUT_FILE);
  console.log(`[mlit_tagengo] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
