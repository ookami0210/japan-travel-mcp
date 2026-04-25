/**
 * Fetch tourist attractions from Wikidata for a given set of prefectures.
 *
 * Why Wikidata:
 *   - Multilingual labels (ja/en/zh/ko) are first-class — solves the
 *     gap that municipal-site scraping cannot fill.
 *   - Coordinates (P625) are widely populated.
 *   - Open data with traceable provenance (CC0). Satisfies the project's
 *     Source Selection Principle.
 *
 * Strategy:
 *   - For each tourist-attraction subclass (temple, shrine, castle, museum, ...)
 *     find items in administrative entities whose Soumu code (P429) belongs
 *     to one of the target prefecture prefixes.
 *
 * Output: data/_state/wikidata_attractions.json
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

// 2-digit prefecture prefixes to fetch. By default all 47.
// Override with WD_PREFECTURES="31,39" for a subset.
const PREFECTURE_PREFIXES =
  process.env.WD_PREFECTURES?.split(",").map((s) => s.trim()).filter(Boolean) ??
  Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));

// Wikidata QIDs we treat as tourist-spot-like instances.
const ATTRACTION_TYPES = [
  "Q570116", // tourist attraction
  "Q15303351", // historic site
  "Q839954", // archaeological site
  "Q44613", // Buddhist temple
  "Q845945", // Shinto shrine
  "Q23413", // castle
  "Q33506", // museum
  "Q22698", // park
  "Q1107656", // garden
  "Q4989906", // monument
  "Q4087053", // natural monument
  "Q174782", // plaza
];

interface AttractionRecord {
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
}

function buildQuery(prefixFilter: string, types: string[]): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(${prefixFilter})

  ?item wdt:P131* ?adminEntity .
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type { ${typesValues} }

  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT 6000
`.trim();
}

interface SparqlValue {
  value: string;
}
interface SparqlBinding {
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
}

async function querySparql(query: string): Promise<SparqlBinding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    results: { bindings: SparqlBinding[] };
  };
  return json.results.bindings;
}

function parseWktPoint(
  v: string,
): { lat: number; lng: number } | null {
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
  bindings: SparqlBinding[],
  byQid: Map<string, AttractionRecord>,
): void {
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const typeQid = qidFromUri(b.type?.value ?? "");

    const existing = byQid.get(qid);
    const coord = b.coord?.value ? parseWktPoint(b.coord.value) : null;

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
      if (!existing.admin_code && adminCode) {
        existing.admin_code = adminCode;
        existing.prefecture_code = prefCode;
      }
      if (!existing.admin_name && b.adminLabel) {
        existing.admin_name = b.adminLabel.value;
      }
      if (typeQid && !existing.types.includes(typeQid)) {
        existing.types.push(typeQid);
      }
    }
  }
}

async function main(): Promise<void> {
  const byQid = new Map<string, AttractionRecord>();

  // Fetch one prefecture at a time. Wikidata times out on 47-way unions.
  // Keep query small + retry on transient failures.
  for (const prefix of PREFECTURE_PREFIXES) {
    const filter = `STRSTARTS(?adminCode, "${prefix}")`;
    const query = buildQuery(filter, ATTRACTION_TYPES);

    let attempt = 0;
    while (attempt < 3) {
      try {
        const bindings = await querySparql(query);
        processBindings(bindings, byQid);
        console.error(
          `[wikidata_attractions] pref ${prefix}: ${bindings.length} bindings (running total: ${byQid.size})`,
        );
        break;
      } catch (err) {
        attempt += 1;
        console.error(
          `  pref ${prefix} attempt ${attempt} failed: ${(err as Error).message}`,
        );
        if (attempt >= 3) {
          console.error(`  pref ${prefix} GAVE UP after 3 attempts`);
        } else {
          await new Promise((r) => setTimeout(r, 2000 * attempt));
        }
      }
    }

    // Be nice to the public Wikidata endpoint.
    await new Promise((r) => setTimeout(r, 400));
  }

  const records = Array.from(byQid.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  const byPref: Record<string, number> = {};
  let withEn = 0,
    withZh = 0,
    withKo = 0,
    withCoord = 0;
  for (const r of records) {
    byPref[r.prefecture_code] = (byPref[r.prefecture_code] ?? 0) + 1;
    if (r.name_en) withEn += 1;
    if (r.name_zh) withZh += 1;
    if (r.name_ko) withKo += 1;
    if (r.coordinates) withCoord += 1;
  }
  console.error(`[wikidata_attractions] TOTAL unique: ${records.length}`);
  console.error(
    `  with EN: ${withEn}, ZH: ${withZh}, KO: ${withKo}, coord: ${withCoord}`,
  );

  const out = {
    source: {
      endpoint: SPARQL_ENDPOINT,
      properties: [
        "P31/P279* (type)",
        "P131* (administrative entity)",
        "P429 (JIS municipality code)",
        "P625 (coordinates)",
        "rdfs:label (multilingual)",
      ],
      types: ATTRACTION_TYPES,
      license: "CC0",
    },
    fetched_at: new Date().toISOString(),
    prefecture_prefixes_fetched: PREFECTURE_PREFIXES,
    total_attractions: records.length,
    multilingual_coverage: { en: withEn, zh: withZh, ko: withKo },
    coordinate_coverage: withCoord,
    attractions: records,
  };

  const outPath = fileURLToPath(
    new URL("../../data/_state/wikidata_attractions.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[wikidata_attractions] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[wikidata_attractions] FAILED:", err);
  process.exit(1);
});
