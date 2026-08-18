/**
 * OSM food-venue layer — server-side loading + filtering.
 *
 * Data: data/food/<slug>.json, produced by scrapers/sources/fetch_osm_food.ts
 * (named dining POIs from OpenStreetMap, ODbL). This is the standalone food
 * supply for get_spots category=food — the municipal scrape rarely
 * enumerates restaurants, which left food-focused consumers with zero
 * candidates in most cities.
 *
 * Honest nulls: price bands, last orders, reservation policy are NOT in OSM
 * and are surfaced as explicit nulls, never guessed.
 */

import { readFile } from "node:fs/promises";

import {
  parseOpeningHours,
  type StructuredOpeningHours,
} from "./opening_hours.js";

export interface FoodVenue {
  id: string;
  names: { default: string; ja: string | null; en: string | null };
  geo: { lat: number; lng: number; address: string | null };
  amenity: string;
  cuisine: string[];
  hours_raw: string | null;
  // Minute-granularity weekly windows parsed from hours_raw (the raw OSM
  // opening_hours string). Consumers need this to check a plan against
  // opening times — the raw OSM syntax is not something a planner can map to
  // an open_window on its own. Absent in the stored file; loadFoodLayer fills
  // it once (value, or null when hours_raw is absent / unparseable). A
  // `partial: true` flag marks expressions only partly representable.
  // Mirrors the attraction layer's opening_hours_structured.
  opening_hours_structured?: StructuredOpeningHours | null;
  official_url: string | null;
  wheelchair: string | null;
  takeaway: string | null;
  prefecture_code: string;
  area_id: string | null;
  source: "osm";
  last_verified: string;
}

interface FoodFile {
  prefecture?: { code: string; name_en: string };
  generated_at?: string;
  count?: number;
  entries?: FoodVenue[];
}

const cache = new Map<string, FoodVenue[]>();

/** Load one prefecture's food layer; missing/malformed file → empty. */
export async function loadFoodLayer(
  path: string,
  cacheKey: string,
): Promise<FoodVenue[]> {
  const hit = cache.get(cacheKey);
  if (hit) return hit;
  let entries: FoodVenue[] = [];
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as FoodFile;
    entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  } catch {
    entries = []; // absent layer is a coverage gap, not an error
  }
  // Structure the raw OSM opening_hours once, at load time, so every consumer
  // of this layer gets the same machine-usable windows without re-parsing.
  // Deterministic and offline — no data migration needed to light up the
  // hours the OSM layer already carries.
  for (const v of entries) {
    if (v.opening_hours_structured === undefined) {
      v.opening_hours_structured = v.hours_raw
        ? parseOpeningHours(v.hours_raw)
        : null;
    }
  }
  cache.set(cacheKey, entries);
  return entries;
}

/** Test seam / memory hygiene. */
export function clearFoodLayerCache(): void {
  cache.clear();
}

/**
 * Keyword + quality filtering for food venues.
 *
 * Ranking is completeness-first (venues with hours + official_url first —
 * they are actionable for planners), then keyword relevance on name/cuisine.
 * No popularity signal — search reorders, never selects (EDITORIAL_POLICY).
 */
export function filterFoodVenues(
  entries: FoodVenue[],
  opts: { q?: string; cuisine?: string; limit: number },
): FoodVenue[] {
  let out = entries;
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    out = out.filter((e) => {
      const hay = [
        e.names.default,
        e.names.ja ?? "",
        e.names.en ?? "",
        e.cuisine.join(" "),
        e.amenity,
        e.geo.address ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }
  if (opts.cuisine) {
    const c = opts.cuisine.trim().toLowerCase();
    out = out.filter(
      (e) =>
        e.cuisine.some((x) => x.toLowerCase().includes(c)) ||
        (c === "cafe" && e.amenity === "cafe"),
    );
  }
  const completeness = (e: FoodVenue): number =>
    (e.hours_raw ? 2 : 0) +
    (e.official_url ? 2 : 0) +
    (e.cuisine.length > 0 ? 1 : 0) +
    (e.geo.address ? 1 : 0);
  return [...out]
    .sort((a, b) => completeness(b) - completeness(a))
    .slice(0, opts.limit);
}
