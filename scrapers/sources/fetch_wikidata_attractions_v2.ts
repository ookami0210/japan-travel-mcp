/**
 * v2 of the Wikidata SPARQL attraction fetcher with broader type coverage,
 * type-batching, per-prefecture checkpointing, and RESUME support.
 *
 * Why v2:
 *   v1 (fetch_wikidata_attractions.ts) used 12 type QIDs and missed many
 *   famous landmarks because the P31/P279* recursion didn't reach them
 *   (e.g. 鎌倉大仏 Q177380 is `instance of: 大仏 Q1370978`, which is not a
 *   subclass of "tourist attraction" / "monument" / etc.). The 19-iter
 *   quality push hit a Sat plateau at 24-28% partly because random-r2
 *   showed `coverage failure` (server lacks the asset entirely) was the
 *   dominant failure mode for famous Japanese attractions.
 *
 * Strategy:
 *   - 24 type QIDs, batched 6-per-query to avoid SPARQL timeouts on
 *     dense prefectures (Tokyo / Kyoto have 3000-5000+ items in v1 already).
 *   - Per-prefecture checkpoint to data/_state/wikidata_attractions.partial/<NN>.json
 *   - RESUME=1 skips prefectures with an existing checkpoint (any non-empty file).
 *   - Final: merge all per-pref checkpoints into data/_state/wikidata_attractions.json
 *   - Output is a strict superset of v1 (we only add types).
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 *   RESUME=1 npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 *   WD_PREFECTURES=13,26 npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 */

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const PREFECTURE_PREFIXES =
  process.env.WD_PREFECTURES?.split(",").map((s) => s.trim()).filter(Boolean) ??
  Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));

const RESUME = process.env.RESUME === "1";
const PER_QUERY_LIMIT = Number(process.env.WD_LIMIT ?? "8000");
const TYPE_BATCH_SIZE = Number(process.env.WD_TYPE_BATCH ?? "6");

/**
 * Type QIDs treated as tourist-attraction-like.
 * v1 set is preserved; new entries are documented inline.
 */
const ATTRACTION_TYPES: string[] = [
  // --- v1 (kept verbatim) ---
  "Q570116",   // tourist attraction
  "Q15303351", // historic site
  "Q839954",   // archaeological site
  "Q44613",    // Buddhist temple (monastery)
  "Q845945",   // Shinto shrine
  "Q23413",    // castle
  "Q33506",    // museum
  "Q22698",    // park
  "Q1107656",  // garden
  "Q4989906",  // monument
  "Q4087053",  // natural monument
  "Q174782",   // plaza / square
  // --- v2 additions: natural landmarks ---
  "Q34038",    // waterfall (那智の滝)
  "Q23397",    // lake
  "Q35509",    // cave
  "Q40080",    // beach
  "Q204324",   // volcano
  "Q39816",    // valley / gorge
  "Q46831",    // mountain range
  "Q14888011", // onsen / hot spring resort area
  "Q12536",    // hot spring (geological)
  "Q1542076",  // national park
  // --- v2 additions: cultural landmarks ---
  "Q1370978",  // 大仏 (Daibutsu, large Buddha statue) — 鎌倉大仏 etc.
  "Q488205",   // designated cultural property of Japan (国宝/重文 catch-all)
  "Q1496967",  // pilgrimage site
  "Q15243209", // historic district / preservation district
  "Q3960",     // lighthouse
  "Q1500350",  // resort
  "Q2087181",  // memorial (戦没者慰霊・原爆ドーム類)
  "Q635155",   // theater (歌舞伎座 etc.)
  "Q1248784",  // airport (touristic gateway; rare false positives)
  // --- v2.1 additions: duplicate-concept QIDs spotted in audit ---
  "Q5393308",  // Buddhist temple (alt to Q44613 — Kōtoku-in tagged here)
  "Q697295",   // shrine (alt to Q845945)
  "Q24398318", // religious building (broader)
  "Q830356",   // designated cultural property (alt to Q488205)
  // --- v2.2 additions (post iter30 audit): famous landmarks still missing ---
  // Skipped Q9259 (UNESCO WHS), Q1370598 (Buddhist place of worship),
  // Q11691 (Imperial palace) — caused 504 Gateway Timeout on Wikidata
  // SPARQL when batched with other types. Will pick up the WHS-tagged
  // landmarks via the more-specific type chains.
  "Q8502",     // mountain (Mt. Fuji Q5798 etc.)
  "Q11197",    // active volcano (alt to Q204324)
  "Q16560",    // palace (Kyoto Imperial Palace Q1147029)
  "Q39614",    // Buddhist monastery (alt to Q44613)
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

function buildQuery(prefix: string, types: string[]): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))

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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function fetchPrefecture(
  prefix: string,
): Promise<AttractionRecord[]> {
  const byQid = new Map<string, AttractionRecord>();
  const typeBatches = chunk(ATTRACTION_TYPES, TYPE_BATCH_SIZE);

  for (let bi = 0; bi < typeBatches.length; bi += 1) {
    const batch = typeBatches[bi];
    const query = buildQuery(prefix, batch);

    let attempt = 0;
    let success = false;
    while (attempt < 4 && !success) {
      try {
        const bindings = await querySparql(query);
        processBindings(bindings, byQid);
        process.stderr.write(
          `  pref ${prefix} batch ${bi + 1}/${typeBatches.length} (types ${batch.length}): ${bindings.length} bindings, byQid=${byQid.size}\n`,
        );
        success = true;
      } catch (err) {
        attempt += 1;
        process.stderr.write(
          `  pref ${prefix} batch ${bi + 1} attempt ${attempt} failed: ${(err as Error).message}\n`,
        );
        if (attempt >= 4) {
          // Fall back: split this batch in half
          process.stderr.write(
            `  pref ${prefix} batch ${bi + 1} GIVING UP — splitting types\n`,
          );
          const half = Math.max(1, Math.floor(batch.length / 2));
          const sub = chunk(batch, half);
          for (const subBatch of sub) {
            try {
              const bindings = await querySparql(buildQuery(prefix, subBatch));
              processBindings(bindings, byQid);
              process.stderr.write(
                `    pref ${prefix} sub-batch (${subBatch.length} types): ${bindings.length} bindings\n`,
              );
            } catch (err2) {
              process.stderr.write(
                `    pref ${prefix} sub-batch FAILED: ${(err2 as Error).message}\n`,
              );
            }
            await new Promise((r) => setTimeout(r, 1500));
          }
          success = true;
        } else {
          await new Promise((r) => setTimeout(r, 3000 * attempt));
        }
      }
    }
    // Be nice to the public endpoint between batches.
    await new Promise((r) => setTimeout(r, 600));
  }

  return Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid));
}

async function main(): Promise<void> {
  const partialDir = fileURLToPath(
    new URL("../../data/_state/wikidata_attractions.partial/", import.meta.url),
  );
  await mkdir(partialDir, { recursive: true });

  const startedAt = new Date().toISOString();
  process.stderr.write(
    `[wd_v2] start at ${startedAt} | prefectures=${PREFECTURE_PREFIXES.length} | types=${ATTRACTION_TYPES.length} | type_batch=${TYPE_BATCH_SIZE} | resume=${RESUME}\n`,
  );

  for (const prefix of PREFECTURE_PREFIXES) {
    const partialPath = `${partialDir}${prefix}.json`;
    if (RESUME && existsSync(partialPath)) {
      try {
        const existing = JSON.parse(await readFile(partialPath, "utf8")) as {
          attractions: AttractionRecord[];
        };
        if (Array.isArray(existing.attractions) && existing.attractions.length > 0) {
          process.stderr.write(
            `[wd_v2] pref ${prefix} SKIP (resume, ${existing.attractions.length} cached)\n`,
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
      `[wd_v2] pref ${prefix}: ${records.length} attractions in ${elapsed}s\n`,
    );

    await writeFile(
      partialPath,
      JSON.stringify(
        {
          prefecture_prefix: prefix,
          fetched_at: new Date().toISOString(),
          types: ATTRACTION_TYPES,
          attractions: records,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  // Aggregate all checkpoints into the master file expected by merge_wikidata.ts
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
        // merge types lists across prefs (in case Wikidata multi-locates an item)
        for (const t of r.types) {
          if (!cur.types.includes(t)) cur.types.push(t);
        }
      }
    }
  }
  const records = Array.from(all.values()).sort((a, b) => a.qid.localeCompare(b.qid));

  const byPref: Record<string, number> = {};
  let withEn = 0, withZh = 0, withKo = 0, withCoord = 0;
  for (const r of records) {
    byPref[r.prefecture_code] = (byPref[r.prefecture_code] ?? 0) + 1;
    if (r.name_en) withEn += 1;
    if (r.name_zh) withZh += 1;
    if (r.name_ko) withKo += 1;
    if (r.coordinates) withCoord += 1;
  }
  process.stderr.write(
    `[wd_v2] AGGREGATED total=${records.length} EN=${withEn} ZH=${withZh} KO=${withKo} coord=${withCoord}\n`,
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
      type_count: ATTRACTION_TYPES.length,
      type_batch_size: TYPE_BATCH_SIZE,
      per_query_limit: PER_QUERY_LIMIT,
      license: "CC0",
      fetcher_version: "v2",
    },
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
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
  process.stderr.write(`[wd_v2] saved → ${outPath}\n`);
}

main().catch((err) => {
  console.error("[wd_v2] FAILED:", err);
  process.exit(1);
});
