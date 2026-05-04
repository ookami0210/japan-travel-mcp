/**
 * Fetch hotel / ryokan / hostel entities for all of Japan from Wikidata.
 *
 * Output: data/hotels/raw/wikidata.json
 *
 * Schema: { hotels: HotelRecord[] }
 *
 * Source-selection-principle compliance: Wikidata is open data with explicit
 * CC0 license and traceable per-record provenance via QIDs.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const PREFECTURE_PREFIXES = Array.from({ length: 47 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

// Accommodation types we count as "hotel-like".
// Note: we use DIRECT type (P31) only, not the recursive subclass walk
// (P31/P279*). The latter contaminates results with administrative
// entities (cities), religious sites (temples) etc., because Wikidata's
// type tree is sometimes loose around "lodge" / "inn".
const HOTEL_TYPES = [
  "Q27686", // hotel
  "Q1937012", // ryokan
  "Q3411712", // capsule hotel
  "Q2607215", // boutique hotel
  "Q1639378", // hostel
];

interface SparqlValue {
  value: string;
}
interface Binding {
  item?: SparqlValue;
  coord?: SparqlValue;
  adminCode?: SparqlValue;
  adminLabel?: SparqlValue;
  type?: SparqlValue;
  label_ja?: SparqlValue;
  label_en?: SparqlValue;
  label_zh?: SparqlValue;
  label_ko?: SparqlValue;
  desc_en?: SparqlValue;
  website?: SparqlValue;
  phone?: SparqlValue;
  street?: SparqlValue;
  postal?: SparqlValue;
}

interface HotelRecord {
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
  types: string[];
  website: string | null;
  phone: string | null;
  street_address: string | null;
  postal_code: string | null;
}

function buildQuery(prefix: string, types: string[]): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
  ?website ?phone ?street ?postal
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))

  ?item wdt:P131* ?adminEntity .
  ?item wdt:P31 ?type .
  VALUES ?type { ${typesValues} }

  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
  OPTIONAL { ?item wdt:P856 ?website . }
  OPTIONAL { ?item wdt:P1329 ?phone . }
  OPTIONAL { ?item wdt:P6375 ?street . FILTER(LANG(?street) = "ja") }
  OPTIONAL { ?item wdt:P281 ?postal . }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT 5000
`.trim();
}

async function querySparql(query: string): Promise<Binding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

function parseWktPoint(v: string): { lat: number; lng: number } | null {
  const m = v.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lat < 20 ||
    lat > 50 ||
    lng < 120 ||
    lng > 150
  ) {
    return null;
  }
  return { lat, lng };
}

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function processBindings(
  bindings: Binding[],
  byQid: Map<string, HotelRecord>,
): void {
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const typeQid = qidFromUri(b.type?.value ?? "");
    const coord = b.coord?.value ? parseWktPoint(b.coord.value) : null;

    const existing = byQid.get(qid);
    if (!existing) {
      byQid.set(qid, {
        qid,
        wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
        name_ja: b.label_ja?.value ?? null,
        name_en: b.label_en?.value ?? null,
        name_zh: b.label_zh?.value ?? null,
        name_ko: b.label_ko?.value ?? null,
        description_en: b.desc_en?.value ?? null,
        coordinates: coord,
        prefecture_code: prefCode,
        admin_code: adminCode,
        admin_name: b.adminLabel?.value ?? null,
        types: typeQid ? [typeQid] : [],
        website: b.website?.value ?? null,
        phone: b.phone?.value ?? null,
        street_address: b.street?.value ?? null,
        postal_code: b.postal?.value ?? null,
      });
    } else {
      if (!existing.name_ja && b.label_ja) existing.name_ja = b.label_ja.value;
      if (!existing.name_en && b.label_en) existing.name_en = b.label_en.value;
      if (!existing.name_zh && b.label_zh) existing.name_zh = b.label_zh.value;
      if (!existing.name_ko && b.label_ko) existing.name_ko = b.label_ko.value;
      if (!existing.description_en && b.desc_en) {
        existing.description_en = b.desc_en.value;
      }
      if (!existing.coordinates && coord) existing.coordinates = coord;
      if (!existing.website && b.website) existing.website = b.website.value;
      if (!existing.phone && b.phone) existing.phone = b.phone.value;
      if (!existing.street_address && b.street) {
        existing.street_address = b.street.value;
      }
      if (!existing.postal_code && b.postal) {
        existing.postal_code = b.postal.value;
      }
      if (typeQid && !existing.types.includes(typeQid)) {
        existing.types.push(typeQid);
      }
    }
  }
}

async function main(): Promise<void> {
  const byQid = new Map<string, HotelRecord>();

  for (const prefix of PREFECTURE_PREFIXES) {
    let attempt = 0;
    while (attempt < 3) {
      try {
        const bindings = await querySparql(buildQuery(prefix, HOTEL_TYPES));
        processBindings(bindings, byQid);
        console.error(
          `[wikidata_hotels] pref ${prefix}: ${bindings.length} bindings (running total: ${byQid.size})`,
        );
        break;
      } catch (err) {
        attempt += 1;
        console.error(
          `  pref ${prefix} attempt ${attempt} failed: ${(err as Error).message}`,
        );
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const records = Array.from(byQid.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  const stats = {
    en: records.filter((r) => r.name_en).length,
    zh: records.filter((r) => r.name_zh).length,
    ko: records.filter((r) => r.name_ko).length,
    coord: records.filter((r) => r.coordinates).length,
    website: records.filter((r) => r.website).length,
    phone: records.filter((r) => r.phone).length,
  };
  const byPref: Record<string, number> = {};
  for (const r of records) {
    byPref[r.prefecture_code] = (byPref[r.prefecture_code] ?? 0) + 1;
  }
  console.error(`[wikidata_hotels] TOTAL: ${records.length}`);
  console.error(
    `  EN ${stats.en} / ZH ${stats.zh} / KO ${stats.ko} / coord ${stats.coord} / website ${stats.website} / phone ${stats.phone}`,
  );

  const out = {
    source: {
      endpoint: SPARQL_ENDPOINT,
      types: HOTEL_TYPES,
      license: "CC0",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    by_prefecture: byPref,
    stats,
    hotels: records,
  };

  const outPath = fileURLToPath(
    new URL("../../data/hotels/raw/wikidata.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[wikidata_hotels] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[wikidata_hotels] FAILED:", err);
  process.exit(1);
});
