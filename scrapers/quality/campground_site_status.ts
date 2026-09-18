/**
 * Official-page status for campgrounds.
 *
 * WHY: campgrounds are the part of the accommodation layer where the official
 * page matters most and decays fastest. They are small operations, many run a
 * single page that is the only public source of their season, their pitches
 * and their rules, and a fair number have no site at all and live on a
 * booking portal. A URL in the dataset has to mean something, so each one is
 * read once and labelled: usable, needs a human, dead, a portal listing, or
 * absent.
 *
 * This goes one step past `website_liveness.ts`, which asks only whether a
 * host answers. A parked domain answers; a page announcing 閉鎖しました
 * answers. The verdict here comes from the page itself
 * (`scrapers/lib/site_status.ts`), and none of the verdicts asserts closure —
 * `closed_suspected` means "read this one".
 *
 * Politeness: robots.txt is consulted per URL, one request per domain with
 * the standard interval, identifying user agent. Booking-portal listings are
 * labelled from the URL and never fetched, because their terms, not ours,
 * govern that content.
 *
 * Checkpointed: safe to interrupt; a re-run only revisits entries older than
 * the recheck window.
 *
 * Run: npx tsx scrapers/quality/campground_site_status.ts [--limit N]
 * Output: data/_state/campground_site_status.json
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { classifyLodging } from "../../src/lib/lodging.js";
import { rateLimitedFetch } from "../lib/fetcher.js";
import { shouldCrawl } from "../lib/robots.js";
import { classifySiteStatus, isListingHost, type SiteStatus } from "../lib/site_status.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const STATE_URL = new URL("data/_state/campground_site_status.json", ROOT);

const RECHECK_DAYS = 30;
const CHECKPOINT_EVERY = 100;

const OPTIONS: ScrapeOptions = {
  ...DEFAULT_OPTIONS,
  rateLimitMs: 5_000, // public politeness policy: 5 s per domain
  timeoutMs: 15_000,
  retries: 1,
  userAgent:
    "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; campground official-page status)",
};

interface Entry {
  url: string | null;
  status: SiteStatus;
  reason: string;
  http_status: number | null;
  checked_at: string;
}

interface StateFile {
  schema_version: number;
  entries: Record<string, Entry>; // key = master id
}

interface MasterHotel {
  id: string;
  name: string | null;
  name_en: string | null;
  type: string | null;
  website: string | null;
  prefecture_code: string | null;
}

/** Tags out, entities in, whitespace collapsed — enough to read a page by. */
export function pageText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

async function main(): Promise<void> {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

  const master = JSON.parse(await readFile(MASTER_URL, "utf8")) as { hotels: MasterHotel[] };
  const campgrounds = master.hotels.filter((h) => classifyLodging(h) === "campground");

  let state: StateFile;
  try {
    state = JSON.parse(await readFile(STATE_URL, "utf8")) as StateFile;
  } catch {
    state = { schema_version: 1, entries: {} };
  }

  const now = new Date().toISOString();
  const cutoff = Date.now() - RECHECK_DAYS * 86_400_000;
  const toFetch: MasterHotel[] = [];

  for (const c of campgrounds) {
    const url = c.website && /^https?:\/\//.test(c.website) ? c.website : null;
    const seen = state.entries[c.id];
    const fresh = seen && seen.url === url && Date.parse(seen.checked_at) >= cutoff;
    if (fresh) continue;

    // Decided without a request: nothing on record, or a portal listing.
    if (!url || isListingHost(url)) {
      const verdict = classifySiteStatus({ url, status: 0, text: null, name: c.name });
      state.entries[c.id] = { url, ...verdict, http_status: null, checked_at: now };
      continue;
    }
    toFetch.push(c);
  }

  const targets = toFetch.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.error(
    `[campground_status] ${campgrounds.length} campgrounds, ${targets.length} pages to read` +
      ` (${campgrounds.length - toFetch.length} decided without a request)`,
  );

  const save = async (): Promise<void> => {
    const tmp = fileURLToPath(STATE_URL) + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 1), "utf8");
    await rename(tmp, fileURLToPath(STATE_URL));
  };

  let done = 0;
  for (const c of targets) {
    const url = c.website!;
    const allowed = await shouldCrawl(url, OPTIONS);
    if (!allowed.allowed) {
      // Not a judgement on the campground — we simply did not look.
      state.entries[c.id] = {
        url,
        status: "unchecked",
        reason: `not crawled: ${allowed.reason}`,
        http_status: null,
        checked_at: new Date().toISOString(),
      };
    } else {
      const res = await rateLimitedFetch(url, OPTIONS);
      const verdict = classifySiteStatus({
        url,
        status: res.status,
        text: res.body ? pageText(res.body) : null,
        name: c.name,
      });
      state.entries[c.id] = {
        url,
        ...verdict,
        http_status: res.status || null,
        checked_at: new Date().toISOString(),
      };
    }
    done += 1;
    if (done % CHECKPOINT_EVERY === 0) {
      await save();
      console.error(`[campground_status] ${done}/${targets.length} checkpointed`);
    }
  }
  await save();

  const counts: Record<string, number> = {};
  for (const e of Object.values(state.entries)) counts[e.status] = (counts[e.status] ?? 0) + 1;
  console.error("[campground_status] totals across state:", JSON.stringify(counts));
  console.error(`[campground_status] wrote ${fileURLToPath(STATE_URL)}`);
}

main().catch((err) => {
  console.error("[campground_site_status] fatal:", err);
  process.exitCode = 1;
});
