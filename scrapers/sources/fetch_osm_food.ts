/**
 * OSM food-venue layer — per-prefecture dining POIs via the Overpass API.
 *
 * WHY: the dataset had no standalone food supply; food-focused consumers got
 * zero candidates in cities where municipal pages don't enumerate
 * restaurants. OSM (ODbL, open data with explicit licence — allowed source
 * class #3 in DATA_POLICY.md) carries named dining POIs with coordinates,
 * cuisine tags, opening_hours, wheelchair access and — crucially — the
 * `website` tag, which usually points at the venue's official page.
 *
 * Scope: named venues only (amenity = restaurant / cafe / fast_food /
 * food_court / ice_cream). No ratings, no curation, honest nulls for
 * everything OSM doesn't carry (price bands, last orders, reservations —
 * those need per-venue official pages, a later enrichment pass).
 *
 * Output: data/food/<slug>.json, one file per prefecture.
 *
 * Usage:
 *   npx tsx scrapers/sources/fetch_osm_food.ts             # all 47
 *   npx tsx scrapers/sources/fetch_osm_food.ts --pref 27   # one prefecture
 */

import { mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const OUT_DIR = new URL("data/food/", ROOT);

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
/** Fair-use pause between prefecture queries (public Overpass etiquette). */
const SLEEP_MS = 8000;
const AMENITIES = ["restaurant", "cafe", "fast_food", "food_court", "ice_cream"];

const PREFECTURE_SLUGS: Record<string, string> = {
  "01": "hokkaido", "02": "aomori", "03": "iwate", "04": "miyagi",
  "05": "akita", "06": "yamagata", "07": "fukushima", "08": "ibaraki",
  "09": "tochigi", "10": "gunma", "11": "saitama", "12": "chiba",
  "13": "tokyo", "14": "kanagawa", "15": "niigata", "16": "toyama",
  "17": "ishikawa", "18": "fukui", "19": "yamanashi", "20": "nagano",
  "21": "gifu", "22": "shizuoka", "23": "aichi", "24": "mie",
  "25": "shiga", "26": "kyoto", "27": "osaka", "28": "hyogo",
  "29": "nara", "30": "wakayama", "31": "tottori", "32": "shimane",
  "33": "okayama", "34": "hiroshima", "35": "yamaguchi", "36": "tokushima",
  "37": "kagawa", "38": "ehime", "39": "kochi", "40": "fukuoka",
  "41": "saga", "42": "nagasaki", "43": "kumamoto", "44": "oita",
  "45": "miyazaki", "46": "kagoshima", "47": "okinawa",
};

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface FoodEntry {
  id: string;
  names: { default: string; ja: string | null; en: string | null };
  geo: { lat: number; lng: number; address: string | null };
  amenity: string;
  cuisine: string[];
  /** Raw OSM opening_hours value — machine-parseable spec, may be null. */
  hours_raw: string | null;
  /** OSM `website` tag — usually the venue's official page. */
  official_url: string | null;
  wheelchair: string | null;
  takeaway: string | null;
  prefecture_code: string;
  /** Municipality JIS code — null until a joining pass assigns one. */
  area_id: string | null;
  source: "osm";
  last_verified: string;
}

function buildAddress(tags: Record<string, string>): string | null {
  const parts = [
    tags["addr:province"],
    tags["addr:city"],
    tags["addr:quarter"] ?? tags["addr:suburb"],
    tags["addr:neighbourhood"],
    tags["addr:block_number"] && tags["addr:housenumber"]
      ? `${tags["addr:block_number"]}-${tags["addr:housenumber"]}`
      : tags["addr:housenumber"],
  ].filter(Boolean);
  return parts.length >= 2 ? parts.join("") : null;
}

function toEntry(el: OverpassElement, prefCode: string, now: string): FoodEntry | null {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return null;
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const website = tags.website ?? tags["contact:website"] ?? null;
  return {
    id: `osm:${el.type}/${el.id}`,
    names: {
      default: name,
      ja: tags["name:ja"] ?? (/[぀-ヿ一-鿿]/.test(name) ? name : null),
      en: tags["name:en"] ?? null,
    },
    geo: { lat, lng, address: buildAddress(tags) },
    amenity: tags.amenity ?? "restaurant",
    cuisine: (tags.cuisine ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean),
    hours_raw: tags.opening_hours ?? null,
    official_url: website,
    wheelchair: tags.wheelchair ?? null,
    takeaway: tags.takeaway ?? null,
    prefecture_code: prefCode,
    area_id: null,
    source: "osm",
    last_verified: now,
  };
}

async function fetchPrefecture(code: string): Promise<OverpassElement[]> {
  const iso = `JP-${code}`;
  const query = `
[out:json][timeout:300];
area["ISO3166-2"="${iso}"]->.pref;
(
  nwr["amenity"~"^(${AMENITIES.join("|")})$"]["name"](area.pref);
);
out center tags;`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass etiquette: identify the client. The default undici UA is
        // also rejected outright (HTTP 406) by the API's Apache front.
        "User-Agent":
          "japan-travel-mcp/1.1 (+https://github.com/ookami0210/japan-travel-mcp; open-data food layer fetcher)",
        Accept: "application/json",
      },
    });
    if (res.ok) {
      const json = (await res.json()) as { elements?: OverpassElement[] };
      return json.elements ?? [];
    }
    // 429/504 = server busy — back off and retry.
    const wait = attempt * 30_000;
    console.warn(`[osm_food] ${iso}: HTTP ${res.status} — retry in ${wait / 1000}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  throw new Error(`Overpass failed for ${iso} after 3 attempts`);
}

async function main(): Promise<void> {
  const prefArgIdx = process.argv.indexOf("--pref");
  const only =
    prefArgIdx >= 0 ? process.argv[prefArgIdx + 1]?.padStart(2, "0") : null;
  const codes = only ? [only] : Object.keys(PREFECTURE_SLUGS);
  const now = new Date().toISOString();

  for (const code of codes) {
    const slug = PREFECTURE_SLUGS[code];
    if (!slug) {
      console.error(`[osm_food] unknown prefecture code: ${code}`);
      process.exitCode = 2;
      return;
    }
    const t0 = Date.now();
    const elements = await fetchPrefecture(code);
    const entries = elements
      .map((el) => toEntry(el, code, now))
      .filter((e): e is FoodEntry => e !== null);
    const withHours = entries.filter((e) => e.hours_raw).length;
    const withSite = entries.filter((e) => e.official_url).length;

    const outPath = fileURLToPath(new URL(`${slug}.json`, OUT_DIR));
    await mkdir(dirname(outPath), { recursive: true });
    const tmp = `${outPath}.tmp`;
    await writeFile(
      tmp,
      JSON.stringify(
        {
          prefecture: { code, name_en: slug },
          generated_at: now,
          source: {
            name: "OpenStreetMap",
            license: "ODbL 1.0",
            url: "https://www.openstreetmap.org/copyright",
            method: "Overpass API named-amenity query",
          },
          count: entries.length,
          entries,
        },
        null,
        2,
      ),
      "utf8",
    );
    await rename(tmp, outPath);
    console.log(
      `[osm_food] ${slug}: ${entries.length} venues (hours ${withHours}, official_url ${withSite}) in ${Math.round((Date.now() - t0) / 1000)}s`,
    );
    if (codes.length > 1) await new Promise((r) => setTimeout(r, SLEEP_MS));
  }
}

main().catch((err) => {
  console.error("[osm_food] FAILED:", err);
  process.exit(1);
});
