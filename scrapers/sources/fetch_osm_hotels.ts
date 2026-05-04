/**
 * Fetch accommodation entities from OpenStreetMap (Overpass API).
 *
 * Endpoint: https://overpass-api.de/api/interpreter
 *
 * Query: every node/way in Japan tagged tourism=hotel|hostel|guest_house|motel|apartment.
 *
 * Output: data/hotels/raw/osm.json
 *
 * Source-selection-principle compliance: OSM is open data under ODbL with
 * explicit per-element traceability (osm.org/node/<id>).
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

// Types we treat as accommodation. Skip "love_hotel" by leaving it off the list.
const TOURISM_TAGS = ["hotel", "hostel", "guest_house", "motel", "apartment"];

// Japan bounding box (covers main islands, Okinawa, Ogasawara). Includes
// some adjacent waters but the tag filter restricts to actual hotel POIs.
const JAPAN_BBOX = "20,120,46,154";

const QUERY = `
[out:json][timeout:180];
(
${TOURISM_TAGS.map((t) => `  node["tourism"="${t}"](${JAPAN_BBOX});
  way["tourism"="${t}"](${JAPAN_BBOX});`).join("\n")}
);
out tags center;
`;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

interface HotelRecord {
  osm_id: string;
  osm_url: string;
  type: string;
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  postal_code: string | null;
  full_address: string | null;
  city: string | null;
  street: string | null;
  phone: string | null;
  website: string | null;
  stars: string | null;
  raw_tags: Record<string, string>;
}

async function fetchOverpass(): Promise<OverpassResponse> {
  const res = await fetch(OVERPASS_ENDPOINT, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `data=${encodeURIComponent(QUERY)}`,
  });
  if (!res.ok) {
    throw new Error(`Overpass HTTP ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OverpassResponse;
}

function buildHotelRecord(el: OverpassElement): HotelRecord | null {
  const tags = el.tags ?? {};
  if (!tags.tourism) return null;

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const coord =
    typeof lat === "number" && typeof lon === "number" ? { lat, lng: lon } : null;

  return {
    osm_id: `${el.type}/${el.id}`,
    osm_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    type: tags.tourism,
    name: tags.name ?? null,
    name_en: tags["name:en"] ?? null,
    name_zh: tags["name:zh"] ?? tags["name:zh-Hans"] ?? tags["name:zh-Hant"] ?? null,
    name_ko: tags["name:ko"] ?? null,
    coordinates: coord,
    postal_code: tags["addr:postcode"] ?? null,
    full_address: tags["addr:full"] ?? null,
    city: tags["addr:city"] ?? null,
    street: tags["addr:street"] ?? null,
    phone: tags["contact:phone"] ?? tags.phone ?? null,
    website: tags["contact:website"] ?? tags.website ?? null,
    stars: tags.stars ?? null,
    raw_tags: tags,
  };
}

async function main(): Promise<void> {
  console.error(`[osm_hotels] querying Overpass (this may take 30-60s)...`);
  let response: OverpassResponse;
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      response = await fetchOverpass();
      break;
    } catch (err) {
      console.error(
        `  attempt ${attempt} failed: ${(err as Error).message}`,
      );
      if (attempt >= 3) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }

  console.error(
    `[osm_hotels] received ${response.elements.length} elements`,
  );

  const hotels: HotelRecord[] = [];
  for (const el of response.elements) {
    const rec = buildHotelRecord(el);
    if (rec) hotels.push(rec);
  }

  // Stats
  const stats = {
    total: hotels.length,
    with_coord: hotels.filter((h) => h.coordinates).length,
    with_name: hotels.filter((h) => h.name).length,
    with_name_en: hotels.filter((h) => h.name_en).length,
    with_name_zh: hotels.filter((h) => h.name_zh).length,
    with_name_ko: hotels.filter((h) => h.name_ko).length,
    with_website: hotels.filter((h) => h.website).length,
    with_phone: hotels.filter((h) => h.phone).length,
  };
  const byType: Record<string, number> = {};
  for (const h of hotels) {
    byType[h.type] = (byType[h.type] ?? 0) + 1;
  }
  console.error(`[osm_hotels] TOTAL: ${stats.total}`);
  console.error(
    `  coord ${stats.with_coord} / name ${stats.with_name} / EN ${stats.with_name_en} / ZH ${stats.with_name_zh} / KO ${stats.with_name_ko}`,
  );
  console.error(`  website ${stats.with_website} / phone ${stats.with_phone}`);
  console.error(`  by_type:`, byType);

  const out = {
    source: {
      endpoint: OVERPASS_ENDPOINT,
      query: QUERY.trim(),
      license: "ODbL 1.0",
    },
    fetched_at: new Date().toISOString(),
    stats,
    by_type: byType,
    hotels,
  };

  const outPath = fileURLToPath(
    new URL("../../data/hotels/raw/osm.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[osm_hotels] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[osm_hotels] FAILED:", err);
  process.exit(1);
});
