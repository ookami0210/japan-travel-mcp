/**
 * Address → coordinate geocoder via GSI (国土地理院).
 *
 * Endpoint: https://msearch.gsi.go.jp/address-search/AddressSearch?q=<address>
 *   - Public service operated by the Geospatial Information Authority of Japan
 *   - Returns GeoJSON-like array; coordinates are [lng, lat]
 *   - No auth, no API key, no documented rate limit but be reasonable
 *
 * We cache responses in-process so the same address never hits the API twice.
 *
 * The fetcher's per-domain rate limiter naturally throttles us. We pass in
 * opts with a 1-second rate limit (GSI is a stable government service and
 * 1s is well within polite use).
 */

import { rateLimitedFetch, type ErrorCounter } from "./fetcher.js";
import type { ScrapeOptions } from "./types.js";

const GSI_ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

const cache = new Map<string, { lat: number; lng: number } | null>();

function cleanAddress(raw: string): string {
  let cleaned = raw.replace(/〒\s*\d{3}[-‐ー]?\d{4}\s*/, "");
  // Stop at common boundary characters (parenthesis, newline, comma, brackets)
  const parts = cleaned.split(/[（(\n\r,，、【\[]/);
  cleaned = parts[0] ?? cleaned;
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  if (cleaned.length > 60) cleaned = cleaned.slice(0, 60);
  return cleaned;
}

export async function geocodeAddress(
  rawAddress: string,
  baseOpts: ScrapeOptions,
  counter?: ErrorCounter,
): Promise<{ lat: number; lng: number } | null> {
  const cleaned = cleanAddress(rawAddress);
  if (cleaned.length < 5) return null;
  if (cache.has(cleaned)) return cache.get(cleaned) ?? null;

  const url = `${GSI_ENDPOINT}?q=${encodeURIComponent(cleaned)}`;
  // GSI is a stable public service. 500ms is well within polite use.
  const opts: ScrapeOptions = { ...baseOpts, rateLimitMs: 500 };
  const res = await rateLimitedFetch(url, opts, counter);
  if (!res.body || res.status !== 200) {
    cache.set(cleaned, null);
    return null;
  }

  try {
    const data = JSON.parse(res.body) as Array<{
      geometry?: { coordinates?: unknown };
    }>;
    if (Array.isArray(data) && data.length > 0) {
      const coords = data[0]?.geometry?.coordinates;
      if (Array.isArray(coords) && coords.length === 2) {
        const lng = parseFloat(String(coords[0]));
        const lat = parseFloat(String(coords[1]));
        if (
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          lat > 20 &&
          lat < 50 &&
          lng > 120 &&
          lng < 150
        ) {
          const result = { lat, lng };
          cache.set(cleaned, result);
          return result;
        }
      }
    }
  } catch {
    // malformed JSON — give up silently
  }
  cache.set(cleaned, null);
  return null;
}
