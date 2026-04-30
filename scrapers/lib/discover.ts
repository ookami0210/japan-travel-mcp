/**
 * Tourism page discovery.
 *
 * Strategy: BFS from the municipality's official site, following only links
 * whose URL or anchor text matches tourism-related keywords. Stay on the
 * starting domain. Cap total pages to avoid runaway crawls.
 *
 * Returns the set of URLs deemed "tourism content" (the start page is
 * excluded unless it itself looks like a tourism page).
 */

import { rateLimitedFetch, ErrorCounter } from "./fetcher.js";
import { extract } from "./extractor.js";
import { shouldCrawl } from "./robots.js";
import { canonicalize, pickCanonical } from "./canonical.js";
import type { ScrapeOptions } from "./types.js";

// Vocabulary expanded 2026-04-30 (see docs/decisions/0001-multi-source-tourism-data.md).
// Earlier we missed feature pages that used "祭礼" / "催事" / "特産" / "名物" / "guide"
// / "things-to-do" etc., even though tourism-association sites lean on those words.
const TOURISM_PATTERNS = [
  // ── English: tourism / sightseeing core ─────────────────────────
  /kanko/i,
  /kankou/i,
  /sightseeing/i,
  /tourism/i,
  /sights/i,
  /attraction/i,
  /visit/i,
  /spot/i,
  /poi/i,
  /things[-_]?to[-_]?do/i,
  /must[-_]?see/i,
  /must[-_]?visit/i,
  /experience/i,
  /guide/i,
  /\btour\b/i,
  /\btours\b/i,
  /itinerary/i,
  /destination/i,
  /explore/i,
  /discover/i,
  /trip/i,
  // ── English: events / festivals / culture ───────────────────────
  /festival/i,
  /event/i,
  /matsuri/i,
  /cultural/i,
  /heritage/i,
  // ── English: food / specialty ───────────────────────────────────
  /cuisine/i,
  /gourmet/i,
  /local[-_]?food/i,
  /specialt(?:y|ies)/i,
  /souvenir/i,
  // ── Japanese: tourism / sightseeing core ────────────────────────
  /観光/,
  /見どころ/,
  /名所/,
  /旅行/,
  /魅力/,
  /おでかけ/,
  /お出かけ/,
  /散策/,
  /史跡/,
  /文化財/,
  /景観/,
  /巡り/,
  /モデルコース/,
  /体験/,
  /絶景/,
  /特集/,
  /ガイド/,
  /楽しみ方/,
  /\bおすすめ\b/,
  // ── Japanese: festivals / events / rituals ──────────────────────
  /イベント/,
  /祭り/,
  /祭礼/,
  /催事/,
  /催し/,
  /神事/,
  /行事/,
  /年中行事/,
  /縁日/,
  /花火/,
  /まつり/,
  // ── Japanese: regional food / specialties / crafts ──────────────
  /特産/,
  /名物/,
  /名産/,
  /ご当地/,
  /グルメ/,
  /銘菓/,
  /銘酒/,
  /地酒/,
  /お土産/,
  /土産/,
  /逸品/,
  /工芸/,
  /伝統工芸/,
  /和菓子/,
  /郷土料理/,
];

// Multilingual landing paths. We seed these explicitly per municipality so
// that EN/ZH/KO sub-sites are reached even without hreflang declarations.
const LANGUAGE_PATHS = [
  "/en/",
  "/en",
  "/english/",
  "/english",
  "/en-us/",
  "/en-gb/",
  "/zh/",
  "/zh-cn/",
  "/zh-tw/",
  "/chinese/",
  "/ko/",
  "/korean/",
];

const LANGUAGE_PATH_RE = /\/(en|english|en-us|en-gb|zh|zh-cn|zh-tw|chinese|ko|korean)(\/|$|\?)/i;

const SKIP_PATTERNS = [
  /\.(pdf|jpg|jpeg|png|gif|svg|webp|zip|xlsx?|docx?|pptx?|mp4|mp3)$/i,
  /^mailto:/i,
  /^tel:/i,
  /^javascript:/i,
  /\/login/i,
  /\/admin/i,
  /\/member/i,
  /\/cgi-bin/i,
];

export function isTourismLike(text: string): boolean {
  return TOURISM_PATTERNS.some((p) => p.test(text));
}

function buildLanguageSeeds(startUrl: string): string[] {
  try {
    const u = new URL(startUrl);
    const base = `${u.protocol}//${u.hostname}`;
    return LANGUAGE_PATHS.map((p) => base + p);
  } catch {
    return [];
  }
}

function shouldSkipUrl(url: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(url));
}

// Feature pages (curated articles, individual events / spots / specialties)
// usually live below one of these path segments. When the BFS reaches one,
// we let it explore one extra hop into the page's outbound links so it can
// pick up linked sub-articles ("related events", "official site of this
// festival", etc). Added 2026-04-30 (ADR 0001 / workstream B3).
const FEATURE_URL_PATTERNS = [
  /\/feature\//i,
  /\/features\//i,
  /\/special\//i,
  /\/specials\//i,
  /\/event\//i,
  /\/events\//i,
  /\/spot\//i,
  /\/spots\//i,
  /\/article\//i,
  /\/articles\//i,
  /\/post\//i,
  /\/posts\//i,
  /\/detail\//i,
  /\/details\//i,
  /\/matsuri\//i,
  /\/festival\//i,
  /\/festivals\//i,
  /\/特集/u,
  /\/イベント\//u,
  /\/まつり/u,
  /\/詳細/u,
  /\/モデルコース/u,
  /\/グルメ/u,
  /\/特産/u,
];

function isFeaturePage(url: string): boolean {
  return FEATURE_URL_PATTERNS.some((p) => p.test(url));
}

export interface DiscoveryResult {
  pages: { url: string; title: string }[];
  visited_count: number;
  /** Number of distinct seed URLs we crawled from. Always >= 1. */
  seed_count: number;
}

/**
 * Discover tourism pages reachable from one or more seed URLs.
 *
 * In the multi-source design (ADR 0001) a single municipality can have
 * several seed URLs — its city-hall site (*.lg.jp), its tourism-association
 * site, sometimes a prefecture-level subdomain. We BFS from every seed
 * into the same `visited` / `pages` accumulators, so duplicates collapse
 * naturally and the per-municipality page budget covers all seeds together.
 *
 * For backwards compatibility a single-string `startUrls` argument is
 * still accepted.
 */
export async function discoverTourismPages(
  startUrls: string | string[],
  opts: ScrapeOptions,
  counter?: ErrorCounter,
): Promise<DiscoveryResult> {
  const seeds = (Array.isArray(startUrls) ? startUrls : [startUrls]).filter(
    (s) => typeof s === "string" && s.length > 0,
  );
  if (seeds.length === 0) {
    return { pages: [], visited_count: 0, seed_count: 0 };
  }

  // visited tracks canonical URLs so that /a/, /a, /a/index.html collapse.
  const visited = new Set<string>();
  // Seed queue with every seed URL + its multilingual landing path probes.
  const queue: { url: string; depth: number }[] = [];
  for (const seed of seeds) {
    queue.push({ url: seed, depth: 0 });
    for (const langSeed of buildLanguageSeeds(seed)) {
      queue.push({ url: langSeed, depth: 0 });
    }
  }
  // pages keyed by canonical URL for cheap dedup.
  const pagesByCanonical = new Map<string, { url: string; title: string }>();

  // Compute "same-domain" guards for each seed so links from one seed can
  // freely walk that seed's site, but won't drift onto an unrelated host.
  const domainsByHost: Array<{ host: string; domain: string }> = [];
  for (const seed of seeds) {
    try {
      const u = new URL(seed);
      const labels = u.hostname.split(".");
      domainsByHost.push({
        host: u.hostname,
        domain: labels.slice(-3).join("."),
      });
    } catch {
      // skip malformed seed
    }
  }
  if (domainsByHost.length === 0) {
    return { pages: [], visited_count: 0, seed_count: seeds.length };
  }

  function isOnSameSiteAsAnySeed(url: string): boolean {
    try {
      const u = new URL(url);
      return domainsByHost.some(
        (d) => u.hostname === d.host || u.hostname.endsWith(d.domain),
      );
    } catch {
      return false;
    }
  }

  const maxDepth = 2;

  const enqueue = (url: string, depth: number): void => {
    const canonical = canonicalize(url);
    if (visited.has(canonical)) return;
    if (shouldSkipUrl(url)) return;
    queue.push({ url, depth });
  };

  while (queue.length > 0 && pagesByCanonical.size < opts.maxPagesPerMunicipality) {
    const { url, depth } = queue.shift()!;
    const preCanonical = canonicalize(url);
    if (visited.has(preCanonical)) continue;
    visited.add(preCanonical);
    if (shouldSkipUrl(url)) continue;
    if (depth > maxDepth) continue;

    const decision = await shouldCrawl(url, opts);
    if (!decision.allowed) continue;

    const res = await rateLimitedFetch(url, opts, counter);
    if (!res.body) continue;

    const ext = extract(res.body, res.finalUrl);

    // Resolve final canonical (page-declared wins).
    const canonical = pickCanonical(res.finalUrl, ext.canonical, res.finalUrl);
    visited.add(canonical);

    const isLangSeed = LANGUAGE_PATH_RE.test(canonical);
    const isTourismPage =
      // Pages reachable below the root, OR multilingual landing pages,
      // count as tourism content if they match a tourism signal.
      (depth > 0 || isLangSeed) &&
      (isLangSeed ||
        isTourismLike(url) ||
        isTourismLike(ext.title) ||
        isTourismLike(ext.description ?? ""));
    if (isTourismPage && !pagesByCanonical.has(canonical)) {
      pagesByCanonical.set(canonical, { url: canonical, title: ext.title });
    }

    // Follow hreflang alternates explicitly, regardless of depth budget.
    for (const alt of ext.hreflangs) {
      const altCanonical = canonicalize(alt.href);
      if (visited.has(altCanonical)) continue;
      if (shouldSkipUrl(alt.href)) continue;
      enqueue(alt.href, Math.min(depth + 1, maxDepth));
    }

    // Feature pages (e.g. /feature/yoshidafirefes/) get one extra hop of
    // depth budget so the BFS can follow links inside the article — to a
    // sub-event page, the festival's own official site, the food page that
    // belongs to the feature, etc. ADR 0001 / workstream B3.
    const onFeaturePage = isFeaturePage(canonical);
    const effectiveMaxDepth = onFeaturePage ? maxDepth + 1 : maxDepth;
    if (depth >= effectiveMaxDepth) continue;

    for (const link of ext.links) {
      const linkCanonical = canonicalize(link.href);
      if (visited.has(linkCanonical)) continue;
      if (shouldSkipUrl(link.href)) continue;
      let lu: URL;
      try {
        lu = new URL(link.href);
      } catch {
        continue;
      }
      // Allow links that stay on any of the seed sites (handles
      // city-hall ↔ tourism-association cross-links, www → kankou subdomain
      // hops, etc.).
      if (!isOnSameSiteAsAnySeed(link.href)) continue;

      const tourism = isTourismLike(link.href) || isTourismLike(link.text);
      const isLangLink = LANGUAGE_PATH_RE.test(link.href);
      const isFeatureLink = isFeaturePage(link.href);
      if (tourism || isLangLink || isFeatureLink) {
        enqueue(link.href, depth + 1);
      }
    }
  }

  return {
    pages: Array.from(pagesByCanonical.values()),
    visited_count: visited.size,
    seed_count: seeds.length,
  };
}
