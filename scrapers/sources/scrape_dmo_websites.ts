/**
 * Discover each DMO's official website URL from its 形成確立計画 PDF text,
 * then BFS-crawl that website for tourism content.
 *
 * Why (KJ-confirmed 2026-05-02): each DMO publishes promotional content
 * about their region. Embedding that content alongside prefecture-scraped
 * spots gives AI agents a wider, region-curated view of what each area
 * wants visitors to know about. Comprehensiveness + neutrality.
 *
 * Pipeline:
 *   1. Walk data/dmo/<id>/plan.json
 *   2. Regex-extract URLs from plan_chunks
 *   3. Pick the most-likely DMO homepage (heuristics described below)
 *   4. BFS-crawl up to MAX_PAGES with the existing fetcher / extractor
 *   5. Save data/dmo/<id>/pages.json
 *
 * Run:
 *   npm run scrape:dmo_websites
 *   PREFS=01,02 npm run scrape:dmo_websites   # only DMOs in Hokkaido/Aomori
 *   LIMIT=10 npm run scrape:dmo_websites      # smoke test
 *
 * Resume-safe: skips DMOs whose pages.json already exists. Delete the
 * file to force re-scrape.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import pLimit from "p-limit";
import { rateLimitedFetch, ErrorCounter } from "./../lib/fetcher.js";
import { extract } from "./../lib/extractor.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "./../lib/types.js";

const ROOT = new URL("../../", import.meta.url);
const DMO_DIR = new URL("data/dmo/", ROOT);

const MAX_PAGES_PER_DMO = 30;
const RATE_LIMIT_MS = 800;
const GLOBAL_CONCURRENCY = 6;

interface PlanFile {
  id: string;
  name: string;
  prefectures: string[];
  municipalities: string[];
  plan_pdf_url: string | null;
  plan_chunks: { idx: number; text: string }[];
}

interface ExtractedSpot {
  url: string;
  finalUrl: string;
  title: string;
  description: string | null;
  body_paragraphs: string[];
  language: string;
  fetched_at: string;
}

interface DmoPagesFile {
  id: string;
  name: string;
  prefectures: string[];
  municipalities: string[];
  homepage_url: string;
  pages: ExtractedSpot[];
  fetched_at: string;
  pages_attempted: number;
  pages_failed: number;
}

const URL_RE = /https?:\/\/[A-Za-z0-9./?=&%_~+\-#:]+/g;

const HOMEPAGE_DENYLIST = new Set([
  "mlit.go.jp",
  "kankocho.go.jp",
  "kankocho.mlit.go.jp",
  "wikipedia.org",
  "ja.wikipedia.org",
  "en.wikipedia.org",
  "facebook.com",
  "www.facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "youtube.com",
  "www.youtube.com",
  "google.com",
  "maps.google.com",
  "google.co.jp",
  "goo.gl",
  "youtu.be",
  "line.me",
  "page.line.me",
  "tabelog.com",
  "tripadvisor.com",
  "tripadvisor.co.jp",
  "rakuten.co.jp",
  "jalan.net",
]);

const HOMEPAGE_KEYWORDS = [
  "tourism", "kanko", "kankou", "travel", "trip", "navi", "promo",
  "visit", "go-", "discover", "experience", "dmo",
];

/** Pick the most plausible DMO-homepage URL out of candidates. */
function pickHomepage(candidates: string[]): string | null {
  // Step 1: dedupe + filter denylist + only http(s)
  const filtered = Array.from(
    new Set(
      candidates
        .map((u) => {
          try {
            const url = new URL(u);
            if (!/^https?:$/.test(url.protocol)) return null;
            const host = url.hostname.replace(/^www\./, "");
            if (HOMEPAGE_DENYLIST.has(host)) return null;
            if (host.endsWith(".pdf")) return null;
            // Strip query/fragment for ranking; we re-add if no path-bearing
            return `${url.protocol}//${url.hostname}${url.pathname.replace(/\/$/, "")}`;
          } catch {
            return null;
          }
        })
        .filter((u): u is string => !!u),
    ),
  );
  if (filtered.length === 0) return null;

  // Step 2: rank by heuristics
  const scored = filtered.map((u) => {
    let s = 0;
    const url = new URL(u);
    const pathSegments = url.pathname.split("/").filter(Boolean).length;
    // Shorter path = more likely homepage
    s += Math.max(0, 5 - pathSegments) * 10;
    // Tourism keywords in hostname
    const hostLower = url.hostname.toLowerCase();
    for (const kw of HOMEPAGE_KEYWORDS) {
      if (hostLower.includes(kw)) {
        s += 30;
        break;
      }
    }
    // .or.jp / .ne.jp / .jp suggest org website (vs commercial)
    if (hostLower.endsWith(".or.jp") || hostLower.endsWith(".ne.jp")) s += 15;
    else if (hostLower.endsWith(".jp")) s += 10;
    return { url: u, score: s };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.url ?? null;
}

/** BFS-crawl a DMO website up to MAX_PAGES, return extracted spots. */
async function crawlDmoSite(
  homepage: string,
  opts: ScrapeOptions,
  counter: ErrorCounter,
): Promise<{ pages: ExtractedSpot[]; attempted: number; failed: number }> {
  const visited = new Set<string>();
  const queue: string[] = [homepage];
  const pages: ExtractedSpot[] = [];
  let attempted = 0;
  let failed = 0;
  let homeHost = "";
  try {
    homeHost = new URL(homepage).hostname;
  } catch {
    return { pages, attempted, failed };
  }

  while (queue.length > 0 && pages.length < MAX_PAGES_PER_DMO) {
    const url = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    attempted++;
    try {
      const fr = await rateLimitedFetch(url, opts, counter);
      if (!fr.body || fr.status >= 400) {
        failed++;
        continue;
      }
      if (!fr.contentType || !fr.contentType.includes("html")) continue;
      const ex = extract(fr.body, fr.finalUrl);
      if ((ex.title?.length ?? 0) >= 2 || ex.body_paragraphs.length > 0) {
        pages.push({
          url,
          finalUrl: fr.finalUrl,
          title: ex.title || "",
          description: ex.description ?? null,
          body_paragraphs: ex.body_paragraphs.slice(0, 8),
          language: ex.language,
          fetched_at: fr.fetched_at,
        });
      }
      // BFS: enqueue same-host links not yet visited
      for (const link of ex.links.slice(0, 60)) {
        try {
          const lh = new URL(link.href).hostname;
          if (lh !== homeHost) continue;
          if (!visited.has(link.href) && queue.length < MAX_PAGES_PER_DMO * 3) {
            queue.push(link.href);
          }
        } catch {
          // skip malformed
        }
      }
    } catch {
      failed++;
    }
  }
  return { pages, attempted, failed };
}

interface OverrideFile {
  overrides?: Record<string, string>;
}

interface TourismOrgUrlsFile {
  entries?: {
    code: string;
    primary?: string | null;
    candidates?: { url: string; confidence: string }[];
  }[];
}

let cachedOverrides: Record<string, string> | null = null;
let cachedMunicipalityUrls: Map<string, string> | null = null;

async function loadOverrides(): Promise<Record<string, string>> {
  if (cachedOverrides) return cachedOverrides;
  const url = new URL("data/_state/dmo_website_overrides.json", ROOT);
  if (!existsSync(fileURLToPath(url))) {
    cachedOverrides = {};
    return cachedOverrides;
  }
  try {
    const f = JSON.parse(await readFile(fileURLToPath(url), "utf8")) as OverrideFile;
    cachedOverrides = f.overrides ?? {};
  } catch {
    cachedOverrides = {};
  }
  return cachedOverrides;
}

async function loadMunicipalityUrls(): Promise<Map<string, string>> {
  if (cachedMunicipalityUrls) return cachedMunicipalityUrls;
  const url = new URL("data/_state/tourism_org_urls.json", ROOT);
  if (!existsSync(fileURLToPath(url))) {
    cachedMunicipalityUrls = new Map();
    return cachedMunicipalityUrls;
  }
  try {
    const f = JSON.parse(await readFile(fileURLToPath(url), "utf8")) as TourismOrgUrlsFile;
    const map = new Map<string, string>();
    for (const e of f.entries ?? []) {
      if (e.primary) map.set(e.code, e.primary);
    }
    cachedMunicipalityUrls = map;
  } catch {
    cachedMunicipalityUrls = new Map();
  }
  return cachedMunicipalityUrls;
}

/**
 * Layered URL discovery (KJ-confirmed 2026-05-02):
 *   1. data/_state/dmo_website_overrides.json — manual mapping (best)
 *   2. plan PDF text regex — works when the plan mentions the URL
 *   3. tourism_org_urls.json — pick the most-relevant municipality's
 *      tourism portal as a proxy when the DMO covers a small region
 *   4. give up — record note: "no_homepage_url_found"
 */
async function discoverHomepage(plan: PlanFile): Promise<{ url: string | null; via: string }> {
  const overrides = await loadOverrides();
  if (overrides[plan.id]) {
    return { url: overrides[plan.id], via: "override" };
  }
  const allText = plan.plan_chunks.map((c) => c.text).join(" ");
  const candidates = allText.match(URL_RE) ?? [];
  const fromText = pickHomepage(candidates);
  if (fromText) return { url: fromText, via: "plan_text" };

  // Fallback to tourism_org_urls.json: if the DMO covers ≤3 municipalities,
  // pick the first muni's tourism portal as a proxy. Wider-coverage DMOs
  // (prefectural / inter-prefectural) need manual override — generic
  // pref portal would be misleading.
  if (plan.municipalities.length === 0 || plan.municipalities.length > 3) {
    return { url: null, via: "no_url_found" };
  }
  const muniUrls = await loadMunicipalityUrls();
  // We don't have JIS codes per DMO muni name, so this is best-effort —
  // skip the fallback unless we extend dmo.json with codes later.
  return { url: null, via: "no_url_found" };
}

async function processDmo(
  dmoId: string,
  opts: ScrapeOptions,
  counter: ErrorCounter,
): Promise<void> {
  const planPath = new URL(`${dmoId}/plan.json`, DMO_DIR);
  const pagesPath = new URL(`${dmoId}/pages.json`, DMO_DIR);
  if (existsSync(fileURLToPath(pagesPath))) {
    process.stderr.write(`[dmo_web] ${dmoId} skip (pages.json exists)\n`);
    return;
  }
  let plan: PlanFile;
  try {
    plan = JSON.parse(await readFile(fileURLToPath(planPath), "utf8")) as PlanFile;
  } catch {
    process.stderr.write(`[dmo_web] ${dmoId} skip (no plan.json)\n`);
    return;
  }
  const { url: homepage, via: discoveryVia } = await discoverHomepage(plan);
  if (!homepage) {
    process.stderr.write(
      `[dmo_web] ${dmoId} (${plan.name}) no homepage URL [${discoveryVia}]\n`,
    );
    await writeFile(
      fileURLToPath(pagesPath),
      JSON.stringify(
        {
          id: plan.id,
          name: plan.name,
          prefectures: plan.prefectures,
          municipalities: plan.municipalities,
          homepage_url: "",
          pages: [],
          pages_attempted: 0,
          pages_failed: 0,
          fetched_at: new Date().toISOString(),
          discovery_via: discoveryVia,
          note: "no_homepage_url_found",
        },
        null,
        2,
      ),
      "utf8",
    );
    return;
  }
  process.stderr.write(`[dmo_web] ${dmoId} (${plan.name}) → ${homepage} [${discoveryVia}]\n`);
  const { pages, attempted, failed } = await crawlDmoSite(homepage, opts, counter);
  const out: DmoPagesFile & { discovery_via: string } = {
    id: plan.id,
    name: plan.name,
    prefectures: plan.prefectures,
    municipalities: plan.municipalities,
    homepage_url: homepage,
    pages,
    pages_attempted: attempted,
    pages_failed: failed,
    fetched_at: new Date().toISOString(),
    discovery_via: discoveryVia,
  };
  await mkdir(dirname(fileURLToPath(pagesPath)), { recursive: true });
  await writeFile(fileURLToPath(pagesPath), JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    `[dmo_web] ${dmoId} done — ${pages.length}/${attempted} pages (${failed} failed)\n`,
  );
}

async function main(): Promise<void> {
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
  const opts: ScrapeOptions = {
    ...DEFAULT_OPTIONS,
    rateLimitMs: RATE_LIMIT_MS,
    globalConcurrency: GLOBAL_CONCURRENCY,
    retries: 1,
    maxPagesPerMunicipality: MAX_PAGES_PER_DMO,
  };
  const counter = new ErrorCounter();

  let ids: string[];
  try {
    ids = (await readdir(fileURLToPath(DMO_DIR))).filter((f) => !f.startsWith("."));
  } catch (e) {
    throw new Error(`No data/dmo/ — run fetch_dmo_plans.py first. ${(e as Error).message}`);
  }
  if (limit) ids = ids.slice(0, limit);
  process.stderr.write(`[dmo_web] processing ${ids.length} DMOs\n`);

  const limiter = pLimit(GLOBAL_CONCURRENCY);
  await Promise.all(
    ids.map((id) => limiter(() => processDmo(id, opts, counter))),
  );

  process.stderr.write(`[dmo_web] all done\n`);
}

main().catch((err) => {
  console.error("[dmo_web] FAILED:", err);
  process.exit(1);
});
