/**
 * Take a compiled list of campgrounds into the lodging layer.
 *
 * WHY THIS EXISTS. The campgrounds in this dataset come from OpenStreetMap,
 * which maps the public side of the sector well — town-run pitches, free
 * 野営場, national park sites — and barely touches the commercial side.
 * Measured against a compiled list of 101 commercial campgrounds, 86 were
 * absent from the layer altogether, and they are not obscure: 戸隠キャンプ場,
 * くるみの森キャンプ場, ペンギン村オートキャンプ場. The same measurement
 * explains why so few campgrounds had a readable official page — the segment
 * that keeps a website is the segment that was missing.
 *
 * WHAT THE LIST IS. Facts about a campground: its name, its address, its
 * phone number, and the operator's own URL. It is compiled and deduplicated
 * outside this repository and arrives here as one file. This pass does not
 * crawl anything to build it, and holds nothing about a campground beyond
 * those facts: the page a guest would read is fetched later from the
 * operator's own server by `scrape_campground_sites.ts`, under the ordinary
 * politeness rules.
 *
 * WHAT IT DOES. Three things the list cannot carry on its own:
 *   - a coordinate, from the national mapping agency's address search, because
 *     without one a campground we already hold cannot be recognised and would
 *     land beside it as a duplicate;
 *   - the record it already is, where it is one of ours, decided by
 *     `scrapers/lib/campground_identity.ts`;
 *   - the rows it merely resembles, which go to the review queue for a person
 *     rather than being merged.
 *
 * Run: npm run import:campground_list
 * Input:  data/_state/campground_list.json
 * Output: data/hotels/raw/campground_list.json  (a matcher input)
 *         data/_state/campground_list_geocode.json  (address → coordinate)
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildIdentityIndex,
  matchHeld,
  possibleDuplicates,
  type HeldRecord,
} from "../lib/campground_identity.js";

const ROOT = new URL("../../", import.meta.url);
const LIST_IN_URL = new URL("data/_state/campground_list.json", ROOT);
const OUT_URL = new URL("data/hotels/raw/campground_list.json", ROOT);
const GEOCODE_CACHE_URL = new URL("data/_state/campground_list_geocode.json", ROOT);
const OSM_RAW_URL = new URL("data/hotels/raw/osm.json", ROOT);
const WIKIDATA_RAW_URL = new URL("data/hotels/raw/wikidata.json", ROOT);
const CENTROIDS_URL = new URL("data/_state/municipality_centroids.json", ROOT);

/** 国土地理院 address search: an address to a point. */
const GSI_ADDRESS_SEARCH = "https://msearch.gsi.go.jp/address-search/AddressSearch";
const GSI_ATTRIBUTION = "国土地理院 (Geospatial Information Authority of Japan) address search";
const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; campground list geocoding)";
/** One request per 1.2 s to a national agency's public service. */
const GEOCODE_INTERVAL_MS = 1_200;

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県",
  "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県",
  "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;

/** One entry of the compiled list. Only `name` is required. */
export interface ListedCampground {
  /** Stable within the list, so a re-import updates rather than duplicates. */
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  /** The operator's own site. */
  website?: string | null;
  /** Given when the compiler already knows it; derived from the address otherwise. */
  coordinates?: { lat: number; lng: number } | null;
}

interface ImportedCampground extends ListedCampground {
  prefecture_code: string | null;
  coordinate_source: string | null;
  matches_held: { source_ref: string; how: string } | null;
  possible_duplicates?: { source_ref: string; name: string; how: string }[];
}

interface GeocodeCache {
  schema_version: number;
  entries: Record<string, { lat: number; lng: number; title: string } | null>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function loadJson<T>(url: URL): Promise<T | null> {
  try {
    return JSON.parse(await readFile(url, "utf8")) as T;
  } catch {
    return null;
  }
}

async function saveJson(url: URL, value: unknown): Promise<void> {
  const path = fileURLToPath(url);
  await mkdir(fileURLToPath(new URL("./", url)), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1), "utf8");
  await rename(tmp, path);
}

/** The prefecture an address names, as a 2-digit JIS code. */
export function prefectureOfAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const a = address.normalize("NFKC");
  const i = PREFECTURES.findIndex((p) => a.startsWith(p));
  return i >= 0 ? String(i + 1).padStart(2, "0") : null;
}

type Centroid = { code: string; lat: number; lng: number };

/** The prefecture of the nearest municipality centroid, as the matcher does it. */
export function prefectureOfPoint(
  point: { lat: number; lng: number },
  centroids: Centroid[],
): string | null {
  let best: Centroid | null = null;
  let bestD = Infinity;
  for (const c of centroids) {
    // Squared degrees, longitude scaled for latitude — ranking only, no distance.
    const d = (c.lat - point.lat) ** 2 + ((c.lng - point.lng) * 0.82) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? best.code.slice(0, 2) : null;
}

async function geocode(
  address: string,
  cache: GeocodeCache,
): Promise<{ lat: number; lng: number } | null> {
  if (address in cache.entries) {
    const hit = cache.entries[address];
    return hit ? { lat: hit.lat, lng: hit.lng } : null;
  }
  try {
    const res = await fetch(`${GSI_ADDRESS_SEARCH}?q=${encodeURIComponent(address)}`, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const body = (await res.json()) as {
      geometry?: { coordinates?: [number, number] };
      properties?: { title?: string };
    }[];
    const c = Array.isArray(body) ? body[0]?.geometry?.coordinates : undefined;
    if (!c || c.length < 2) {
      // A miss is cached: the same address will miss again.
      cache.entries[address] = null;
      return null;
    }
    // GeoJSON order is [lng, lat].
    const point = { lat: c[1], lng: c[0], title: body[0]?.properties?.title ?? "" };
    cache.entries[address] = point;
    return { lat: point.lat, lng: point.lng };
  } catch {
    // A transport failure is not cached, so the next run retries it.
    return null;
  } finally {
    await sleep(GEOCODE_INTERVAL_MS);
  }
}

/**
 * What we already hold, read from the raw sources rather than the master so
 * this pass never waits on a master rebuild. OpenStreetMap carries no
 * prefecture, so it is derived from the nearest centroid exactly as the
 * matcher does — without it the name comparison, which is only valid inside
 * one prefecture, could never fire for the source that is most of our data.
 */
async function loadHeld(): Promise<HeldRecord[]> {
  const out: HeldRecord[] = [];
  const centroidFile = await loadJson<{ centroids: Record<string, { lat: number; lng: number }> }>(
    CENTROIDS_URL,
  );
  const centroids: Centroid[] = Object.entries(centroidFile?.centroids ?? {}).map(
    ([code, c]) => ({ code, lat: c.lat, lng: c.lng }),
  );

  const osm = await loadJson<{
    hotels: {
      osm_id?: string;
      name?: string | null;
      name_en?: string | null;
      website?: string | null;
      coordinates?: { lat: number; lng: number } | null;
    }[];
  }>(OSM_RAW_URL);
  for (const h of osm?.hotels ?? []) {
    if (!h.osm_id) continue;
    out.push({
      source_ref: `osm:${h.osm_id}`,
      name: h.name ?? null,
      name_en: h.name_en ?? null,
      website: h.website ?? null,
      prefecture_code: h.coordinates ? prefectureOfPoint(h.coordinates, centroids) : null,
    });
  }

  const wd = await loadJson<{
    hotels: {
      qid?: string;
      name_ja?: string | null;
      name_en?: string | null;
      website?: string | null;
      prefecture_code?: string | null;
      coordinates?: { lat: number; lng: number } | null;
    }[];
  }>(WIKIDATA_RAW_URL);
  for (const h of wd?.hotels ?? []) {
    if (!h.qid) continue;
    out.push({
      source_ref: `wikidata:${h.qid}`,
      name: h.name_ja ?? null,
      name_en: h.name_en ?? null,
      website: h.website ?? null,
      prefecture_code:
        h.prefecture_code ??
        (h.coordinates ? prefectureOfPoint(h.coordinates, centroids) : null),
    });
  }
  return out;
}

async function main(): Promise<void> {
  const file = await loadJson<{ campgrounds: ListedCampground[] }>(LIST_IN_URL);
  if (!file?.campgrounds?.length) {
    console.error(
      `[list] ${fileURLToPath(LIST_IN_URL)} is missing or empty.\n` +
        "  This pass imports a compiled list; it does not build one.",
    );
    process.exitCode = 1;
    return;
  }

  const held = await loadHeld();
  const identity = buildIdentityIndex(held);
  const cache = (await loadJson<GeocodeCache>(GEOCODE_CACHE_URL)) ?? {
    schema_version: 1,
    entries: {},
  };
  console.error(
    `[list] ${file.campgrounds.length} campgrounds on the list,` +
      ` ${held.length} records already held`,
  );

  const out: ImportedCampground[] = [];
  let geocoded = 0;
  let matched = 0;
  let forReview = 0;
  let unplaceable = 0;
  for (const [i, entry] of file.campgrounds.entries()) {
    const prefecture_code = prefectureOfAddress(entry.address);
    let coordinates = entry.coordinates ?? null;
    if (!coordinates && entry.address) {
      coordinates = await geocode(entry.address, cache);
      if (coordinates) geocoded += 1;
    }
    const candidate = {
      name: entry.name,
      website: entry.website ?? null,
      prefecture_code,
    };
    const held_ = matchHeld(candidate, identity);
    const candidates = held_ ? [] : possibleDuplicates(candidate, held);
    if (held_) matched += 1;
    if (candidates.length > 0) forReview += 1;
    // An entry with neither a coordinate nor a prefecture cannot be placed:
    // the lodging tools filter on prefecture, so such a row would be invisible
    // to every caller while carrying nothing — the opposite of the point. It
    // stays on the list, which is the record that the campground exists, and
    // waits for an address.
    if (!coordinates && !prefecture_code) {
      unplaceable += 1;
      continue;
    }

    out.push({
      ...entry,
      coordinates,
      prefecture_code,
      coordinate_source: coordinates ? (entry.coordinates ? "supplied with the list" : GSI_ATTRIBUTION) : null,
      matches_held: held_ ? { source_ref: held_.source_ref, how: held_.how } : null,
      ...(candidates.length > 0 ? { possible_duplicates: candidates } : {}),
    });
    if ((i + 1) % 50 === 0) {
      console.error(`[list] ${i + 1}/${file.campgrounds.length}`);
      await saveJson(GEOCODE_CACHE_URL, cache);
    }
  }

  await saveJson(GEOCODE_CACHE_URL, cache);
  await saveJson(OUT_URL, {
    schema_version: 1,
    imported_at: new Date().toISOString(),
    note:
      "A compiled list of campgrounds: name, address, phone and the operator's own URL. " +
      "Nothing beyond those facts is held here; the page a guest would read is crawled " +
      `from the operator's own server. Coordinates not supplied with the list come from ${GSI_ATTRIBUTION}. ` +
      "List entries with no address and no coordinate are not imported: the lodging tools " +
      "filter on prefecture, so such a row would be invisible and empty. They stay on the " +
      "list as a record that the campground exists, waiting for an address.",
    campgrounds: out,
  });
  console.error(
    `[list] wrote ${out.length} of ${file.campgrounds.length} — geocoded ${geocoded},` +
      ` already held ${matched}, for review ${forReview}, new ${out.length - matched};` +
      ` ${unplaceable} left on the list with no address to place them by`,
  );
  console.error(`[list] ${fileURLToPath(OUT_URL)}`);
}

// Only run when this file is what was invoked: the helpers above are imported
// by tests, and importing a module must not start geocoding.
const invokedDirectly =
  !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[list] fatal:", err);
    process.exitCode = 1;
  });
}
