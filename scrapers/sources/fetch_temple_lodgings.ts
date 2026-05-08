/**
 * Fetch shukubo (temple lodging) entities from Wikidata.
 *
 * Source: Wikidata SPARQL — items typed as Q11455614 (shukubō / 宿坊) or
 * subclasses thereof, located in Japan (P17 = Q17).
 *
 * Why: the corpus has zero shukubo records for Kyoto Prefecture and only
 * partial coverage elsewhere (高野山宿坊協会 records cover Koyasan only
 * via fetch_koyasan_shukubo.ts). A query directly anchored on the shukubo
 * concept QID surfaces the nationwide universe of Wikidata-known shukubo
 * including Kyoto sect塔頭, Koyasan extras, Tohoku haguro 出羽三山 saikan,
 * Shikoku 88 henro lodgings, etc.
 *
 * Output: data/_state/temple_lodgings.json (consumed by
 * scripts/inject_temple_lodgings_into_master.ts which folds the records
 * into data/_state/wikidata_attractions.json and per-prefecture files).
 *
 * Per project data principle: Wikidata is CC0; entities are public
 * encyclopedic content about official Buddhist lodging facilities.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_temple_lodgings.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/temple_lodgings.json");

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

// Q11455614 = shukubō (Japanese Buddhist lodging)
const SHUKUBO_QID = "Q11455614";

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
  parentTemple?: SparqlValue;
  parentTempleLabel?: SparqlValue;
  website?: SparqlValue;
}

interface TempleLodgingRecord {
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
  parent_temple_qid: string | null;
  parent_temple_name: string | null;
  website: string | null;
  source_anchor: "shukubo_p31" | "shukubo_subclass";
}

function buildShukuboQuery(includeSubclass: boolean): string {
  const typeClause = includeSubclass
    ? `?item wdt:P31/wdt:P279* wd:${SHUKUBO_QID} .`
    : `?item wdt:P31 wd:${SHUKUBO_QID} .`;
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type ?website
  ?parentTemple ?parentTempleLabel
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ${typeClause}
  ?item wdt:P17 wd:Q17 .

  OPTIONAL {
    ?item wdt:P131 ?admin .
    ?admin wdt:P429 ?adminCode .
    OPTIONAL { ?admin rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
  }
  OPTIONAL { ?item wdt:P31 ?type }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL {
    ?item wdt:P137 ?parentTemple .
    OPTIONAL { ?parentTemple rdfs:label ?parentTempleLabel . FILTER(LANG(?parentTempleLabel) = "ja") }
  }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
}
LIMIT 5000
`.trim();
}

async function querySparql(
  query: string,
  timeoutMs = 90_000,
): Promise<SparqlBinding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
      },
      signal: ctl.signal,
    });
    if (!res.ok) {
      throw new Error(`Wikidata SPARQL HTTP ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as {
      results: { bindings: SparqlBinding[] };
    };
    return json.results.bindings;
  } finally {
    clearTimeout(t);
  }
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
  bindings: SparqlBinding[],
  byQid: Map<string, TempleLodgingRecord>,
  anchor: "shukubo_p31" | "shukubo_subclass",
): void {
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const typeQid = qidFromUri(b.type?.value ?? "");
    const parentQid = qidFromUri(b.parentTemple?.value ?? "");
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
        parent_temple_qid: parentQid || null,
        parent_temple_name: b.parentTempleLabel?.value ?? null,
        website: b.website?.value ?? null,
        source_anchor: anchor,
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
      if (!existing.parent_temple_qid && parentQid) {
        existing.parent_temple_qid = parentQid;
        existing.parent_temple_name = b.parentTempleLabel?.value ?? null;
      }
      if (!existing.website && b.website) existing.website = b.website.value;
      if (typeQid && !existing.types.includes(typeQid)) {
        existing.types.push(typeQid);
      }
    }
  }
}

async function main(): Promise<void> {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const startedAt = new Date().toISOString();
  process.stderr.write(`[temple_lodgings] start at ${startedAt}\n`);

  const byQid = new Map<string, TempleLodgingRecord>();

  // Pass 1: direct P31 = Q11455614
  process.stderr.write(`[temple_lodgings] pass 1: P31 = ${SHUKUBO_QID}\n`);
  const direct = await querySparql(buildShukuboQuery(false));
  processBindings(direct, byQid, "shukubo_p31");
  process.stderr.write(
    `  pass 1 bindings=${direct.length} unique=${byQid.size}\n`,
  );

  await new Promise((r) => setTimeout(r, 800));

  // Pass 2: P31/P279* (subclass walk)
  process.stderr.write(`[temple_lodgings] pass 2: subclass walk\n`);
  const sub = await querySparql(buildShukuboQuery(true));
  processBindings(sub, byQid, "shukubo_subclass");
  process.stderr.write(
    `  pass 2 bindings=${sub.length} unique=${byQid.size}\n`,
  );

  const records = Array.from(byQid.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  const byPref = new Map<string, number>();
  for (const r of records) {
    const k = r.prefecture_code || "??";
    byPref.set(k, (byPref.get(k) ?? 0) + 1);
  }
  const sortedPrefs = Array.from(byPref.entries()).sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const summary = {
    source: "wikidata_temple_lodgings",
    anchor_qid: SHUKUBO_QID,
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
    total_records: records.length,
    multilingual_coverage: {
      ja: records.filter((r) => r.name_ja).length,
      en: records.filter((r) => r.name_en).length,
      zh: records.filter((r) => r.name_zh).length,
      ko: records.filter((r) => r.name_ko).length,
    },
    coordinate_coverage: records.filter((r) => r.coordinates).length,
    by_prefecture: Object.fromEntries(sortedPrefs),
    records,
  };

  await writeFile(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  process.stderr.write(
    `[temple_lodgings] wrote ${OUT_FILE} | total=${records.length} | prefectures=${sortedPrefs.length}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[temple_lodgings] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
