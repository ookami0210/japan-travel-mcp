/**
 * Give every campground something a reader can use, from its coordinates.
 *
 * WHY: the lodging layer holds 2,163 campgrounds. 177 have an official page we
 * can read; the rest are a name and a point on the map, and 2,145 of them have
 * no address on record at all. That record answers nothing — not where it is,
 * not how to reach it, not what is around it — while the coordinate it does
 * have, placed against data this project already holds, answers all three.
 *
 * So this pass derives, per campground:
 *   - the municipality and the neighbourhood its coordinate falls in, from the
 *     national mapping agency's reverse geocoder (the one external call here,
 *     official, free, and cached because coordinates do not move);
 *   - the nearest railway station, from the 11,778 stations in the dataset;
 *   - the nearest national / quasi-national park point, with the park's own
 *     area so the reader can judge whether the campground is inside it;
 *   - what a visitor could see nearby, from the Wikidata attraction corpus;
 *   - the facility facts OSM happens to carry (fee, pitches, toilets, water,
 *     power, season), kept exactly as tagged.
 *
 * Nothing here comes from a booking directory, and nothing is invented: a
 * campground with no station within the cap simply has no station field.
 *
 * Run: npm run enrich:campground_places
 *      LIMIT=50 npm run enrich:campground_places          # sample
 *      SKIP_GEOCODE=1 npm run enrich:campground_places    # offline only
 * Output: data/campgrounds/place_context.jsonl
 *         data/_state/campground_geocode_cache.json  (coordinate → municipality)
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { classifyLodging } from "../../src/lib/lodging.js";
import {
  nearest,
  nearestFew,
  nearestPark,
  osmFacilityFacts,
  type LatLng,
  type NamedPlace,
  type NearbyPlace,
  type NearestPark,
  type OsmFacilityFacts,
} from "../lib/place_context.js";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const OSM_RAW_URL = new URL("data/hotels/raw/osm.json", ROOT);
const STATIONS_URL = new URL("data/_state/railway_stations.json", ROOT);
const PARKS_URL = new URL("data/_state/national_parks.json", ROOT);
const ATTRACTIONS_URL = new URL("data/_state/wikidata_attractions.json", ROOT);
const MUNICIPALITIES_URL = new URL("data/_state/municipalities.json", ROOT);
const CACHE_URL = new URL("data/_state/campground_geocode_cache.json", ROOT);
const OUT_URL = new URL("data/campgrounds/place_context.jsonl", ROOT);

/** 国土地理院 reverse geocoder: a coordinate to the 町丁目 it falls in. */
const GSI_ENDPOINT = "https://mreversegeocoder.gsi.go.jp/reverse-geocoder/LonLatToAddress";
const GSI_ATTRIBUTION = "国土地理院 (Geospatial Information Authority of Japan) reverse geocoder";
/** One request per 1.2 s. A public service of a national agency; be a guest. */
const GEOCODE_INTERVAL_MS = 1_200;

/**
 * Caps chosen so a field means something when it is there. The nearest railhead
 * to a mountain campground can be 45 km away, which is not an access hint; a
 * park whose recorded point is 50 km off tells a camper nothing about where
 * they are standing. Past these distances we say nothing rather than filling
 * the record with a number that reads like context and is not.
 */
const STATION_MAX_M = 30_000;
const PARK_MAX_M = 20_000;
const ATTRACTION_MAX_M = 15_000;
const ATTRACTION_COUNT = 5;

const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; campground place context)";

interface MasterHotel {
  id: string;
  name: string | null;
  name_en: string | null;
  type: string | null;
  website: string | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  prefecture_code: string | null;
  coordinates: LatLng | null;
  sources?: { source: string; id: string; url?: string }[];
}

interface PlaceContext {
  id: string;
  name: string | null;
  prefecture_code: string | null;
  coordinates: LatLng;
  municipality: {
    /** 5-digit JIS code from the reverse geocoder. */
    muni_code: string;
    /** The municipality's own name, resolved from that code. */
    name: string | null;
    prefecture_name: string | null;
    /** The 町丁目 the coordinate falls in, as the agency names it. */
    locality: string | null;
    source: string;
    source_url: string;
    retrieved_at: string;
  } | null;
  nearest_station: NearbyPlace | null;
  nearest_park: NearestPark | null;
  nearby_attractions: NearbyPlace[];
  osm_facts?: OsmFacilityFacts;
  derived_at: string;
}

async function loadJson<T>(url: URL): Promise<T | null> {
  try {
    return JSON.parse(await readFile(url, "utf8")) as T;
  } catch {
    return null;
  }
}

/** Key a coordinate at ~10 m so a cache survives trivial re-tagging. */
function coordKey(c: LatLng): string {
  return `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`;
}

interface GeocodeCache {
  schema_version: number;
  entries: Record<string, { muni_code: string; locality: string | null; retrieved_at: string }>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Ask the agency which municipality a coordinate falls in. An empty answer is
 * a real answer — offshore islets and deep mountain points have no 町丁目 —
 * and is recorded as such rather than retried forever.
 */
async function reverseGeocode(
  c: LatLng,
): Promise<{ muni_code: string; locality: string | null } | null> {
  const url = `${GSI_ENDPOINT}?lat=${c.lat}&lon=${c.lng}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { results?: { muniCd?: string; lv01Nm?: string } };
    const code = body.results?.muniCd;
    if (typeof code !== "string" || !code) return null;
    const locality = body.results?.lv01Nm;
    return { muni_code: code, locality: typeof locality === "string" && locality ? locality : null };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const skipGeocode = process.env.SKIP_GEOCODE === "1";

  const master = await loadJson<{ hotels: MasterHotel[] }>(MASTER_URL);
  if (!master) {
    console.error("[place_context] data/hotels/master.json is missing — nothing to enrich.");
    process.exitCode = 1;
    return;
  }
  const campgrounds = master.hotels.filter(
    (h) => classifyLodging(h) === "campground" && h.coordinates,
  );

  const stationsFile = await loadJson<{ stations?: NamedPlace[] }>(STATIONS_URL);
  const parksFile = await loadJson<{
    records?: (NamedPlace & { park_kind?: string | null; area_km2?: number | null })[];
  }>(PARKS_URL);
  const attractionsFile = await loadJson<{ attractions?: NamedPlace[] }>(ATTRACTIONS_URL);
  const stations = (stationsFile?.stations ?? []).filter((s) => s.coordinates);
  const parks = (parksFile?.records ?? []).filter((p) => p.coordinates);
  const attractions = (attractionsFile?.attractions ?? []).filter((a) => a.coordinates);
  console.error(
    `[place_context] inputs — ${campgrounds.length} campgrounds, ${stations.length} stations,` +
      ` ${parks.length} parks, ${attractions.length} attractions`,
  );

  // OSM keeps facility tags the merged master drops. Index them by OSM id so a
  // campground can pick up whatever its own source entities were tagged with.
  const osmRaw = await loadJson<{ hotels?: { osm_id?: string; raw_tags?: Record<string, unknown> }[] }>(
    OSM_RAW_URL,
  );
  const tagsByOsmId = new Map<string, Record<string, unknown>>();
  for (const row of osmRaw?.hotels ?? []) {
    if (row.osm_id && row.raw_tags) tagsByOsmId.set(row.osm_id, row.raw_tags);
  }
  console.error(`[place_context] OSM raw tag sets available: ${tagsByOsmId.size}`);

  const cache =
    (await loadJson<GeocodeCache>(CACHE_URL)) ?? { schema_version: 1, entries: {} };

  // The agency answers with a code; a reader wants the name. The municipality
  // register is keyed by the 6-digit JIS code whose first five digits are the
  // code the geocoder returns.
  const muniFile = await loadJson<{
    municipalities?: { code: string; name: string; prefecture_name: string }[];
  }>(MUNICIPALITIES_URL);
  const muniByCode = new Map<string, { name: string; prefecture_name: string }>();
  for (const m of muniFile?.municipalities ?? []) {
    if (m.code) muniByCode.set(m.code.slice(0, 5), { name: m.name, prefecture_name: m.prefecture_name });
  }
  console.error(`[place_context] municipality names available: ${muniByCode.size}`);

  const targets = campgrounds.slice(0, Number.isFinite(limit) ? limit : undefined);
  const out: PlaceContext[] = [];
  let geocoded = 0;
  let fromCache = 0;
  let noMunicipality = 0;

  for (const c of targets) {
    const coords = c.coordinates as LatLng;
    const key = coordKey(coords);

    let muni = cache.entries[key] ?? null;
    if (muni) {
      fromCache += 1;
    } else if (!skipGeocode) {
      const got = await reverseGeocode(coords);
      if (got) {
        muni = { ...got, retrieved_at: new Date().toISOString() };
        cache.entries[key] = muni;
        geocoded += 1;
      } else {
        noMunicipality += 1;
      }
      await sleep(GEOCODE_INTERVAL_MS);
    }

    // Union the tags of every OSM entity this record was merged from.
    const tags: Record<string, unknown> = {};
    for (const src of c.sources ?? []) {
      if (src.source !== "osm") continue;
      const t = tagsByOsmId.get(src.id);
      if (t) Object.assign(tags, t);
    }
    const facts = osmFacilityFacts(tags);

    out.push({
      id: c.id,
      name: c.name ?? c.name_en ?? null,
      prefecture_code: c.prefecture_code,
      coordinates: coords,
      municipality: muni
        ? {
            muni_code: muni.muni_code,
            name: muniByCode.get(muni.muni_code)?.name ?? null,
            prefecture_name: muniByCode.get(muni.muni_code)?.prefecture_name ?? null,
            locality: muni.locality,
            source: GSI_ATTRIBUTION,
            source_url: GSI_ENDPOINT,
            retrieved_at: muni.retrieved_at,
          }
        : null,
      nearest_station: nearest(coords, stations, STATION_MAX_M),
      nearest_park: nearestPark(coords, parks, PARK_MAX_M),
      nearby_attractions: nearestFew(coords, attractions, ATTRACTION_COUNT, ATTRACTION_MAX_M),
      ...(Object.keys(facts).length > 0 ? { osm_facts: facts } : {}),
      derived_at: new Date().toISOString(),
    });

    if (out.length % 200 === 0) {
      console.error(`[place_context] ${out.length}/${targets.length}`);
      await saveCache(cache);
    }
  }

  await saveCache(cache);
  await mkdir(fileURLToPath(new URL("data/campgrounds/", ROOT)), { recursive: true });
  const tmp = `${fileURLToPath(OUT_URL)}.tmp`;
  await writeFile(tmp, out.map((o) => JSON.stringify(o)).join("\n") + (out.length ? "\n" : ""), "utf8");
  await rename(tmp, fileURLToPath(OUT_URL));

  const withMuni = out.filter((o) => o.municipality).length;
  const withStation = out.filter((o) => o.nearest_station).length;
  const withPark = out.filter((o) => o.nearest_park).length;
  const withAttractions = out.filter((o) => o.nearby_attractions.length > 0).length;
  const withFacts = out.filter((o) => o.osm_facts).length;
  const withSomething = out.filter(
    (o) =>
      o.municipality ||
      o.nearest_station ||
      o.nearest_park ||
      o.nearby_attractions.length > 0 ||
      o.osm_facts,
  ).length;
  console.error(
    `[place_context] wrote ${out.length} records — municipality ${withMuni}` +
      ` (${geocoded} fetched, ${fromCache} cached, ${noMunicipality} without one),` +
      ` station ${withStation}, park ${withPark}, attractions ${withAttractions},` +
      ` osm facts ${withFacts}; at least one fact: ${withSomething}/${out.length}`,
  );
  console.error(`[place_context] ${fileURLToPath(OUT_URL)}`);
}

async function saveCache(cache: GeocodeCache): Promise<void> {
  const path = fileURLToPath(CACHE_URL);
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(cache, null, 1), "utf8");
  await rename(tmp, path);
}

main().catch((err) => {
  console.error("[place_context] fatal:", err);
  process.exitCode = 1;
});
