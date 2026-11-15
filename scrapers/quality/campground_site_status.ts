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
 * Time budget: the pages are read by a small pool of workers, each owning a
 * set of hosts, so distinct sites are read in parallel while any one host
 * still sees one request per interval. DEADLINE_MINUTES (default 75) is a
 * soft stop: no new page is started after it, the state is saved, and the
 * process exits 0 with the rest left due for the next run. Without it a
 * month where every entry falls due at once (1,500 pages, one at a time,
 * five seconds each) outran the step's 90-minute cap and lost the run.
 *
 * Run: npx tsx scrapers/quality/campground_site_status.ts [--limit N] [--force]
 * Env: DEADLINE_MINUTES (soft stop), STATUS_CONCURRENCY (hosts in flight, default 6)
 * Output: data/_state/campground_site_status.json
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isDeletedLodging, lodgingTypeOverride } from "../../src/lib/excluded_lodgings.js";
import { classifyLodging, isCampingFamily } from "../../src/lib/lodging.js";
import { rateLimitedFetch } from "../lib/fetcher.js";
import { pageText } from "../lib/page_text.js";
import { shouldCrawl } from "../lib/robots.js";
import { classifySiteStatus, isListingHost, type SiteStatus } from "../lib/site_status.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const STATE_URL = new URL("data/_state/campground_site_status.json", ROOT);

const RECHECK_DAYS = 30;
const CHECKPOINT_EVERY = 100;
const DEADLINE_MINUTES = Number(process.env.DEADLINE_MINUTES ?? "75");
const CONCURRENCY = Math.max(1, Number(process.env.STATUS_CONCURRENCY ?? "6"));

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
  /** Charset the page was read with; absent for verdicts decided without a request. */
  charset?: string;
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

async function main(): Promise<void> {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;
  const force = process.argv.includes("--force");

  const master = JSON.parse(await readFile(MASTER_URL, "utf8")) as { hotels: MasterHotel[] };
  const campgrounds = master.hotels.filter(
    // The lodging audit removes rows that are not campgrounds at all
    // (src/lib/excluded_lodgings.ts); a pass must not re-add them.
    (h) =>
      !isDeletedLodging(h.id) &&
      !lodgingTypeOverride(h.id) &&
      isCampingFamily(classifyLodging(h)),
  );

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
    if (fresh && !force) continue;

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

  // One queue per host: a worker drains a host's queue in order, so the
  // per-domain interval is honoured without any two workers sharing a host.
  const byHost = new Map<string, MasterHotel[]>();
  for (const c of targets) {
    let host: string;
    try {
      host = new URL(c.website!).hostname;
    } catch {
      host = c.website!;
    }
    const q = byHost.get(host);
    if (q) q.push(c);
    else byHost.set(host, [c]);
  }
  const hostQueues = [...byHost.values()];
  const deadlineAt = Date.now() + DEADLINE_MINUTES * 60_000;
  let deadlineHit = false;
  let done = 0;
  let skippedForDeadline = 0;

  const readOne = async (c: MasterHotel): Promise<void> => {
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
        ...(res.charset ? { charset: res.charset } : {}),
      };
    }
    done += 1;
    if (done % CHECKPOINT_EVERY === 0) {
      await save();
      console.error(`[campground_status] ${done}/${targets.length} checkpointed`);
    }
  };

  let nextQueue = 0;
  const worker = async (): Promise<void> => {
    while (nextQueue < hostQueues.length) {
      const queue = hostQueues[nextQueue++];
      for (const c of queue) {
        if (Date.now() >= deadlineAt) {
          deadlineHit = true;
          skippedForDeadline += 1;
          continue;
        }
        await readOne(c);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, hostQueues.length) }, worker));
  await save();
  if (deadlineHit) {
    console.error(
      `[campground_status] soft deadline of ${DEADLINE_MINUTES} min reached:` +
        ` ${done} read, ${skippedForDeadline} left due for the next run`,
    );
  }

  const counts: Record<string, number> = {};
  for (const e of Object.values(state.entries)) counts[e.status] = (counts[e.status] ?? 0) + 1;
  console.error("[campground_status] totals across state:", JSON.stringify(counts));
  console.error(`[campground_status] wrote ${fileURLToPath(STATE_URL)}`);
}

main().catch((err) => {
  console.error("[campground_site_status] fatal:", err);
  process.exitCode = 1;
});
