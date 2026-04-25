/**
 * End-to-end scrape for a single municipality.
 *
 *   1. discover tourism pages from official URL
 *   2. fetch each, extract structured fields
 *   3. emit one TouristSpot per discovered tourism page
 *
 * Returns a MunicipalityScrapeResult ready for serialisation.
 */

import { createHash } from "node:crypto";
import { rateLimitedFetch, ErrorCounter } from "../lib/fetcher.js";
import { shouldCrawl } from "../lib/robots.js";
import { extract } from "../lib/extractor.js";
import { discoverTourismPages } from "../lib/discover.js";
import type {
  MunicipalityInput,
  MunicipalityScrapeResult,
  ScrapeOptions,
  TouristSpot,
} from "../lib/types.js";

function spotIdFromUrl(url: string): string {
  return createHash("sha256").update(url).digest("hex").slice(0, 16);
}

export async function scrapeOneMunicipality(
  m: MunicipalityInput,
  opts: ScrapeOptions,
  counter: ErrorCounter,
): Promise<MunicipalityScrapeResult> {
  const startedAt = new Date().toISOString();
  const result: MunicipalityScrapeResult = {
    municipality: {
      code: m.code,
      name: m.name,
      prefecture_code: m.prefecture_code,
      prefecture_name: m.prefecture_name,
    },
    official_url: m.official_url,
    tourism_pages_found: 0,
    pages_fetched: 0,
    pages_failed: 0,
    spots: [],
    multilingual: { en: 0, zh: 0, ko: 0 },
    errors: [],
    started_at: startedAt,
    finished_at: "",
    data_as_of: startedAt,
  };

  if (!m.official_url) {
    result.errors.push({ url: "", reason: "no official URL resolved" });
    result.finished_at = new Date().toISOString();
    return result;
  }

  // Phase 1: discover tourism pages.
  let discovery: { pages: { url: string; title: string }[]; visited_count: number };
  try {
    discovery = await discoverTourismPages(m.official_url, opts, counter);
  } catch (err) {
    result.errors.push({
      url: m.official_url,
      reason: `discovery failed: ${(err as Error).message}`,
    });
    result.finished_at = new Date().toISOString();
    return result;
  }
  result.tourism_pages_found = discovery.pages.length;

  // Phase 2: extract per-page details. We already fetched these once during
  // discovery, but discovery only kept titles. Re-fetching is wasteful; in v0
  // we accept the inefficiency to keep the code simple. The rate limiter
  // de-duplicates pacing per domain, so the extra requests are spaced.
  for (const page of discovery.pages) {
    const decision = await shouldCrawl(page.url, opts);
    if (!decision.allowed) {
      result.errors.push({
        url: page.url,
        reason: `robots: ${decision.reason}`,
      });
      continue;
    }
    const res = await rateLimitedFetch(page.url, opts, counter);
    if (!res.body) {
      result.pages_failed += 1;
      result.errors.push({
        url: page.url,
        reason: res.error ?? `status ${res.status}`,
      });
      continue;
    }
    result.pages_fetched += 1;

    const ext = extract(res.body, res.finalUrl);
    const name = ext.headings[0] || ext.title || page.title || page.url;

    const spot: TouristSpot = {
      id: spotIdFromUrl(res.finalUrl),
      url: res.finalUrl,
      name,
      description: ext.description,
      category: null,
      address: ext.address,
      coordinates: ext.geo,
      images: [
        ...(ext.ogImage ? [ext.ogImage] : []),
        ...ext.images.filter((u) => u !== ext.ogImage).slice(0, 4),
      ],
      source_url: res.finalUrl,
      language: ext.language,
      last_scraped_at: new Date().toISOString(),
    };
    result.spots.push(spot);

    if (spot.language === "en") result.multilingual.en += 1;
    if (spot.language === "zh") result.multilingual.zh += 1;
    if (spot.language === "ko") result.multilingual.ko += 1;
  }

  result.finished_at = new Date().toISOString();
  return result;
}
