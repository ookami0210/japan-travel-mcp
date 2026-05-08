/**
 * Fetch all railway / train stations in Japan from Wikidata.
 *
 * Source: Wikidata SPARQL — items typed as Q55488 (railway station) or its
 * subclasses, located in Japan (P17 = Q17), with coordinates (P625).
 *
 * Why: per project_japan_travel_mcp_research_0504.md Phase A, the
 * `nearest_transit` structured field needs a canonical station entity
 * dataset. Once collected, the inject script (inject_nearest_transit.py)
 * pre-computes nearest station + walk-minutes for every attraction with
 * coordinates via haversine, exposing a Solver-ingestible field.
 *
 * Single global SPARQL — empirically returns ~12,500 bindings (~11,800
 * unique items) in ~35 s. Per-prefecture chunking via P131* hit
 * intermittent timeouts on Tohoku admin trees, so a single global query
 * with default LIMIT is preferred.
 *
 * Output: data/_state/railway_stations.json
 *
 * Per project data principle: Wikidata is CC0; station entities reflect
 * publicly-available infrastructure data.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_railway_stations.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/railway_stations.json");

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const STATION_QID = "Q55488";

interface SparqlValue {
  value: string;
}
interface SparqlBinding {
  item?: SparqlValue;
  coord?: SparqlValue;
  adminCode?: SparqlValue;
  adminLabel?: SparqlValue;
  operator?: SparqlValue;
  operatorLabel?: SparqlValue;
  label_ja?: SparqlValue;
  label_en?: SparqlValue;
}

interface StationRecord {
  qid: string;
  wikidata_url: string;
  name_ja: string | null;
  name_en: string | null;
  coordinates: { lat: number; lng: number };
  prefecture_code: string;
  admin_code: string | null;
  admin_name: string | null;
  operator_qid: string | null;
  operator_name: string | null;
}

const QUERY = `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?operator ?operatorLabel
  ?label_ja ?label_en
WHERE {
  ?item wdt:P31/wdt:P279* wd:${STATION_QID} .
  ?item wdt:P17 wd:Q17 .
  ?item wdt:P625 ?coord .

  OPTIONAL {
    ?item wdt:P131 ?admin .
    ?admin wdt:P429 ?adminCode .
    OPTIONAL { ?admin rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
  }
  OPTIONAL {
    ?item wdt:P137 ?operator .
    OPTIONAL { ?operator rdfs:label ?operatorLabel . FILTER(LANG(?operatorLabel) = "ja") }
  }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
}
`.trim();

async function querySparql(timeoutMs = 240_000): Promise<SparqlBinding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(QUERY)}&format=json`;
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

function processBindings(bindings: SparqlBinding[]): StationRecord[] {
  const byQid = new Map<string, StationRecord>();
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const coord = b.coord?.value ? parseWktPoint(b.coord.value) : null;
    if (!coord) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const operatorQid = qidFromUri(b.operator?.value ?? "");

    const existing = byQid.get(qid);
    if (!existing) {
      byQid.set(qid, {
        qid,
        wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
        name_ja: b.label_ja?.value ?? null,
        name_en: b.label_en?.value ?? null,
        coordinates: coord,
        prefecture_code: prefCode,
        admin_code: adminCode,
        admin_name: b.adminLabel?.value ?? null,
        operator_qid: operatorQid || null,
        operator_name: b.operatorLabel?.value ?? null,
      });
    } else {
      if (!existing.name_ja && b.label_ja) existing.name_ja = b.label_ja.value;
      if (!existing.name_en && b.label_en) existing.name_en = b.label_en.value;
      if (!existing.admin_code && adminCode) {
        existing.admin_code = adminCode;
        existing.prefecture_code = prefCode;
      }
      if (!existing.admin_name && b.adminLabel) existing.admin_name = b.adminLabel.value;
      if (!existing.operator_qid && operatorQid) {
        existing.operator_qid = operatorQid;
        existing.operator_name = b.operatorLabel?.value ?? null;
      }
    }
  }
  return Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid));
}

async function main(): Promise<void> {
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const startedAt = new Date().toISOString();
  process.stderr.write(`[railway_stations] start at ${startedAt}\n`);

  const t0 = Date.now();
  const bindings = await querySparql();
  const records = processBindings(bindings);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  process.stderr.write(
    `[railway_stations] sparql in ${elapsed}s | bindings=${bindings.length} unique=${records.length}\n`,
  );

  const byPref = new Map<string, number>();
  for (const r of records) {
    const k = r.prefecture_code || "??";
    byPref.set(k, (byPref.get(k) ?? 0) + 1);
  }

  const summary = {
    source: "wikidata_railway_stations",
    anchor_qid: STATION_QID,
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
    total_stations: records.length,
    multilingual_coverage: {
      ja: records.filter((r) => r.name_ja).length,
      en: records.filter((r) => r.name_en).length,
    },
    by_prefecture: Object.fromEntries(
      Array.from(byPref.entries()).sort((a, b) => a[0].localeCompare(b[0])),
    ),
    stations: records,
  };

  await writeFile(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  process.stderr.write(
    `[railway_stations] wrote ${OUT_FILE} | total=${records.length} | prefectures=${byPref.size}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[railway_stations] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
