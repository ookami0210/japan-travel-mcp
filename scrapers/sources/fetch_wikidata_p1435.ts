/**
 * Heritage-anchor Wikidata fetcher.
 *
 * v1/v2 of fetch_wikidata_attractions.ts use a P31/P279* chain anchored on
 * 24+ generic "tourist attraction" QIDs (mountain / castle / temple / ...).
 * Two structural blind spots were identified 2026-05-04:
 *
 *   1. Japanese-specific subclasses do not chain up to the generic anchors.
 *      e.g. 姫路城 P31 = Q92026 (日本の城), and Q92026 is *not* a subclass
 *      of Q23413 (castle) — its parent is Q57821 (築城/fortification).
 *      Result: all 2,047 Q92026 instances are silently dropped.
 *
 *   2. Items famous specifically because of a heritage designation
 *      (UNESCO WHS, 国宝, 重要文化財, 名勝, 特別史跡, 日本遺産, etc.)
 *      may not match any of our P31 anchors. Their "tourist value" is
 *      orthogonal to their P31 type.
 *
 * Strategy:
 *   For each prefecture, run two SPARQL queries:
 *     (a) anchored on  ?item wdt:P1435 ?heritage  — any heritage designation.
 *     (b) anchored on  ?item wdt:P31 IN <DIRECT_TYPES>  — Japanese-specific
 *         types that do not chain via P279*.
 *   Both write to the same per-pref checkpoint dir, deduped by QID.
 *
 *   Output: data/_state/wikidata_attractions_p1435.partial/<NN>.json
 *   The merge step (merge_wikidata_attractions.ts) is responsible for
 *   unioning this with the v1/v2 results into the master file.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikidata_p1435.ts
 *   RESUME=1 npx tsx scrapers/sources/fetch_wikidata_p1435.ts
 *   WD_PREFECTURES=13,28 npx tsx scrapers/sources/fetch_wikidata_p1435.ts
 */

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const PREFECTURE_PREFIXES =
  process.env.WD_PREFECTURES?.split(",").map((s) => s.trim()).filter(Boolean) ??
  Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));

const RESUME = process.env.RESUME === "1";
const PER_QUERY_LIMIT = Number(process.env.WD_LIMIT ?? "8000");

/**
 * Direct-match P31 types that the v1/v2 P279* chain does not reach.
 * Each entry should document why it is missed via subclass walk.
 *
 * NOTE: 2026-05-04 audit — earlier draft of this list contained QID
 * typos (Q1779475 / Q11484081 / Q1370978 / Q11635350 / Q1322127 /
 * Q1187899 / Q1129324 / Q277885 all referenced unrelated entities such
 * as Hungarian opera singers, Russian canals, etc.; they returned 0
 * matches and were harmless but misleading). Verified the corrected
 * set below by querying rdfs:label@ja against Wikidata directly.
 */
const DIRECT_TYPES: string[] = [
  // 日本の城: parent is Q57821 (築城/fortification), not Q23413 (castle)
  "Q92026",
  // 平山城 (hilltop castle): subclass of Q92026, also missed
  "Q11482498",
  // 山城 (mountain castle, Japanese-type): subclass of Q92026
  "Q15710038",
  // 平城 (plains castle, Japanese-type): subclass of Q92026
  "Q11482300",
  // 神体山 (sacred mountain): chain doesn't reach Q8502 cleanly
  "Q11588709",
  // 大仏 (Daibutsu / large Buddha statue): chain to Q4989906 (monument)
  // doesn't reach reliably; some Q1051606 entries are missed by v2/v2.2.
  "Q1051606",
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
  heritage_designations?: string[];
  source_anchor: "p1435" | "direct_p31" | "both";
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
  heritage?: SparqlValue;
  label_ja?: SparqlValue;
  label_en?: SparqlValue;
  label_zh?: SparqlValue;
  label_ko?: SparqlValue;
  desc_en?: SparqlValue;
}

function buildHeritageQuery(prefix: string): string {
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type ?heritage
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))

  ?item wdt:P131* ?adminEntity .
  ?item wdt:P1435 ?heritage .

  OPTIONAL { ?item wdt:P31 ?type }
  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT ${PER_QUERY_LIMIT}
`.trim();
}

function buildDirectTypeQuery(prefix: string, types: string[]): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))

  ?item wdt:P131* ?adminEntity .
  ?item wdt:P31 ?type .
  VALUES ?type { ${typesValues} }

  OPTIONAL { ?item wdt:P625 ?coord }
  OPTIONAL { ?item rdfs:label ?label_ja . FILTER(LANG(?label_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?label_en . FILTER(LANG(?label_en) = "en") }
  OPTIONAL { ?item rdfs:label ?label_zh . FILTER(LANG(?label_zh) = "zh") }
  OPTIONAL { ?item rdfs:label ?label_ko . FILTER(LANG(?label_ko) = "ko") }
  OPTIONAL { ?item schema:description ?desc_en . FILTER(LANG(?desc_en) = "en") }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT ${PER_QUERY_LIMIT}
`.trim();
}

async function querySparql(query: string, timeoutMs = 90_000): Promise<SparqlBinding[]> {
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
  byQid: Map<string, AttractionRecord>,
  anchor: "p1435" | "direct_p31",
): void {
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const adminCode = b.adminCode?.value ?? null;
    const prefCode = adminCode ? adminCode.slice(0, 2) : "";
    const typeQid = qidFromUri(b.type?.value ?? "");
    const heritageQid = qidFromUri(b.heritage?.value ?? "");

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
        heritage_designations: heritageQid ? [heritageQid] : [],
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
      if (typeQid && !existing.types.includes(typeQid)) {
        existing.types.push(typeQid);
      }
      if (heritageQid) {
        existing.heritage_designations = existing.heritage_designations ?? [];
        if (!existing.heritage_designations.includes(heritageQid)) {
          existing.heritage_designations.push(heritageQid);
        }
      }
      if (existing.source_anchor !== anchor) existing.source_anchor = "both";
    }
  }
}

async function withRetries<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 4,
): Promise<T | null> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      process.stderr.write(
        `  ${label} attempt ${attempt} failed: ${(err as Error).message}\n`,
      );
      if (attempt >= maxAttempts) {
        process.stderr.write(`  ${label} GIVING UP\n`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  return null;
}

async function fetchPrefecture(
  prefix: string,
): Promise<AttractionRecord[]> {
  const byQid = new Map<string, AttractionRecord>();

  // Pass 1: P1435-anchored
  const p1435Bindings = await withRetries(`pref ${prefix} p1435`, () =>
    querySparql(buildHeritageQuery(prefix)),
  );
  if (p1435Bindings) {
    processBindings(p1435Bindings, byQid, "p1435");
    process.stderr.write(
      `  pref ${prefix} p1435: ${p1435Bindings.length} bindings, byQid=${byQid.size}\n`,
    );
  }

  await new Promise((r) => setTimeout(r, 600));

  // Pass 2: direct P31 types
  const directBindings = await withRetries(`pref ${prefix} direct_p31`, () =>
    querySparql(buildDirectTypeQuery(prefix, DIRECT_TYPES)),
  );
  if (directBindings) {
    processBindings(directBindings, byQid, "direct_p31");
    process.stderr.write(
      `  pref ${prefix} direct_p31: ${directBindings.length} bindings, byQid=${byQid.size}\n`,
    );
  }

  return Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid));
}

async function main(): Promise<void> {
  const partialDir = fileURLToPath(
    new URL(
      "../../data/_state/wikidata_attractions_p1435.partial/",
      import.meta.url,
    ),
  );
  await mkdir(partialDir, { recursive: true });

  const startedAt = new Date().toISOString();
  process.stderr.write(
    `[wd_p1435] start at ${startedAt} | prefectures=${PREFECTURE_PREFIXES.length} | direct_types=${DIRECT_TYPES.length} | resume=${RESUME}\n`,
  );

  for (const prefix of PREFECTURE_PREFIXES) {
    const partialPath = `${partialDir}${prefix}.json`;
    if (RESUME && existsSync(partialPath)) {
      try {
        const existing = JSON.parse(await readFile(partialPath, "utf8")) as {
          attractions: AttractionRecord[];
        };
        if (Array.isArray(existing.attractions)) {
          process.stderr.write(
            `[wd_p1435] pref ${prefix} SKIP (resume, ${existing.attractions.length} cached)\n`,
          );
          continue;
        }
      } catch {
        // fall through to refetch
      }
    }

    const t0 = Date.now();
    const records = await fetchPrefecture(prefix);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(
      `[wd_p1435] pref ${prefix}: ${records.length} attractions in ${elapsed}s\n`,
    );

    await writeFile(
      partialPath,
      JSON.stringify(
        {
          prefecture_prefix: prefix,
          fetched_at: new Date().toISOString(),
          direct_types: DIRECT_TYPES,
          attractions: records,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  // Aggregate per-pref checkpoints into a single side-file. The main merge
  // (into wikidata_attractions.json) is done by a separate script.
  const files = (await readdir(partialDir))
    .filter((f) => /^\d\d\.json$/.test(f))
    .sort();
  const all = new Map<string, AttractionRecord>();
  for (const f of files) {
    const data = JSON.parse(
      await readFile(`${partialDir}${f}`, "utf8"),
    ) as { attractions: AttractionRecord[] };
    for (const r of data.attractions) {
      const cur = all.get(r.qid);
      if (!cur) {
        all.set(r.qid, r);
      } else {
        for (const t of r.types) {
          if (!cur.types.includes(t)) cur.types.push(t);
        }
        if (r.heritage_designations) {
          cur.heritage_designations = cur.heritage_designations ?? [];
          for (const h of r.heritage_designations) {
            if (!cur.heritage_designations.includes(h)) {
              cur.heritage_designations.push(h);
            }
          }
        }
      }
    }
  }
  const records = Array.from(all.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  const sidecarPath = fileURLToPath(
    new URL(
      "../../data/_state/wikidata_attractions_p1435.json",
      import.meta.url,
    ),
  );
  await writeFile(
    sidecarPath,
    JSON.stringify(
      {
        source: { name: "Wikidata SPARQL (P1435 anchor + direct P31 supplement)" },
        fetched_at: new Date().toISOString(),
        started_at: startedAt,
        prefecture_prefixes_fetched: PREFECTURE_PREFIXES,
        total_attractions: records.length,
        attractions: records,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(
    `[wd_p1435] aggregate written: ${sidecarPath} (${records.length} unique items)\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[wd_p1435] FATAL: ${err.stack ?? err}\n`);
  process.exit(1);
});
