/**
 * Which discovered tourism-org URLs may be used as CRAWL SEEDS by the steady
 * scrape (scrapers/daily.ts).
 *
 * Two classes of seed were found polluting tourism_org_urls.json and derailing
 * the steady scrape (they caused unbounded frontiers, zero municipality-specific
 * spots, never-completing crawls, and a 59 MB checkpoint death-spiral):
 *
 *  1. Shared prefecture-wide portals — discovery tagged these `prefecture_portal`.
 *     ~half the municipalities were seeded from a portal covering the whole
 *     prefecture (maruchiba.jp, visit-hokkaido.jp, my-kagawa.jp, aichi-now.jp …),
 *     with 25-51 municipalities pointing at the SAME host. Crawling one from a
 *     single municipality's run means trying to crawl the entire prefectural
 *     portal: thousands of pages, nothing municipality-specific, a frontier that
 *     never drains. Dropped as seeds — the municipality still has its
 *     official_url and any city-hall tourism links.
 *
 *  2. Framework / standards / CDN hosts captured by mistake as a
 *     `city_hall_outbound` link (e.g. drupal.org, the CMS the site is built on).
 *     Never a tourism page.
 *
 * Note: small operators on site builders (*.wixsite.com, *.jimdofree.com) are
 * legitimate official tourism sites and are NOT excluded.
 *
 * Pure functions only — no I/O.
 */

/** Discovery source labels that mark a shared, non-municipality-specific seed. */
export const EXCLUDED_SEED_SOURCES: ReadonlySet<string> = new Set([
  "prefecture_portal",
]);

/** Framework / standards / CDN hosts that are never a tourism page. */
export const EXCLUDED_SEED_HOSTS: readonly string[] = [
  "drupal.org",
  "wordpress.org",
  "w3.org",
  "schema.org",
  "gmpg.org",
  "jquery.com",
  "googleapis.com",
  "gstatic.com",
  "example.com",
  "example.org",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * True when a discovered tourism-org URL must NOT be used as a crawl seed:
 * it is a shared prefecture-wide portal (by discovery source) or a
 * framework/standards/CDN host (by domain), or it does not parse.
 */
export function shouldDropSeed(url: string, source?: string | null): boolean {
  if (source && EXCLUDED_SEED_SOURCES.has(source)) return true;
  const host = hostOf(url);
  if (!host) return true;
  return EXCLUDED_SEED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}
