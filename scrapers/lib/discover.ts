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

const TOURISM_PATTERNS = [
  // English
  /kanko/i,
  /kankou/i,
  /sightseeing/i,
  /tourism/i,
  /sights/i,
  /attraction/i,
  /visit/i,
  /spot/i,
  /poi/i,
  // Japanese — high-precision tourism words
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
  // Events / festivals — typically curated for visitors
  /イベント/,
  /祭り/,
  /festival/i,
  /event/i,
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

export interface DiscoveryResult {
  pages: { url: string; title: string }[];
  visited_count: number;
}

export async function discoverTourismPages(
  startUrl: string,
  opts: ScrapeOptions,
  counter?: ErrorCounter,
): Promise<DiscoveryResult> {
  // visited tracks canonical URLs so that /a/, /a, /a/index.html collapse.
  const visited = new Set<string>();
  // Seed with the start URL plus multilingual landing path probes.
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  for (const seed of buildLanguageSeeds(startUrl)) {
    queue.push({ url: seed, depth: 0 });
  }
  // pages keyed by canonical URL for cheap dedup.
  const pagesByCanonical = new Map<string, { url: string; title: string }>();

  let startHost: string;
  let startDomain: string;
  try {
    const u = new URL(startUrl);
    startHost = u.hostname;
    // Allow same-domain subdomains: e.g. www.town.x vs kankou.town.x
    // Approximate "same domain" as "shares the last 2-3 labels of the host".
    const labels = startHost.split(".");
    startDomain = labels.slice(-3).join("."); // e.g. "town.chizu.tottori.jp" → "chizu.tottori.jp"
  } catch {
    return { pages: [], visited_count: 0 };
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

    if (depth >= maxDepth) continue;

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
      // Allow same registered domain (handles www → kankou subdomain hops)
      if (!lu.hostname.endsWith(startDomain) && lu.hostname !== startHost) continue;

      const tourism = isTourismLike(link.href) || isTourismLike(link.text);
      const isLangLink = LANGUAGE_PATH_RE.test(link.href);
      if (tourism || isLangLink) {
        enqueue(link.href, depth + 1);
      }
    }
  }

  return {
    pages: Array.from(pagesByCanonical.values()),
    visited_count: visited.size,
  };
}
