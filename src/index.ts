#!/usr/bin/env node
/**
 * Japan Travel MCP Server (stdio transport).
 *
 * Tools:
 *   - search_area:      search by name/keyword across prefectures, municipalities, attractions
 *   - get_spots:        tourist spots by area (combines municipal scrape + Wikidata)
 *   - get_hotels:       accommodations (Wikidata + OpenStreetMap merged)
 *   - get_transport:    spot location + official URL where access is documented
 *   - get_events:       festivals from Wikidata SPARQL (live, in-memory cache)
 *   - get_multilingual: lightweight name lookup in EN/ZH/KO
 *   - get_description:  signature tool — 17-language tourism descriptions
 *
 * Data sources:
 *   data/prefectures/<slug>.json   — per-prefecture JSON, two parallel layers:
 *     municipalities[].spots[]      from official-site scraping
 *     wikidata_attractions[]        from Wikidata SPARQL (multilingual + coords)
 *   data/hotels/master.json        — merged hotel master list
 *   data/translations/             — 17-language names + descriptions
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveDataRoot } from "./lib/hf_data.js";

const DISCLAIMER =
  "Data sourced from public websites (municipal tourism pages) and Wikidata (CC0). Verify directly with the property before making decisions.";

// ──────────────────────────────────────────────────────────────────────
// Data loading

interface ScrapedSpot {
  id: string;
  url: string;
  name: string;
  description: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  language: string;
  source_url: string;
  last_scraped_at: string;
}

interface MunicipalityBlock {
  municipality: {
    code: string;
    name: string;
    prefecture_code: string;
    prefecture_name: string;
  };
  spots: ScrapedSpot[];
}

interface WikidataAttraction {
  qid: string;
  wikidata_url: string;
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  description_en: string | null;
  coordinates: { lat: number; lng: number } | null;
  prefecture_code: string;
  admin_code: string | null;
  admin_name: string | null;
}

interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  data_as_of: string;
  source: string;
  municipalities: MunicipalityBlock[];
  wikidata_attractions?: WikidataAttraction[];
}

interface HotelRecord {
  id: string;
  confidence: "confirmed" | "singleton";
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  website: string | null;
  type: string | null;
  postal_code: string | null;
  street: string | null;
  prefecture_code: string | null;
  sources: { source: "wikidata" | "osm"; id: string; url: string }[];
}

interface HotelsFile {
  generated_at: string;
  hotels: HotelRecord[];
}

// Resolved at startup by initDataRoot(). Either points at a populated data/
// in a development checkout, or at the HF cache (~/.japan-travel-mcp/data/).
let DATA_ROOT: string | null = null;

function findPackageRoot(): string {
  // Walk up from this file until we find package.json — works whether running
  // from src/ (dev) or dist/ (built).
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("package root (package.json parent) not found");
}

async function initDataRoot(): Promise<void> {
  DATA_ROOT = await resolveDataRoot(findPackageRoot());
}

function dataRoot(): string {
  if (!DATA_ROOT) {
    throw new Error("data root not initialized — call initDataRoot() first");
  }
  return DATA_ROOT;
}

function findDataDir(): string {
  return resolve(dataRoot(), "prefectures");
}

function findHotelsMasterPath(): string {
  return resolve(dataRoot(), "hotels/master.json");
}

function findDescriptionsPath(): string {
  return resolve(dataRoot(), "translations/descriptions_complete.jsonl");
}

function findMultilingualNamesPath(): string {
  return resolve(dataRoot(), "translations/multilingual_complete.jsonl");
}

const SUPPORTED_LANGUAGES = [
  "en",
  "ja",
  "zh",
  "ko",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "ru",
  "th",
  "vi",
  "id",
  "ms",
  "ar",
  "hi",
  "tl",
] as const;
type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

interface DescriptionRecord {
  qid: string;
  descriptions: Partial<Record<SupportedLang, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
  generated_at?: string;
}

interface MultilingualNameRecord {
  qid: string;
  translations: Partial<Record<SupportedLang | "ja", string | null>>;
  sources?: Partial<Record<SupportedLang | "ja", string>>;
}

// ──────────────────────────────────────────────────────────────────────
// R-3 (specialty / traditional arts / japan heritage) — official-source records.
// All written by scrapers/sources/fetch_*.ts, refreshed on a 30-day cadence.

interface MaffGiRecord {
  source: "maff_gi";
  authority: string;
  registration_number: number;
  name_ja: string;
  registration_date: string | null;
  production_area_text: string | null;
  prefecture_codes: string[];
  producer_group: string | null;
  characteristics_ja: string | null;
  detail_url: string;
  fetched_at: string;
}

interface MetiDensanRecord {
  source: "meti_densan";
  authority: string;
  craft_id: string;
  industry_category: string;
  industry_slug: string;
  name_ja: string;
  designation_date: string | null;
  production_area_text: string | null;
  prefecture_codes: string[];
  features_ja: string | null;
  detail_url: string;
  fetched_at: string;
}

interface JapanHeritageRecord {
  source: "japan_heritage";
  authority: string;
  story_id: string;
  title_ja: string;
  subtitle_ja: string | null;
  themes: string[];
  periods: string[];
  related_areas_text: string | null;
  prefecture_codes: string[];
  summary_ja: string | null;
  body_ja: string | null;
  story_url: string;
  info_url: string;
  fetched_at: string;
}

interface BunkaIntangibleRecord {
  source: "bunka_intangible";
  authority: string;
  qid: string;
  wikidata_url: string;
  designation: string;
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inception: string | null;
  bunca_id: string | null;
  fetched_at: string;
}

interface UnescoJapanRecord {
  source: "unesco_japan";
  authority: string;
  qid: string;
  wikidata_url: string;
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inscription_year: number | null;
  unesco_id: string | null;
  fetched_at: string;
}

interface R3SourceFile<T> {
  source: { name: string; authority: string; url?: string; license: string };
  fetched_at: string;
  total: number;
  records: T[];
}

/**
 * R-3 translation record. Keys are formatted "<source>:<record-id>", e.g.:
 *   maff_gi:1, meti_densan:0101, japan_heritage:001,
 *   bunka_intangible:Q1037119, unesco_japan:Q243170
 *
 * `name` and `description` are translated separately so callers can pick
 * either form. `confidence` reflects how grounded the translation is.
 */
interface R3TranslationRecord {
  key: string;
  name?: Partial<Record<SupportedLang, string>>;
  description?: Partial<Record<SupportedLang, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
  generated_at?: string;
}

let cachedData: PrefectureFile[] | null = null;
let cachedHotels: HotelsFile | null = null;
let cachedDescriptions: Map<string, DescriptionRecord> | null = null;
let cachedNames: Map<string, MultilingualNameRecord> | null = null;
let cachedMaffGi: R3SourceFile<MaffGiRecord> | null = null;
let cachedMetiDensan: R3SourceFile<MetiDensanRecord> | null = null;
let cachedJapanHeritage: R3SourceFile<JapanHeritageRecord> | null = null;
let cachedBunkaIntangible: R3SourceFile<BunkaIntangibleRecord> | null = null;
let cachedUnescoJapan: R3SourceFile<UnescoJapanRecord> | null = null;
let cachedR3Translations: Map<string, R3TranslationRecord> | null = null;

async function loadAllPrefectures(): Promise<PrefectureFile[]> {
  if (cachedData) return cachedData;
  const dir = findDataDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: PrefectureFile[] = [];
  for (const f of files) {
    try {
      const content = await readFile(resolve(dir, f), "utf8");
      out.push(JSON.parse(content) as PrefectureFile);
    } catch {
      // skip malformed
    }
  }
  cachedData = out;
  return out;
}

async function loadHotels(): Promise<HotelsFile | null> {
  if (cachedHotels) return cachedHotels;
  try {
    const path = findHotelsMasterPath();
    const content = await readFile(path, "utf8");
    cachedHotels = JSON.parse(content) as HotelsFile;
    return cachedHotels;
  } catch {
    return null;
  }
}

async function loadDescriptions(): Promise<Map<string, DescriptionRecord>> {
  if (cachedDescriptions) return cachedDescriptions;
  const map = new Map<string, DescriptionRecord>();
  try {
    const content = await readFile(findDescriptionsPath(), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as DescriptionRecord;
        if (rec.qid) map.set(rec.qid, rec);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file missing → return empty map (tool degrades gracefully)
  }
  cachedDescriptions = map;
  return map;
}

async function loadNames(): Promise<Map<string, MultilingualNameRecord>> {
  if (cachedNames) return cachedNames;
  const map = new Map<string, MultilingualNameRecord>();
  try {
    const content = await readFile(findMultilingualNamesPath(), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as MultilingualNameRecord;
        if (rec.qid) map.set(rec.qid, rec);
      } catch {
        // skip malformed
      }
    }
  } catch {
    // file missing → return empty map
  }
  cachedNames = map;
  return map;
}

function dataAsOf(prefs: PrefectureFile[]): string | null {
  if (prefs.length === 0) return null;
  return prefs.map((p) => p.data_as_of).sort().pop() ?? null;
}

// ──────────────────────────────────────────────────────────────────────
// Tool: search_area

async function searchArea(args: {
  q: string;
  lang?: string;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const q = args.q.trim().toLowerCase();
  if (q.length === 0) {
    return { error: "empty_query", disclaimer: DISCLAIMER };
  }
  const matches: Array<Record<string, unknown>> = [];

  const matchesText = (s: string | null | undefined): boolean =>
    !!s && s.toLowerCase().includes(q);

  for (const p of prefs) {
    if (
      matchesText(p.prefecture.name) ||
      matchesText(p.prefecture.name_en)
    ) {
      matches.push({
        type: "prefecture",
        code: p.prefecture.code,
        name: p.prefecture.name,
        name_en: p.prefecture.name_en ?? null,
      });
    }
    for (const m of p.municipalities) {
      if (matchesText(m.municipality.name)) {
        matches.push({
          type: "municipality",
          code: m.municipality.code,
          name: m.municipality.name,
          prefecture: p.prefecture.name,
        });
      }
    }
    for (const a of p.wikidata_attractions ?? []) {
      if (
        matchesText(a.name_ja) ||
        matchesText(a.name_en) ||
        matchesText(a.name_zh) ||
        matchesText(a.name_ko)
      ) {
        matches.push({
          type: "attraction",
          source: "wikidata",
          qid: a.qid,
          name_ja: a.name_ja,
          name_en: a.name_en,
          coordinates: a.coordinates,
          prefecture_code: a.prefecture_code,
        });
      }
    }
  }

  return {
    query: args.q,
    match_count: matches.length,
    results: matches.slice(0, 50),
    truncated: matches.length > 50,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_spots

async function getSpots(args: {
  prefecture?: string;
  city?: string;
  limit?: number;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  const spots: Array<Record<string, unknown>> = [];

  const matchesPrefecture = (p: PrefectureFile): boolean => {
    if (!args.prefecture) return true;
    const q = args.prefecture.toLowerCase();
    return (
      p.prefecture.name.toLowerCase() === q ||
      p.prefecture.name_en?.toLowerCase() === q ||
      p.prefecture.code === args.prefecture
    );
  };

  for (const p of prefs) {
    if (!matchesPrefecture(p)) continue;
    for (const m of p.municipalities) {
      if (args.city && m.municipality.name !== args.city) continue;
      for (const s of m.spots) {
        spots.push({
          source: "municipal_scrape",
          id: s.id,
          name: s.name,
          description: s.description,
          coordinates: s.coordinates,
          address: s.address,
          url: s.url,
          municipality: m.municipality.name,
          municipality_code: m.municipality.code,
          prefecture: p.prefecture.name,
          language: s.language,
        });
        if (spots.length >= limit) break;
      }
      if (spots.length >= limit) break;
    }
    if (spots.length >= limit) break;
    if (!args.city) {
      for (const a of p.wikidata_attractions ?? []) {
        spots.push({
          source: "wikidata",
          id: a.qid,
          name: a.name_ja || a.name_en,
          name_en: a.name_en,
          name_zh: a.name_zh,
          name_ko: a.name_ko,
          description_en: a.description_en,
          coordinates: a.coordinates,
          url: a.wikidata_url,
          municipality: a.admin_name,
          municipality_code: a.admin_code,
          prefecture: p.prefecture.name,
        });
        if (spots.length >= limit) break;
      }
      if (spots.length >= limit) break;
    }
  }

  return {
    spots,
    count: spots.length,
    truncated: spots.length === limit,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_hotels (pending)

const EARTH_R = 6_371_000;
function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

async function getHotels(args: {
  city?: string;
  prefecture?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
}): Promise<unknown> {
  const file = await loadHotels();
  if (!file) {
    return {
      status: "pending_data",
      message:
        "Hotel master file not yet generated. Run `npx tsx scrapers/matcher/match_hotels.ts` after the source fetchers (fetch_wikidata_hotels.ts, fetch_osm_hotels.ts) have populated data/hotels/raw/.",
      hotels: [],
      disclaimer: DISCLAIMER,
    };
  }

  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  let hotels = file.hotels;

  // Resolve prefecture name/slug/code → 2-digit code
  let prefCode: string | null = null;
  if (args.prefecture) {
    const q = args.prefecture.trim().toLowerCase();
    if (/^\d{1,2}$/.test(q)) {
      prefCode = q.padStart(2, "0");
    } else {
      const prefs = await loadAllPrefectures();
      const match = prefs.find(
        (p) =>
          p.prefecture.name.toLowerCase() === q ||
          p.prefecture.name_en?.toLowerCase() === q,
      );
      if (match) prefCode = match.prefecture.code;
    }
    if (!prefCode) {
      return {
        hotels: [],
        count: 0,
        error: `unknown prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '沖縄県'), slug (e.g. 'okinawa'), or 2-digit code (e.g. '47').",
        disclaimer: DISCLAIMER,
      };
    }
    hotels = hotels.filter((h) => h.prefecture_code === prefCode);
  }

  // Filter by city (substring match in name)
  if (args.city) {
    const q = args.city.toLowerCase();
    hotels = hotels.filter(
      (h) =>
        (h.name && h.name.includes(args.city!)) ||
        (h.street && h.street.includes(args.city!)) ||
        (h.name_en && h.name_en.toLowerCase().includes(q)),
    );
  }

  // Coordinates-based filter
  if (
    typeof args.lat === "number" &&
    typeof args.lng === "number" &&
    typeof args.radius === "number"
  ) {
    const center = { lat: args.lat, lng: args.lng };
    const r = args.radius;
    hotels = hotels.filter(
      (h) => h.coordinates && haversine(h.coordinates, center) <= r,
    );
    // Sort by distance
    hotels.sort((a, b) => {
      const da = a.coordinates ? haversine(a.coordinates, center) : Infinity;
      const db = b.coordinates ? haversine(b.coordinates, center) : Infinity;
      return da - db;
    });
  }

  const out = hotels.slice(0, limit).map((h) => ({
    id: h.id,
    confidence: h.confidence,
    name: h.name,
    name_en: h.name_en,
    name_zh: h.name_zh,
    name_ko: h.name_ko,
    type: h.type,
    coordinates: h.coordinates,
    phone: h.phone,
    website: h.website,
    postal_code: h.postal_code,
    street: h.street,
    prefecture_code: h.prefecture_code,
    sources: h.sources,
  }));

  return {
    hotels: out,
    count: out.length,
    truncated: hotels.length > limit,
    total_matching: hotels.length,
    note: "Information only — does NOT include availability or pricing. For bookings, visit the hotel's official website.",
    data_as_of: file.generated_at,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_transport
//
// Minimal-but-useful implementation: looks up the spot, returns its
// coordinates + the official URL where the property documents access info.
// Full station-database integration (P197 adjacent_station, OSM railway
// stations) is a future enhancement.

interface SpotLocation {
  spot_id: string;
  source: "wikidata" | "municipal_scrape";
  name: string | null;
  coordinates: { lat: number; lng: number } | null;
  prefecture: string | null;
  prefecture_code: string | null;
  municipality: string | null;
  source_url: string | null;
}

async function findSpot(spotId: string): Promise<SpotLocation | null> {
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      if (a.qid === spotId) {
        return {
          spot_id: a.qid,
          source: "wikidata",
          name: a.name_ja || a.name_en,
          coordinates: a.coordinates,
          prefecture: p.prefecture.name,
          prefecture_code: p.prefecture.code,
          municipality: a.admin_name,
          source_url: a.wikidata_url,
        };
      }
    }
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        if (s.id === spotId) {
          return {
            spot_id: s.id,
            source: "municipal_scrape",
            name: s.name,
            coordinates: s.coordinates,
            prefecture: p.prefecture.name,
            prefecture_code: p.prefecture.code,
            municipality: m.municipality.name,
            source_url: s.url,
          };
        }
      }
    }
  }
  return null;
}

async function getTransport(args: { spot_id: string }): Promise<unknown> {
  if (!args.spot_id) {
    return { error: "spot_id required", disclaimer: DISCLAIMER };
  }
  const spot = await findSpot(args.spot_id);
  if (!spot) {
    return {
      error: "spot_not_found",
      spot_id: args.spot_id,
      hint: "Use search_area or get_spots to obtain a valid spot_id.",
      disclaimer: DISCLAIMER,
    };
  }

  // Find the closest hotel cluster as a proxy for "nearby developed area"
  // (hotels concentrate near stations / town centres in Japan).
  let nearestHotel: { name: string | null; distance_m: number } | null = null;
  if (spot.coordinates) {
    const file = await loadHotels();
    if (file) {
      let best: { hotel: HotelRecord; d: number } | null = null;
      for (const h of file.hotels) {
        if (!h.coordinates) continue;
        if (h.prefecture_code && h.prefecture_code !== spot.prefecture_code) continue;
        const d = haversine(spot.coordinates, h.coordinates);
        if (!best || d < best.d) best = { hotel: h, d };
      }
      if (best) {
        nearestHotel = {
          name: best.hotel.name_en || best.hotel.name,
          distance_m: Math.round(best.d),
        };
      }
    }
  }

  return {
    spot_id: spot.spot_id,
    name: spot.name,
    coordinates: spot.coordinates,
    prefecture: spot.prefecture,
    municipality: spot.municipality,
    access: {
      official_source_url: spot.source_url,
      note: "Detailed transit (nearest station, walk time, bus routes) is documented on the linked source. This MCP returns coordinates and source URL only; future versions will add station data from OpenStreetMap.",
      nearest_developed_area_proxy: nearestHotel,
    },
    data_source: spot.source,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_events
//
// Fetches festivals (祭) for a given prefecture from Wikidata SPARQL at
// request time. Results are cached in-memory per prefecture-code.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const SPARQL_USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const FESTIVAL_TYPES = [
  "Q132241", // festival
  "Q1445650", // matsuri
  "Q175331", // religious festival
];

const cachedFestivals = new Map<string, unknown[]>();

interface FestivalSparqlBinding {
  item?: { value: string };
  itemLabel_ja?: { value: string };
  itemLabel_en?: { value: string };
  pointInTime?: { value: string };
  startTime?: { value: string };
  coord?: { value: string };
  adminLabel?: { value: string };
}

function parseWktPoint(
  v: string,
): { lat: number; lng: number } | null {
  const m = v.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

async function fetchFestivals(prefCode: string): Promise<unknown[]> {
  if (cachedFestivals.has(prefCode)) {
    return cachedFestivals.get(prefCode)!;
  }
  const typesValues = FESTIVAL_TYPES.map((q) => `wd:${q}`).join(" ");
  const query = `
SELECT DISTINCT ?item ?itemLabel_ja ?itemLabel_en ?pointInTime ?startTime ?coord ?adminLabel WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(STR(?adminCode), "${prefCode}"))
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type { ${typesValues} }
  ?item wdt:P276 ?adminEntity .
  OPTIONAL { ?item wdt:P585 ?pointInTime . }
  OPTIONAL { ?item wdt:P580 ?startTime . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item rdfs:label ?itemLabel_ja . FILTER(LANG(?itemLabel_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT 200
`.trim();

  try {
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": SPARQL_USER_AGENT,
        Accept: "application/sparql-results+json",
      },
    });
    if (!res.ok) {
      cachedFestivals.set(prefCode, []);
      return [];
    }
    const json = (await res.json()) as {
      results: { bindings: FestivalSparqlBinding[] };
    };
    const out = json.results.bindings.map((b) => ({
      qid: b.item?.value.split("/").pop(),
      name_ja: b.itemLabel_ja?.value ?? null,
      name_en: b.itemLabel_en?.value ?? null,
      coordinates: b.coord ? parseWktPoint(b.coord.value) : null,
      municipality: b.adminLabel?.value ?? null,
      point_in_time: b.pointInTime?.value ?? null,
      start_time: b.startTime?.value ?? null,
      wikidata_url: b.item?.value,
    }));
    cachedFestivals.set(prefCode, out);
    return out;
  } catch {
    cachedFestivals.set(prefCode, []);
    return [];
  }
}

async function resolvePrefectureCode(input: string): Promise<string | null> {
  const q = input.trim().toLowerCase();
  if (/^\d{1,2}$/.test(q)) return q.padStart(2, "0");
  const prefs = await loadAllPrefectures();
  const match = prefs.find(
    (p) =>
      p.prefecture.name.toLowerCase() === q ||
      p.prefecture.name_en?.toLowerCase() === q,
  );
  return match?.prefecture.code ?? null;
}

async function getEvents(args: {
  prefecture?: string;
  month?: number;
}): Promise<unknown> {
  if (!args.prefecture) {
    return {
      error: "prefecture required",
      hint: "Provide prefecture as Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
      disclaimer: DISCLAIMER,
    };
  }
  const prefCode = await resolvePrefectureCode(args.prefecture);
  if (!prefCode) {
    return {
      error: `unknown_prefecture: ${args.prefecture}`,
      hint: "Use Japanese name (e.g. '京都府'), English slug (e.g. 'kyoto'), or 2-digit JIS code (e.g. '26').",
      disclaimer: DISCLAIMER,
    };
  }

  const festivals = (await fetchFestivals(prefCode)) as Array<{
    qid?: string;
    name_ja: string | null;
    name_en: string | null;
    coordinates: { lat: number; lng: number } | null;
    municipality: string | null;
    point_in_time: string | null;
    start_time: string | null;
    wikidata_url?: string;
  }>;

  let filtered = festivals;
  if (typeof args.month === "number" && args.month >= 1 && args.month <= 12) {
    filtered = festivals.filter((f) => {
      const dt = f.point_in_time ?? f.start_time;
      if (!dt) return false;
      const m = dt.match(/-(\d{2})-/);
      if (!m) return false;
      return parseInt(m[1], 10) === args.month;
    });
  }

  return {
    prefecture_code: prefCode,
    month_filter: args.month ?? null,
    count: filtered.length,
    events: filtered,
    source: "Wikidata SPARQL (live query, cached in-memory per prefecture)",
    note: "Festivals registered in Wikidata. Coverage is uneven — small local festivals may be missing. For comprehensive listings consult prefectural tourism associations directly.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_description
//
// Returns the AI-generated 17-language tourism description for a given
// Wikidata QID. Sourced from data/translations/descriptions_complete.jsonl
// (generated 2026-04-26 via Claude Sonnet 4.6 batch).

async function getDescription(args: {
  qid: string;
  lang?: string;
}): Promise<unknown> {
  if (!args.qid) {
    return { error: "qid required", disclaimer: DISCLAIMER };
  }
  const map = await loadDescriptions();
  const rec = map.get(args.qid);
  if (!rec) {
    return {
      error: "not_found",
      qid: args.qid,
      hint: "Description coverage is limited to entities with a Japanese-language Wikipedia anchor (~13,400 spots). Use get_multilingual for sparse coverage with names only.",
      disclaimer: DISCLAIMER,
    };
  }

  // Also fetch the canonical names (Phase 4 names output)
  const nameRec = (await loadNames()).get(args.qid);
  const names: Partial<Record<string, string | null>> = nameRec?.translations ?? {};

  // If lang specified and supported, return only that language (still include name in same lang for context)
  if (args.lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(args.lang)) {
    const lang = args.lang as SupportedLang;
    return {
      qid: args.qid,
      lang,
      name: names[lang] ?? null,
      description: rec.descriptions[lang] ?? null,
      confidence: rec.confidence,
      generated_at: rec.generated_at ?? null,
      source: "ai_generated",
      model: "claude-sonnet-4-6",
      disclaimer: DISCLAIMER,
    };
  }

  // Otherwise return all 17 languages
  return {
    qid: args.qid,
    languages_returned: Object.keys(rec.descriptions),
    names,
    descriptions: rec.descriptions,
    confidence: rec.confidence,
    generated_at: rec.generated_at ?? null,
    source: "ai_generated",
    model: "claude-sonnet-4-6",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// R-3 data loaders (specialty / traditional arts / japan heritage)

function findR3Path(file: string): string {
  return resolve(dataRoot(), `r3/${file}`);
}

async function loadR3Json<T>(file: string): Promise<R3SourceFile<T> | null> {
  try {
    const content = await readFile(findR3Path(file), "utf8");
    return JSON.parse(content) as R3SourceFile<T>;
  } catch {
    return null;
  }
}

async function loadMaffGi(): Promise<R3SourceFile<MaffGiRecord> | null> {
  if (cachedMaffGi) return cachedMaffGi;
  cachedMaffGi = await loadR3Json<MaffGiRecord>("maff_gi.json");
  return cachedMaffGi;
}

async function loadMetiDensan(): Promise<R3SourceFile<MetiDensanRecord> | null> {
  if (cachedMetiDensan) return cachedMetiDensan;
  cachedMetiDensan = await loadR3Json<MetiDensanRecord>("meti_densan.json");
  return cachedMetiDensan;
}

async function loadJapanHeritage(): Promise<
  R3SourceFile<JapanHeritageRecord> | null
> {
  if (cachedJapanHeritage) return cachedJapanHeritage;
  cachedJapanHeritage =
    await loadR3Json<JapanHeritageRecord>("japan_heritage.json");
  return cachedJapanHeritage;
}

async function loadBunkaIntangible(): Promise<
  R3SourceFile<BunkaIntangibleRecord> | null
> {
  if (cachedBunkaIntangible) return cachedBunkaIntangible;
  cachedBunkaIntangible =
    await loadR3Json<BunkaIntangibleRecord>("bunka_intangible.json");
  return cachedBunkaIntangible;
}

async function loadUnescoJapan(): Promise<
  R3SourceFile<UnescoJapanRecord> | null
> {
  if (cachedUnescoJapan) return cachedUnescoJapan;
  cachedUnescoJapan = await loadR3Json<UnescoJapanRecord>("unesco_japan.json");
  return cachedUnescoJapan;
}

async function loadR3Translations(): Promise<Map<string, R3TranslationRecord>> {
  if (cachedR3Translations) return cachedR3Translations;
  const map = new Map<string, R3TranslationRecord>();
  try {
    const content = await readFile(
      findR3Path("translations/r3_translations.jsonl"),
      "utf8",
    );
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as R3TranslationRecord;
        if (rec.key) map.set(rec.key, rec);
      } catch {
        // skip malformed
      }
    }
  } catch {
    // file missing → empty map; tools degrade gracefully to ja-only output
  }
  cachedR3Translations = map;
  return map;
}

/** Return the best-available name in `lang` for an R-3 record. */
function pickR3Name(
  fallback: string | null,
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.name?.[lang as SupportedLang]) {
    return rec.name[lang as SupportedLang]!;
  }
  return fallback;
}

/** Return the best-available description in `lang` for an R-3 record. */
function pickR3Description(
  fallbackJa: string | null,
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.description?.[lang as SupportedLang]) {
    return rec.description[lang as SupportedLang]!;
  }
  if (!lang || lang === "ja") return fallbackJa;
  return fallbackJa; // fallback to ja when target lang missing
}

function r3Translation(
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): {
  source: "official_translated" | "official_only";
  generated_at: string | null;
  confidence: "high" | "medium" | "low" | null;
} {
  if (lang && rec?.description?.[lang as SupportedLang]) {
    return {
      source: "official_translated",
      generated_at: rec.generated_at ?? null,
      confidence: rec.confidence ?? null,
    };
  }
  return { source: "official_only", generated_at: null, confidence: null };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_local_specialty
//
// Returns regional specialties (food + crafts) for a Japanese prefecture,
// drawn ONLY from official designation systems:
//   - 農林水産省 GI (geographical indication of agricultural products)
//   - 経済産業省 伝統的工芸品 (METI-designated traditional crafts)
// No editorial or AI-curated picks. Items the official authorities have not
// designated will not appear here.

async function getLocalSpecialty(args: {
  prefecture?: string;
  category?: string; // "food" | "craft" | undefined (both)
  lang?: string;
  include_overseas?: boolean;
}): Promise<unknown> {
  const wantFood = !args.category || args.category === "food";
  const wantCraft = !args.category || args.category === "craft";
  // The MAFF GI registry includes a small number of foreign-country GIs
  // (Italy / Vietnam / Thailand etc.) that Japan recognises under bilateral
  // protection. They have empty prefecture_codes. Default to hiding them so
  // the tool returns Japan-domestic items only; callers can opt in.
  const includeOverseas = args.include_overseas === true;

  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const lang = args.lang;
  const translations = await loadR3Translations();

  const items: unknown[] = [];

  if (wantFood) {
    const f = await loadMaffGi();
    if (f) {
      for (const r of f.records) {
        if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
        if (!includeOverseas && r.prefecture_codes.length === 0) continue;
        const key = `maff_gi:${r.registration_number}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "food",
          authority: r.authority,
          designation: "GI (Geographical Indication)",
          registration_number: r.registration_number,
          name_ja: r.name_ja,
          name: pickR3Name(r.name_ja, t, lang),
          description_ja: r.characteristics_ja,
          description: pickR3Description(r.characteristics_ja, t, lang),
          registration_date: r.registration_date,
          production_area_text: r.production_area_text,
          prefecture_codes: r.prefecture_codes,
          producer_group: r.producer_group,
          source_url: r.detail_url,
          translation_meta: meta,
        });
      }
    }
  }

  if (wantCraft) {
    const f = await loadMetiDensan();
    if (f) {
      for (const r of f.records) {
        if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
        const key = `meti_densan:${r.craft_id}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "craft",
          authority: r.authority,
          designation: "Traditional Craft (伝統的工芸品)",
          industry_category: r.industry_category,
          craft_id: r.craft_id,
          name_ja: r.name_ja,
          name: pickR3Name(r.name_ja, t, lang),
          description_ja: r.features_ja,
          description: pickR3Description(r.features_ja, t, lang),
          designation_date: r.designation_date,
          production_area_text: r.production_area_text,
          prefecture_codes: r.prefecture_codes,
          source_url: r.detail_url,
          translation_meta: meta,
        });
      }
    }
  }

  return {
    prefecture_code: prefCode,
    category_filter: args.category ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      { name: "農林水産省 (MAFF) Geographical Indication", category: "food" },
      {
        name: "経済産業省 (METI) Traditional Crafts (伝統的工芸品)",
        category: "craft",
      },
    ],
    note: "Only items officially designated by MAFF or METI appear. Non-designated regional foods/crafts are intentionally excluded.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_traditional_arts
//
// Returns Japanese traditional / intangible cultural assets, drawn ONLY from
// official designation systems:
//   - 文化庁 重要無形文化財          (Important Intangible Cultural Property)
//   - 文化庁 重要無形民俗文化財      (Important Intangible Folk Cultural Property)
//   - UNESCO Intangible Cultural Heritage (Japan inscriptions)
// Wikidata is the carrier (CC0); the underlying designation data is from the
// authorities above.

async function getTraditionalArts(args: {
  category?: string; // "important" | "folk" | "unesco" | undefined (all)
  lang?: string;
}): Promise<unknown> {
  const lang = args.lang;
  const translations = await loadR3Translations();
  const items: unknown[] = [];

  const wantImportant = !args.category || args.category === "important";
  const wantFolk = !args.category || args.category === "folk";
  const wantUnesco = !args.category || args.category === "unesco";

  if (wantImportant || wantFolk) {
    const f = await loadBunkaIntangible();
    if (f) {
      for (const r of f.records) {
        const isFolk = r.designation_qid === "Q6573893";
        if (isFolk && !wantFolk) continue;
        if (!isFolk && !wantImportant) continue;
        const key = `bunka_intangible:${r.qid}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: isFolk ? "folk" : "important",
          authority: r.authority,
          designation: r.designation,
          qid: r.qid,
          name_ja: r.name_ja,
          name_en: r.name_en,
          name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
          description_ja: r.description_ja,
          description_en: r.description_en,
          description: pickR3Description(
            r.description_ja ?? r.description_en,
            t,
            lang,
          ),
          inception: r.inception,
          bunca_id: r.bunca_id,
          source_url: r.wikidata_url,
          translation_meta: meta,
        });
      }
    }
  }

  if (wantUnesco) {
    const f = await loadUnescoJapan();
    if (f) {
      for (const r of f.records) {
        const key = `unesco_japan:${r.qid}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "unesco",
          authority: r.authority,
          designation: "UNESCO Intangible Cultural Heritage",
          qid: r.qid,
          name_ja: r.name_ja,
          name_en: r.name_en,
          name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
          description_ja: r.description_ja,
          description_en: r.description_en,
          description: pickR3Description(
            r.description_ja ?? r.description_en,
            t,
            lang,
          ),
          inscription_year: r.inscription_year,
          unesco_id: r.unesco_id,
          source_url: r.wikidata_url,
          translation_meta: meta,
        });
      }
    }
  }

  return {
    category_filter: args.category ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      {
        name: "文化庁 (Agency for Cultural Affairs) — Important Intangible Cultural Properties (重要無形文化財・重要無形民俗文化財)",
        carrier: "Wikidata (CC0)",
      },
      {
        name: "UNESCO Intangible Cultural Heritage (Japan inscriptions)",
        carrier: "Wikidata (CC0)",
      },
    ],
    note: "Only items officially designated by 文化庁 or UNESCO appear. Coverage on Wikidata is incomplete vs. the full bunka.go.jp registry; for authoritative lookup use the bunka_id link.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_japan_heritage
//
// Returns 文化庁 Japan Heritage stories (104 designated). Optional prefecture
// or theme filter.

async function getJapanHeritage(args: {
  prefecture?: string;
  theme?: string;
  lang?: string;
}): Promise<unknown> {
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const lang = args.lang;
  const translations = await loadR3Translations();
  const f = await loadJapanHeritage();
  if (!f) {
    return {
      error: "japan_heritage data not loaded",
      hint: "Run scrapers/sources/fetch_japan_heritage.ts to populate data/r3/japan_heritage.json",
      disclaimer: DISCLAIMER,
    };
  }

  const items: unknown[] = [];
  for (const r of f.records) {
    if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
    if (
      args.theme &&
      !r.themes.some((t) => t.includes(args.theme!) || args.theme!.includes(t))
    )
      continue;
    const key = `japan_heritage:${r.story_id}`;
    const t = translations.get(key);
    const meta = r3Translation(t, lang);
    items.push({
      key,
      story_id: r.story_id,
      authority: r.authority,
      title_ja: r.title_ja,
      subtitle_ja: r.subtitle_ja,
      title: pickR3Name(r.title_ja, t, lang),
      summary_ja: r.summary_ja,
      summary: pickR3Description(r.summary_ja, t, lang),
      themes: r.themes,
      periods: r.periods,
      related_areas_text: r.related_areas_text,
      prefecture_codes: r.prefecture_codes,
      source_url: r.story_url,
      translation_meta: meta,
    });
  }

  return {
    prefecture_code: prefCode,
    theme_filter: args.theme ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      {
        name: "文化庁 Japan Heritage (日本遺産) ポータルサイト",
        url: "https://japan-heritage.bunka.go.jp/",
      },
    ],
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_multilingual (signature tool)

async function getMultilingual(args: {
  spot_id: string;
  lang?: string;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      if (a.qid === args.spot_id) {
        return {
          spot_id: a.qid,
          source: "wikidata",
          languages: {
            ja: a.name_ja,
            en: a.name_en,
            zh: a.name_zh,
            ko: a.name_ko,
          },
          description_en: a.description_en,
          coordinates: a.coordinates,
          wikidata_url: a.wikidata_url,
          prefecture: p.prefecture.name,
          municipality: a.admin_name,
          data_as_of: p.data_as_of,
          disclaimer: DISCLAIMER,
        };
      }
    }
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        if (s.id === args.spot_id) {
          return {
            spot_id: s.id,
            source: "municipal_scrape",
            languages: { [s.language]: s.name },
            note: "Municipal-scraped spots typically lack multilingual labels. Try a Wikidata QID via search_area for richer multilingual coverage.",
            url: s.url,
            description: s.description,
            data_as_of: p.data_as_of,
            disclaimer: DISCLAIMER,
          };
        }
      }
    }
  }
  return {
    error: "not_found",
    spot_id: args.spot_id,
    hint: "Use search_area or get_spots first to obtain a valid spot_id.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool definitions (advertised via ListTools)

const TOOLS = [
  {
    name: "search_area",
    description:
      "Search Japan tourism data by name or keyword. Returns matching prefectures, municipalities, and tourist attractions.\n\nUse this when the user wants to find an area or a specific spot by name. Static reference data, not live search.\n\nAccepts Japanese, English, Chinese, or Korean queries — the data layer searches all label languages.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query (any language)",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description: "Preferred response language hint",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_spots",
    description:
      "Returns tourist spots in a given prefecture or municipality.\n\nCombines two parallel data sources:\n  - Municipal-website scraping (spots from official tourism pages)\n  - Wikidata (multilingual labels, coordinates, CC0 license)\n\nUse this when the user wants to know 'what to see' in an area. Does NOT return availability or pricing — this is static reference data.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture name in Japanese, English, or 2-digit JIS code (e.g., '鳥取県', 'tottori', '31')",
        },
        city: { type: "string", description: "Municipality name in Japanese" },
        limit: {
          type: "number",
          description: "Max spots to return (1–500, default 50)",
        },
      },
    },
  },
  {
    name: "get_hotels",
    description:
      "Returns accommodations (hotels, ryokan, hostels, guest houses) in Japan.\n\nData is merged from Wikidata (CC0) and OpenStreetMap (ODbL). Records carry multilingual names, coordinates, phone, and website where available. Confirmed clusters (same property in both sources) are flagged.\n\nFilter by prefecture, city (substring match), or coordinate radius. lat+lng+radius (metres) is the most precise — sorted by distance.\n\nDoes NOT return availability or pricing. For bookings, visit the property's official site.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description: "Prefecture (Japanese name, English slug, or 2-digit code)",
        },
        city: {
          type: "string",
          description: "City / municipality name (substring match)",
        },
        lat: { type: "number", description: "Centre latitude for radius search" },
        lng: { type: "number", description: "Centre longitude for radius search" },
        radius: {
          type: "number",
          description: "Radius in metres (used with lat+lng)",
        },
        limit: {
          type: "number",
          description: "Max results (1–500, default 50)",
        },
      },
    },
  },
  {
    name: "get_transport",
    description:
      "Returns access information for a tourist spot: coordinates, prefecture, municipality, and the official URL where the property documents how to get there.\n\nThis tool returns location + source URL. It does NOT (yet) return parsed station names or walk times — for that, follow the official URL. Future versions will add OpenStreetMap-derived railway station data.",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description: "Spot ID from search_area or get_spots (Wikidata QID or municipal ID)",
        },
      },
      required: ["spot_id"],
    },
  },
  {
    name: "get_events",
    description:
      "Returns festivals (祭) registered in Wikidata for a given Japanese prefecture, with optional month filter.\n\nFetches from Wikidata SPARQL on first request per prefecture, then cached in-memory. Coverage is uneven — small local festivals may not be in Wikidata. For comprehensive listings, also consult the prefecture tourism association.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26')",
        },
        month: {
          type: "number",
          minimum: 1,
          maximum: 12,
          description: "Optional 1-12 month filter (matches P585 point_in_time / P580 start_time)",
        },
      },
      required: ["prefecture"],
    },
  },
  {
    name: "get_multilingual",
    description:
      "Returns multilingual NAMES (Japanese / English / Chinese / Korean) for a tourist spot, plus coordinates and Wikidata link.\n\nThis is the lightweight name-lookup tool. For rich 200-300 character DESCRIPTIONS in 17 languages, use get_description instead.",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description:
            "Either a municipal-scrape spot ID or a Wikidata QID (e.g. 'Q11341')",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description:
            "Specific language to highlight in the response (all four languages are still returned)",
        },
      },
      required: ["spot_id"],
    },
  },
  {
    name: "get_description",
    description:
      "SIGNATURE TOOL. Returns a 200-300 character tourism description in any of 17 languages for a tourist spot, generated for global tourist consumption.\n\nLanguages: en, ja, zh, ko, fr, es, de, it, pt, ru, th, vi, id, ms, ar, hi, tl. If `lang` is omitted, all 17 are returned. Coverage: ~13,400 entities (those with Japanese Wikipedia anchor). Use search_area to obtain a Wikidata QID, then pass it as `qid`.\n\nDescriptions are AI-generated by Claude Sonnet 4.6, grounded in entity name + Wikidata metadata. Each entry carries a `confidence` field (high / medium / low) reflecting the quality of the source signal.",
    inputSchema: {
      type: "object",
      properties: {
        qid: {
          type: "string",
          description: "Wikidata QID (e.g. 'Q5854' for Itsukushima Shrine)",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Optional. If specified, returns only that language. If omitted, returns all 17.",
        },
      },
      required: ["qid"],
    },
  },
  {
    name: "get_local_specialty",
    description:
      "Returns regional specialties for a Japanese prefecture, drawn ONLY from official designation systems:\n  - 農林水産省 GI (geographical indication) — protected agricultural products\n  - 経済産業省 伝統的工芸品 — METI-designated traditional crafts\n\nNo editorial or AI-curated picks; items the authorities have not designated will not appear. Use this when the user asks 'what is famous from <prefecture>' for an answer grounded in formal designation rather than tourism marketing.\n\nIf 17-language translations are available (data/r3/translations/r3_translations.jsonl), the requested `lang` is returned; otherwise the original Japanese description is returned with a translation_meta marker.\n\nMAFF GI also protects a small number of foreign-country items (Italian / Vietnamese / Thai produce). They are HIDDEN by default; pass `include_overseas: true` to include them.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture name in Japanese, English slug, or 2-digit JIS code (e.g., '京都府', 'kyoto', '26'). Omit to return everything.",
        },
        category: {
          type: "string",
          enum: ["food", "craft"],
          description: "Restrict to MAFF GI (food) or METI traditional crafts (craft). Omit for both.",
        },
        include_overseas: {
          type: "boolean",
          description:
            "If true, also return MAFF GI items registered for foreign countries (Italy / Vietnam / Thailand etc.). Default false.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_traditional_arts",
    description:
      "Returns Japanese traditional / intangible cultural assets, drawn ONLY from official designation systems:\n  - 文化庁 重要無形文化財 (Important Intangible Cultural Property)\n  - 文化庁 重要無形民俗文化財 (Important Intangible Folk Cultural Property)\n  - UNESCO Intangible Cultural Heritage (Japan inscriptions)\n\nWikidata is used as the multilingual carrier (CC0); the underlying designation data comes from the authorities above. Coverage on Wikidata is incomplete vs. the full 文化庁 registry — for authoritative lookup, follow `bunca_id` / `unesco_id` / `source_url`.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["important", "folk", "unesco"],
          description:
            "Restrict to a single designation system. Omit for all three.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_japan_heritage",
    description:
      "Returns 文化庁 Japan Heritage (日本遺産) stories — 104 designated narratives that bundle related historic / cultural sites under a unified theme.\n\nEach story includes themes, era tags, related municipalities, and the official summary. Filter by prefecture or theme. For the full constituent assets of a story, follow `source_url` to the official portal.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26')",
        },
        theme: {
          type: "string",
          description:
            "Theme keyword (Japanese; e.g. '城', '海・水辺', '森・木', '繊維・染料', '祭礼'). Substring match.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `title` and `summary`. Defaults to original Japanese.",
        },
      },
    },
  },
];

// ──────────────────────────────────────────────────────────────────────
// Server bootstrap

const server = new Server(
  { name: "japan-travel-mcp", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    switch (name) {
      case "search_area":
        result = await searchArea({
          q: String(args.q ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_spots":
        result = await getSpots({
          prefecture: args.prefecture as string | undefined,
          city: args.city as string | undefined,
          limit:
            typeof args.limit === "number"
              ? args.limit
              : args.limit
                ? Number(args.limit)
                : undefined,
        });
        break;
      case "get_hotels":
        result = await getHotels({
          prefecture: args.prefecture as string | undefined,
          city: args.city as string | undefined,
          lat: typeof args.lat === "number" ? args.lat : undefined,
          lng: typeof args.lng === "number" ? args.lng : undefined,
          radius: typeof args.radius === "number" ? args.radius : undefined,
          limit:
            typeof args.limit === "number" ? args.limit : args.limit ? Number(args.limit) : undefined,
        });
        break;
      case "get_transport":
        result = await getTransport({ spot_id: String(args.spot_id ?? "") });
        break;
      case "get_events":
        result = await getEvents({
          prefecture: args.prefecture as string | undefined,
          month:
            typeof args.month === "number"
              ? args.month
              : args.month
                ? Number(args.month)
                : undefined,
        });
        break;
      case "get_multilingual":
        result = await getMultilingual({
          spot_id: String(args.spot_id ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_description":
        result = await getDescription({
          qid: String(args.qid ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_local_specialty":
        result = await getLocalSpecialty({
          prefecture: args.prefecture as string | undefined,
          category: args.category as string | undefined,
          lang: args.lang as string | undefined,
          include_overseas: args.include_overseas === true,
        });
        break;
      case "get_traditional_arts":
        result = await getTraditionalArts({
          category: args.category as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      case "get_japan_heritage":
        result = await getJapanHeritage({
          prefecture: args.prefecture as string | undefined,
          theme: args.theme as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: (err as Error).message ?? "unknown error",
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  // Resolve the data root before serving any tool calls. On a fresh install
  // this downloads ~270 MB from huggingface.co/datasets/kjsunada/japan-travel-mcp-data
  // to ~/.japan-travel-mcp/data/ once.
  await initDataRoot();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[japan-travel-mcp] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[japan-travel-mcp] FATAL:", err);
  process.exit(1);
});
