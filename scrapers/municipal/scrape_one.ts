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
import { pickCanonical } from "../lib/canonical.js";
import { passesSpotFilter } from "../lib/spot_filter.js";
import { geocodeAddress } from "../lib/geocode.js";
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
  centroids?: Record<string, { lat: number; lng: number }>,
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

  // Build the seed list: primary city-hall URL + any tourism-association
  // URLs we know about (ADR 0001 / workstream A — multi-source seeds).
  const seeds: string[] = [];
  if (m.official_url) seeds.push(m.official_url);
  for (const u of m.tourism_org_urls ?? []) {
    if (u && !seeds.includes(u)) seeds.push(u);
  }
  if (seeds.length === 0) {
    result.errors.push({ url: "", reason: "no seed URL (no official_url and no tourism_org_urls)" });
    result.finished_at = new Date().toISOString();
    return result;
  }

  // Phase 1: discover tourism pages from all seeds.
  let discovery: { pages: { url: string; title: string }[]; visited_count: number };
  try {
    discovery = await discoverTourismPages(seeds, opts, counter);
  } catch (err) {
    result.errors.push({
      url: seeds[0],
      reason: `discovery failed: ${(err as Error).message}`,
    });
    result.finished_at = new Date().toISOString();
    return result;
  }
  result.tourism_pages_found = discovery.pages.length;

  // Phase 2: extract per-page details and emit canonical-deduplicated spots.
  // discovery.pages are already canonicalised, but we re-check after fetch in
  // case the page declared a different canonical via <link rel="canonical">.
  const seenSpotIds = new Set<string>();

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
    const canonical = pickCanonical(res.finalUrl, ext.canonical, res.finalUrl);
    const id = spotIdFromUrl(canonical);
    if (seenSpotIds.has(id)) {
      // Same canonical URL produced by a different fetched URL. Skip.
      continue;
    }

    const name = ext.headings[0] || ext.title || page.title || canonical;

    const filter = passesSpotFilter({
      url: canonical,
      title: name,
      description: ext.description,
    });
    if (!filter.ok) {
      result.errors.push({
        url: canonical,
        reason: `spot filter: ${filter.reason}`,
      });
      continue;
    }

    seenSpotIds.add(id);

    // Coordinate fallback chain (best precision wins):
    //   1. exact:                page-declared og:geo / schema.org GeoCoordinates
    //   2. address_geocoded:     extracted address → 国土地理院 lookup
    //   3. municipality_centroid: Wikidata P625 of the municipality (approximate)
    let coordinates = ext.geo;
    let coordinate_precision: TouristSpot["coordinate_precision"] = null;
    if (coordinates) {
      coordinate_precision = "exact";
    } else if (ext.address) {
      const geo = await geocodeAddress(ext.address, opts, counter);
      if (geo) {
        coordinates = geo;
        coordinate_precision = "address_geocoded";
      }
    }
    if (!coordinates && centroids && centroids[m.code]) {
      coordinates = centroids[m.code];
      coordinate_precision = "municipality_centroid";
    }

    const spot: TouristSpot = {
      id,
      url: canonical,
      name,
      description: ext.description,
      body_paragraphs: ext.body_paragraphs,
      category: null,
      address: ext.address,
      coordinates,
      coordinate_precision,
      images: [
        ...(ext.ogImage ? [ext.ogImage] : []),
        ...ext.images.filter((u) => u !== ext.ogImage).slice(0, 4),
      ],
      schema_events: ext.schema_events,
      schema_places: ext.schema_places,
      source_url: canonical,
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
