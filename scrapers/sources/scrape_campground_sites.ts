/**
 * Crawl each campground's own website and keep what it says fresh.
 *
 * WHY: a campground's official page is usually the only public source for the
 * things a guest has to know before booking — which season it opens, what a
 * pitch costs, whether a car can park beside the tent, whether the showers run
 * in April. Outside the cities these are often the only lodging for miles, and
 * the operator is one family with one page, so that page is both the whole
 * record and the part of the accommodation layer that decays fastest: prices
 * change every spring, a typhoon closes a loop road, a season shifts by a
 * month.
 *
 * What this job does and does not do (the division is deliberate):
 *   - here: discover the pages that carry those facts, fetch them politely,
 *     store the text verbatim with a hash per page, and re-read each site on a
 *     monthly cycle. No interpretation, no model, no cost per page.
 *   - downstream: whoever needs structured answers formats them from this
 *     text, and because every page carries `content_sha256`, only the pages
 *     that actually changed have to be formatted again.
 *
 * Why its own path rather than the municipal crawl: the municipal crawl walks
 * a town's site looking for anything of interest to a visitor, with a budget
 * per municipality and a resume checkpoint shaped around sites of thousands of
 * pages. A campground site is eight pages and its identity is known in
 * advance — there is nothing to discover and nothing to budget. Mixing the two
 * would put 271 small domains behind the queue of a few huge ones, and a stall
 * on one would stall the other. They share the fetcher and the politeness
 * rules, and nothing else: separate workflow, separate state, separate
 * schedule.
 *
 * Politeness: robots.txt is consulted for every URL, one request per domain
 * every 5 s, identifying user agent, text only, at most 8 pages per site.
 * Booking-portal listings are never fetched — the status pass labels them and
 * they are skipped here, because those pages are the portal's to serve, not
 * ours to copy.
 *
 * Input:  data/hotels/master.json
 *         data/_state/campground_site_status.json   (npm run quality:campground_status)
 * Output: data/campgrounds/official_pages.jsonl     (one line per campground)
 *
 * Run: npm run scrape:campground_sites
 *      LIMIT=5 npm run scrape:campground_sites              # canary
 *      ONLY=<master id> npm run scrape:campground_sites     # one site
 *      DEADLINE_MINUTES=90 npm run scrape:campground_sites  # stop launching after 90 min
 *
 * Resumable: each run re-reads only the sites whose last crawl is older than
 * the recheck window, oldest first, and writes the corpus back at checkpoints,
 * so an interrupted run loses at most the sites in flight.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { classifyLodging } from "../../src/lib/lodging.js";
import {
  contentHash,
  isStale,
  mergeVisit,
  selectInfoLinks,
  sharedWithMunicipalCrawl,
  type CrawledPage,
  type CrawledSite,
} from "../lib/campground_pages.js";
import { extract } from "../lib/extractor.js";
import { ErrorCounter, rateLimitedFetch } from "../lib/fetcher.js";
import { pageText } from "../lib/page_text.js";
import { shouldCrawl } from "../lib/robots.js";
import { notify } from "../lib/slack.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const STATUS_URL = new URL("data/_state/campground_site_status.json", ROOT);
const OUT_URL = new URL("data/campgrounds/official_pages.jsonl", ROOT);

/** Homepage plus the handful of pages that carry the bookable facts. */
const MAX_PAGES_PER_SITE = 8;
/** Per page. Campground pages are small; this only bounds a runaway. */
const MAX_TEXT_CHARS = 20_000;
/** Sites per checkpoint write. */
const CHECKPOINT_EVERY = 25;
/** Distinct domains in flight. Per-domain spacing is enforced by the fetcher. */
const GLOBAL_CONCURRENCY = 6;

const OPTIONS: ScrapeOptions = {
  ...DEFAULT_OPTIONS,
  rateLimitMs: 5_000, // public politeness policy: 5 s per domain
  globalConcurrency: GLOBAL_CONCURRENCY,
  timeoutMs: 20_000,
  retries: 1,
  userAgent:
    "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; campground official-page crawl)",
};

interface MasterHotel {
  id: string;
  name: string | null;
  name_en: string | null;
  type: string | null;
  website: string | null;
  prefecture_code: string | null;
}

interface StatusEntry {
  url: string | null;
  status: string;
  reason: string;
}

/** Per-domain spacing for this URL: doubled where the crawls can collide. */
function optionsFor(url: string): ScrapeOptions {
  return sharedWithMunicipalCrawl(url)
    ? { ...OPTIONS, rateLimitMs: OPTIONS.rateLimitMs * 2 }
    : OPTIONS;
}

async function fetchPage(
  url: string,
  counter: ErrorCounter,
): Promise<{ page: CrawledPage | null; links: { href: string; text: string }[]; attempted: boolean }> {
  const opts = optionsFor(url);
  const allowed = await shouldCrawl(url, opts);
  if (!allowed.allowed) return { page: null, links: [], attempted: false };

  const res = await rateLimitedFetch(url, opts, counter);
  if (!res.body || res.status >= 400) return { page: null, links: [], attempted: true };
  if (res.contentType && !/html|xml/i.test(res.contentType)) {
    return { page: null, links: [], attempted: true };
  }

  const ex = extract(res.body, res.finalUrl);
  const text = pageText(res.body).slice(0, MAX_TEXT_CHARS);
  if (text.length < 40) return { page: null, links: ex.links, attempted: true };

  return {
    page: {
      url,
      final_url: res.finalUrl,
      title: ex.title || "",
      http_status: res.status,
      content_sha256: contentHash(text),
      chars: text.length,
      charset: res.charset ?? null,
      text,
      fetched_at: res.fetched_at,
    },
    links: ex.links,
    attempted: true,
  };
}

async function crawlSite(c: MasterHotel, counter: ErrorCounter): Promise<CrawledSite> {
  const homepage = c.website!;
  const now = new Date().toISOString();
  const base: Omit<CrawledSite, "pages" | "pages_attempted" | "pages_failed"> = {
    id: c.id,
    name: c.name,
    prefecture_code: c.prefecture_code,
    homepage,
    crawled_at: now,
    pages_fetched_at: now,
  };

  const home = await fetchPage(homepage, counter);
  if (!home.page) {
    // On record either way: a site that answered nothing this month is a fact
    // the next run (and the status pass) should see, not a silent gap.
    return {
      ...base,
      pages: [],
      pages_attempted: home.attempted ? 1 : 0,
      pages_failed: home.attempted ? 1 : 0,
      note: home.attempted ? "homepage_unreadable" : "robots_disallowed",
    };
  }

  const pages: CrawledPage[] = [home.page];
  let attempted = 1;
  let failed = 0;

  for (const url of selectInfoLinks(home.links, home.page.final_url, MAX_PAGES_PER_SITE - 1)) {
    const got = await fetchPage(url, counter);
    if (!got.attempted) continue;
    attempted += 1;
    if (got.page) pages.push(got.page);
    else failed += 1;
  }

  return { ...base, pages, pages_attempted: attempted, pages_failed: failed };
}

async function loadCorpus(): Promise<Map<string, CrawledSite>> {
  const corpus = new Map<string, CrawledSite>();
  let raw: string;
  try {
    raw = await readFile(OUT_URL, "utf8");
  } catch {
    return corpus; // first run
  }
  let dropped = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const site = JSON.parse(trimmed) as CrawledSite;
      // A line without an id cannot be matched to a campground or refreshed,
      // so it is not kept: a reader of this file must be able to trust that
      // every line names the place it describes.
      if (typeof site.id === "string" && site.id) corpus.set(site.id, site);
      else dropped += 1;
    } catch {
      dropped += 1;
    }
  }
  if (dropped > 0) {
    console.error(`[campground_crawl] skipped ${dropped} unreadable line(s) in the corpus`);
  }
  return corpus;
}

async function saveCorpus(corpus: Map<string, CrawledSite>): Promise<void> {
  const lines = [...corpus.values()].map((s) => JSON.stringify(s));
  const path = fileURLToPath(OUT_URL);
  await mkdir(fileURLToPath(new URL("data/campgrounds/", ROOT)), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  await rename(tmp, path);
}

async function main(): Promise<void> {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const only = process.env.ONLY ?? null;
  const deadlineMinutes = process.env.DEADLINE_MINUTES
    ? Number(process.env.DEADLINE_MINUTES)
    : 180;
  const deadline = Date.now() + deadlineMinutes * 60_000;

  const master = JSON.parse(await readFile(MASTER_URL, "utf8")) as { hotels: MasterHotel[] };
  const campgrounds = master.hotels.filter((h) => classifyLodging(h) === "campground");

  let status: Record<string, StatusEntry>;
  try {
    const file = JSON.parse(await readFile(STATUS_URL, "utf8")) as {
      entries: Record<string, StatusEntry>;
    };
    status = file.entries ?? {};
  } catch {
    // The status pass decides which URLs are an operator's own live page.
    // Without it this job would fetch dead domains and portal listings, so it
    // stops rather than guessing.
    console.error(
      "[campground_crawl] data/_state/campground_site_status.json is missing.\n" +
        "  Run `npm run quality:campground_status` first (it labels which official\n" +
        "  pages are live), or prefetch it with `--preset campground`.",
    );
    process.exitCode = 1;
    return;
  }

  const corpus = await loadCorpus();
  const now = Date.now();

  const eligible = campgrounds.filter((c) => {
    if (!c.website || !/^https?:\/\//.test(c.website)) return false;
    // ONLY is a canary switch: one named site, status gate aside.
    if (only) return c.id === only;
    const st = status[c.id];
    // Only an operator's own page that answered. Portal listings, dead URLs
    // and pages a human still has to read are left to the status pass.
    return st?.status === "active" && st.url === c.website;
  });

  const due = eligible
    .filter((c) => {
      const seen = corpus.get(c.id);
      // A changed homepage invalidates what we stored under the old one.
      if (seen && seen.homepage !== c.website) return true;
      return isStale(seen?.crawled_at, now);
    })
    .sort((a, b) => {
      const ta = Date.parse(corpus.get(a.id)?.crawled_at ?? "") || 0;
      const tb = Date.parse(corpus.get(b.id)?.crawled_at ?? "") || 0;
      return ta - tb; // oldest first; never-crawled (0) lead
    });

  const targets = due.slice(0, Number.isFinite(limit) ? limit : undefined);
  console.error(
    `[campground_crawl] ${campgrounds.length} campgrounds, ${eligible.length} with a live` +
      ` official page, ${due.length} due, ${targets.length} this run` +
      ` (deadline ${deadlineMinutes} min)`,
  );
  if (targets.length === 0) {
    console.error("[campground_crawl] nothing due — every site was read within the window");
    return;
  }

  // Two campgrounds can share one page: a park with two pitches areas, or two
  // OSM entities for one operator. Crawl such a page once and record it under
  // each id, rather than asking the operator twice in the same run.
  const groups = new Map<string, MasterHotel[]>();
  for (const c of targets) {
    const key = c.website!;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }
  if (groups.size < targets.length) {
    console.error(
      `[campground_crawl] ${targets.length} sites share ${groups.size} distinct pages`,
    );
  }

  const counter = new ErrorCounter();
  const limiter = pLimit(GLOBAL_CONCURRENCY);
  let done = 0;
  let pagesStored = 0;
  let keptPreviousText = 0;
  let skippedForDeadline = 0;
  let writing: Promise<void> = Promise.resolve();

  await Promise.all(
    [...groups.values()].map((sharing) =>
      limiter(async () => {
        if (Date.now() > deadline) {
          // Soft stop: pages in flight finish and are written; the rest stay
          // due and lead the next run, because ordering is oldest-first.
          skippedForDeadline += sharing.length;
          return;
        }
        try {
          const visit = await crawlSite(sharing[0], counter);
          for (const c of sharing) {
            const merged = mergeVisit(corpus.get(c.id), {
              ...visit,
              id: c.id,
              name: c.name,
              prefecture_code: c.prefecture_code,
            });
            corpus.set(merged.id, merged);
            if (visit.pages.length === 0 && merged.pages.length > 0) keptPreviousText += 1;
          }
          pagesStored += visit.pages.length;
        } catch (err) {
          // One unreachable site must not end the run; it stays due.
          console.error(
            `[campground_crawl] ${sharing[0].website} failed: ${(err as Error).message}`,
          );
        }
        done += sharing.length;
        if (done % CHECKPOINT_EVERY < sharing.length) {
          // Serialise writes so two checkpoints cannot interleave on the file.
          writing = writing.then(() => saveCorpus(corpus));
          await writing;
          console.error(`[campground_crawl] ${done}/${targets.length} sites, checkpointed`);
        }
      }),
    ),
  );

  // Campgrounds that left the lodging layer (an OSM entity deleted upstream)
  // would otherwise sit in the corpus forever, never refreshed and never
  // removed. Dropped once per run, after the crawl, so a read failure of
  // master.json can never empty the corpus.
  const known = new Set(campgrounds.map((c) => c.id));
  let pruned = 0;
  for (const id of [...corpus.keys()]) {
    if (!known.has(id)) {
      corpus.delete(id);
      pruned += 1;
    }
  }

  await writing;
  await saveCorpus(corpus);

  const withPages = [...corpus.values()].filter((s) => s.pages.length > 0).length;
  const summary =
    `campground official pages — read ${done} site(s), stored ${pagesStored} page(s);` +
    ` corpus now ${corpus.size} site(s), ${withPages} with pages` +
    (keptPreviousText > 0 ? `; ${keptPreviousText} unreachable, previous text kept` : "") +
    (pruned > 0 ? `; ${pruned} no longer in the lodging layer, dropped` : "") +
    (skippedForDeadline > 0 ? `; ${skippedForDeadline} left for the next run (deadline)` : "");
  console.error(`[campground_crawl] ${summary}`);
  console.error(`[campground_crawl] wrote ${fileURLToPath(OUT_URL)}`);
  await notify(summary, done === 0 ? "warn" : "info");
}

main().catch((err) => {
  console.error("[campground_crawl] fatal:", err);
  process.exitCode = 1;
});
