/**
 * Serving the derived place context for accommodations.
 *
 * Data: `campgrounds/place_context.jsonl`, written by
 * `scrapers/sources/enrich_campground_places.ts` — for each campground, the
 * municipality its coordinate falls in, the nearest station, the nearest park
 * point with that park's own area, what is worth seeing nearby, and whatever
 * facility tags OSM carries.
 *
 * WHY the server carries it: most campgrounds have no website and no address,
 * so without this a result is a name and a dot. This block is small, it is
 * derived from data already in the dataset plus one official geocoder, and it
 * is the difference between a record a traveller can act on and one they
 * cannot.
 *
 * Optional, like the other campground layers: a dataset without the file means
 * every accommodation reports no place context, never a failure.
 */

import { readFile } from "node:fs/promises";

export interface NearbyPlace {
  name_ja: string | null;
  name_en: string | null;
  qid: string | null;
  straight_line_m: number;
}

export interface PlaceContext {
  id: string;
  name: string | null;
  prefecture_code: string | null;
  coordinates: { lat: number; lng: number };
  municipality: {
    muni_code: string;
    name: string | null;
    prefecture_name: string | null;
    locality: string | null;
    source: string;
    source_url: string;
    retrieved_at: string;
  } | null;
  nearest_station: NearbyPlace | null;
  nearest_park:
    | (NearbyPlace & { park_kind: string | null; park_area_km2: number | null })
    | null;
  nearby_attractions: NearbyPlace[];
  osm_facts?: Record<string, string>;
  derived_at: string;
}

let cache: Map<string, PlaceContext> | null = null;
let cachedPath: string | null = null;

/** Parsed once per process; a malformed line is skipped, not fatal. */
export async function loadPlaceContext(path: string): Promise<Map<string, PlaceContext>> {
  if (cache && cachedPath === path) return cache;
  const index = new Map<string, PlaceContext>();
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as PlaceContext;
        if (typeof rec.id === "string" && rec.id) index.set(rec.id, rec);
      } catch {
        // skip the line, keep the layer
      }
    }
  } catch {
    // absent layer is a coverage gap, not an error
  }
  cache = index;
  cachedPath = path;
  return index;
}

/** Testing seam. */
export function resetPlaceContextCache(): void {
  cache = null;
  cachedPath = null;
}

/**
 * What goes on a result. The identity fields (id, name, coordinates,
 * prefecture) are dropped: the accommodation record already carries them, and
 * repeating them per row costs response space for nothing. Empty parts are
 * omitted rather than sent as nulls, so a reader can tell "we know nothing
 * here" from "we looked and there is nothing within range".
 */
export function placeBlock(rec: PlaceContext): Record<string, unknown> | null {
  const block: Record<string, unknown> = {};
  if (rec.municipality) {
    // The constant half of the provenance (who the geocoder is, and its URL)
    // lives once per response in PLACE_CONTEXT_NOTE rather than on every row;
    // what varies — the code, the names, the date it was read — stays here.
    block.municipality = {
      muni_code: rec.municipality.muni_code,
      name: rec.municipality.name,
      prefecture_name: rec.municipality.prefecture_name,
      locality: rec.municipality.locality,
      retrieved_at: rec.municipality.retrieved_at,
    };
  }
  if (rec.nearest_station) block.nearest_station = rec.nearest_station;
  if (rec.nearest_park) block.nearest_park = rec.nearest_park;
  if (rec.nearby_attractions?.length) block.nearby_attractions = rec.nearby_attractions;
  if (rec.osm_facts && Object.keys(rec.osm_facts).length > 0) block.osm_facts = rec.osm_facts;
  if (Object.keys(block).length === 0) return null;
  block.derived_at = rec.derived_at;
  return block;
}

/**
 * Said once per response instead of on every row. A page of fifty campgrounds
 * would otherwise carry the same three sentences fifty times, which costs the
 * consumer the very context it is meant to give them.
 */
export const PLACE_CONTEXT_NOTE = {
  what:
    "`place` on each campground is derived from its coordinates against this dataset's own station, " +
    "park and attraction layers, plus the national mapping agency's reverse geocoder. It exists because " +
    "most campgrounds have no website and no address on record.",
  municipality_source: "国土地理院 (Geospatial Information Authority of Japan) reverse geocoder",
  municipality_source_url:
    "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress",
  osm_facts_source:
    "Tags as contributors wrote them in OpenStreetMap (ODbL), not normalised and not interpreted.",
  distances:
    "Straight lines, not travel time. A park's distance is to its recorded point, not its boundary — " +
    "compare it against park_area_km2 before concluding the campground is inside.",
} as const;
