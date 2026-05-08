/**
 * Fetch Japan national parks + quasi-national parks from Wikidata.
 *
 * Source: Wikidata SPARQL — items typed as
 *   - Q1071482  national park of Japan (環境省指定 国立公園)
 *   - Q11832860 quasi-national park of Japan (国定公園)
 * located in Japan (P17 = Q17).
 *
 * Why: the existing v2/p1435 fetchers anchor on generic Q1542076
 * (national_park) which has 0 hits in Japan because every Japanese park
 * is typed under the more specific Q1071482 / Q11832860. The intent
 * classifier already recognises 国立公園 / 国定公園 query terms and
 * routes to target_kinds=["national_park"] / ["quasi_national_park"];
 * this fetcher provides the canonical entities those kinds can match.
 *
 * Output: data/_state/national_parks.json (consumed by
 * scripts/inject_national_parks.py which folds records into
 * data/_state/wikidata_attractions.json and per-prefecture files).
 *
 * Per project data principle: Wikidata is CC0; entities reflect the
 * authoritative Ministry of the Environment designations.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_national_parks.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/national_parks.json");

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const NP_QID = "Q1071482";    // national park of Japan
const QNP_QID = "Q11832860";  // quasi-national park of Japan

type ParkKind = "national_park" | "quasi_national_park";

interface SparqlValue {
  value: string;
}
interface SparqlBinding {
  item?: SparqlValue;
  coord?: SparqlValue;
  adminCode?: SparqlValue;
  adminLabel?: SparqlValue;
  type?: SparqlValue;
  inception?: SparqlValue;
  area?: SparqlValue;
  website?: SparqlValue;
  label_ja?: SparqlValue;
  label_en?: SparqlValue;
  label_zh?: SparqlValue;
  label_ko?: SparqlValue;
  desc_en?: SparqlValue;
}

interface ParkRecord {
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
  inception: string | null;
  area_km2: number | null;
  website: string | null;
  park_kind: ParkKind;
  source_anchor: "wikidata_national_park";
}

function buildParkQuery(parkQid: string): string {
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type ?inception ?area ?website
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ?item wdt:P31 wd:${parkQid} .
  ?item wdt:P17 wd:Q17 .

  OPTIONAL {
    ?item wdt:P131 ?admin .
    ?admin wdt:P429 ?adminCode .
    OPTIONAL { ?admin rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
  }
  OPTIONAL { ?item wdt:P31 ?type }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item wdt:P571 ?inception }
  OPTIONAL { ?item wdt:P2046 ?area }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
}
LIMIT 1000
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
  byQid: Map<string, ParkRecord>,
  parkKind: ParkKind,
): void {
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const typeQid = qidFromUri(b.type?.value ?? "");
    const coord = b.coord?.value ? parseWktPoint(b.coord.value) : null;
    const areaRaw = b.area?.value ? parseFloat(b.area.value) : null;
    const area = areaRaw && Number.isFinite(areaRaw) ? areaRaw : null;

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
        inception: b.inception?.value ?? null,
        area_km2: area,
        website: b.website?.value ?? null,
        park_kind: parkKind,
        source_anchor: "wikidata_national_park",
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
      if (!existing.inception && b.inception) {
        existing.inception = b.inception.value;
      }
      if (existing.area_km2 == null && area != null) existing.area_km2 = area;
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
  process.stderr.write(`[national_parks] start at ${startedAt}\n`);

  const byQid = new Map<string, ParkRecord>();

  process.stderr.write(`[national_parks] pass 1: P31 = ${NP_QID} (national park of Japan)\n`);
  const np = await querySparql(buildParkQuery(NP_QID));
  processBindings(np, byQid, "national_park");
  process.stderr.write(`  pass 1 bindings=${np.length} unique=${byQid.size}\n`);

  await new Promise((r) => setTimeout(r, 800));

  process.stderr.write(`[national_parks] pass 2: P31 = ${QNP_QID} (quasi-national park of Japan)\n`);
  const qnp = await querySparql(buildParkQuery(QNP_QID));
  processBindings(qnp, byQid, "quasi_national_park");
  process.stderr.write(`  pass 2 bindings=${qnp.length} unique=${byQid.size}\n`);

  const records = Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid));

  const byKind = { national_park: 0, quasi_national_park: 0 };
  for (const r of records) byKind[r.park_kind] += 1;

  const byPref = new Map<string, number>();
  for (const r of records) {
    const k = r.prefecture_code || "??";
    byPref.set(k, (byPref.get(k) ?? 0) + 1);
  }
  const sortedPrefs = Array.from(byPref.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  const summary = {
    source: "wikidata_national_parks",
    anchor_qids: [NP_QID, QNP_QID],
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
    total_records: records.length,
    by_kind: byKind,
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
    `[national_parks] wrote ${OUT_FILE} | total=${records.length} (NP=${byKind.national_park} / QNP=${byKind.quasi_national_park}) | prefectures=${sortedPrefs.length}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[national_parks] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
