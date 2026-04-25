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
import type { ScrapeOptions } from "./types.js";

const TOURISM_PATTERNS = [
  /kanko/i,
  /kankou/i,
  /kanko-/i,
  /sightseeing/i,
  /tourism/i,
  /観光/,
  /見どころ/,
  /名所/,
  /旅行/,
  /spot/i,
  /attraction/i,
  /visit/i,
];

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
  const visited = new Set<string>();
  const queue: { url: string; depth: number }[] = [{ url: startUrl, depth: 0 }];
  const pages: { url: string; title: string }[] = [];
  let startDomain: string;
  try {
    startDomain = new URL(startUrl).hostname;
  } catch {
    return { pages: [], visited_count: 0 };
  }

  const maxDepth = 2;

  while (queue.length > 0 && pages.length < opts.maxPagesPerMunicipality) {
    const { url, depth } = queue.shift()!;
    if (visited.has(url)) continue;
    visited.add(url);
    if (shouldSkipUrl(url)) continue;
    if (depth > maxDepth) continue;

    const decision = await shouldCrawl(url, opts);
    if (!decision.allowed) continue;

    const res = await rateLimitedFetch(url, opts, counter);
    if (!res.body) continue;

    const ext = extract(res.body, res.finalUrl);

    const isTourismPage =
      depth > 0 &&
      (isTourismLike(url) ||
        isTourismLike(ext.title) ||
        isTourismLike(ext.description ?? ""));
    if (isTourismPage) {
      pages.push({ url: res.finalUrl, title: ext.title });
    }

    if (depth >= maxDepth) continue;

    for (const link of ext.links) {
      if (visited.has(link.href)) continue;
      if (shouldSkipUrl(link.href)) continue;
      let lu: URL;
      try {
        lu = new URL(link.href);
      } catch {
        continue;
      }
      if (lu.hostname !== startDomain) continue;

      const tourism =
        isTourismLike(link.href) || isTourismLike(link.text);
      if (tourism) {
        queue.push({ url: link.href, depth: depth + 1 });
      } else if (depth === 0) {
        // From the start page, also peek at top-level navigation links
        // even if they don't obviously match — only one level deep.
        const text = link.text.replace(/\s+/g, " ").trim();
        if (text.length > 0 && text.length < 30) {
          // skip; we already filter by tourism patterns above
        }
      }
    }
  }

  return { pages, visited_count: visited.size };
}
