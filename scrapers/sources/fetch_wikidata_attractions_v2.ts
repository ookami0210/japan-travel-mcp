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
  // Official website (Wikidata P856). Null when the entity carries no P856 —
  // that is an honest "not published on Wikidata", never a guess. This is the
  // per-attraction official page a downstream pass can crawl for hours/pricing.
  official_url: string | null;
  prefecture_code: string;
  admin_code: string | null;
  admin_name: string | null;
  types: string[];
  // Wikidata skos:altLabel values in ja and en. This is where the names
  // people actually use live: 金閣寺 is an alias of 鹿苑寺, 銀閣寺 of 慈照寺,
  // 浅草観音 of 浅草寺. rdfs:label alone carries the formal name only.
  aliases?: string[];
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
  official?: SparqlValue;
}

function buildQuery(prefix: string, types: string[]): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en ?official
WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))

  ?item wdt:P131* ?adminEntity .
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type { ${typesValues} }

  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item wdt:P856 ?official . }
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
        official_url: b.official?.value ?? null,
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
      if (!existing.official_url && b.official) {
        existing.official_url = b.official.value;
      }
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

/**
 * A (prefix, types) query the endpoint could not answer even after the
 * narrowing below. Recorded in the output so a thin prefecture can be told
 * apart from a prefecture that simply has fewer items.
 */
interface DroppedQuery {
  admin_prefix: string;
  types: string[];
  error: string;
}

const RETRIES_PER_QUERY = 3;

/**
 * Run one query with retries. Returns null when every attempt failed; the
 * caller decides how to narrow the question.
 */
async function queryWithRetries(
  prefix: string,
  types: string[],
  label: string,
): Promise<SparqlBinding[] | null> {
  let lastErr = "";
  for (let attempt = 1; attempt <= RETRIES_PER_QUERY; attempt += 1) {
    try {
      return await querySparql(buildQuery(prefix, types));
    } catch (err) {
      lastErr = (err as Error).message;
      process.stderr.write(
        `  ${label} attempt ${attempt} failed: ${lastErr}\n`,
      );
      if (attempt < RETRIES_PER_QUERY) {
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  }
  return null;
}

/**
 * Fetch (prefix, types), narrowing the question until the endpoint answers.
 *
 * Wikidata returns 504 on the dense prefectures (Tokyo, Kanagawa, Aichi)
 * for a six-type batch, and the earlier fallback split the batch in half
 * once and then dropped whatever still failed. Those silent drops are how
 * 浅草寺 went missing from Tokyo for months while the run reported success.
 *
 * Narrowing order:
 *   1. split the type list until a single type remains;
 *   2. for a single type, split the municipality-code prefix one digit
 *      deeper (13 → 130..139), which bounds the P131* walk to a slice of
 *      the prefecture. Codes are five digits, so this is finite.
 * Only a single type on a full five-digit prefix is ever given up on, and
 * that is recorded in `dropped` rather than lost.
 */
async function fetchSlice(
  prefix: string,
  types: string[],
  byQid: Map<string, AttractionRecord>,
  dropped: DroppedQuery[],
  depth = 0,
): Promise<void> {
  const label = `pref ${prefix} types=${types.length}${depth ? ` depth=${depth}` : ""}`;
  const bindings = await queryWithRetries(prefix, types, label);
  await new Promise((r) => setTimeout(r, 600));
  if (bindings) {
    processBindings(bindings, byQid);
    process.stderr.write(
      `  ${label}: ${bindings.length} bindings, byQid=${byQid.size}\n`,
    );
    return;
  }
  if (types.length > 1) {
    const half = Math.ceil(types.length / 2);
    process.stderr.write(`  ${label}: narrowing by type\n`);
    for (const sub of chunk(types, half)) {
      await fetchSlice(prefix, sub, byQid, dropped, depth + 1);
    }
    return;
  }
  if (prefix.length < 5) {
    process.stderr.write(`  ${label}: narrowing by municipality code\n`);
    for (let d = 0; d <= 9; d += 1) {
      await fetchSlice(`${prefix}${d}`, types, byQid, dropped, depth + 1);
    }
    return;
  }
  process.stderr.write(`  ${label}: GIVING UP on this slice\n`);
  dropped.push({ admin_prefix: prefix, types, error: "every attempt failed" });
}

async function fetchPrefecture(
  prefix: string,
): Promise<{ records: AttractionRecord[]; dropped: DroppedQuery[] }> {
  const byQid = new Map<string, AttractionRecord>();
  const dropped: DroppedQuery[] = [];
  for (const batch of chunk(ATTRACTION_TYPES, TYPE_BATCH_SIZE)) {
    await fetchSlice(prefix, batch, byQid, dropped);
  }
  return {
    records: Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid)),
    dropped,
  };
}

/**
 * Attach skos:altLabel (ja, en) to the collected records.
 *
 * Aliases are fetched in a separate pass over the QIDs already collected:
 * joining them into the main query multiplies the DISTINCT rows per item
 * and makes the dense-prefecture timeouts worse. A VALUES list of QIDs with
 * no path expression is cheap, and a batch that fails is retried then
 * skipped (those records keep an empty alias list; nothing else is lost).
 * Set WD_SKIP_ALIASES=1 to skip the pass.
 */
const ALIAS_BATCH = Number(process.env.WD_ALIAS_BATCH ?? "150");

async function attachAliases(records: AttractionRecord[]): Promise<number> {
  const byQid = new Map(records.map((r) => [r.qid, r]));
  const qids = Array.from(byQid.keys());
  let attached = 0;
  const batches = chunk(qids, ALIAS_BATCH);
  for (let i = 0; i < batches.length; i += 1) {
    const values = batches[i].map((q) => `wd:${q}`).join(" ");
    const query = `
SELECT ?item ?alt WHERE {
  VALUES ?item { ${values} }
  ?item skos:altLabel ?alt .
  FILTER(LANG(?alt) IN ("ja", "en"))
}`.trim();
    let bindings: Array<{ item?: SparqlValue; alt?: SparqlValue }> | null = null;
    for (let attempt = 1; attempt <= RETRIES_PER_QUERY && !bindings; attempt += 1) {
      try {
        bindings = (await querySparql(query, 60_000)) as Array<{
          item?: SparqlValue;
          alt?: SparqlValue;
        }>;
      } catch (err) {
        process.stderr.write(
          `  aliases batch ${i + 1}/${batches.length} attempt ${attempt} failed: ${(err as Error).message}\n`,
        );
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    if (!bindings) continue;
    for (const b of bindings) {
      const qid = qidFromUri(b.item?.value ?? "");
      const alt = b.alt?.value?.trim();
      const rec = byQid.get(qid);
      if (!rec || !alt) continue;
      const known = new Set(
        [rec.name_ja, rec.name_en, rec.name_zh, rec.name_ko, ...(rec.aliases ?? [])].filter(
          (x): x is string => !!x,
        ),
      );
      if (known.has(alt)) continue;
      rec.aliases = [...(rec.aliases ?? []), alt];
      attached += 1;
    }
    if ((i + 1) % 50 === 0 || i + 1 === batches.length) {
      process.stderr.write(
        `  aliases: ${i + 1}/${batches.length} batches, ${attached} aliases attached\n`,
      );
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return attached;
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
    const { records, dropped } = await fetchPrefecture(prefix);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(
      `[wd_v2] pref ${prefix}: ${records.length} attractions in ${elapsed}s` +
        (dropped.length ? ` (${dropped.length} slice(s) dropped)` : "") +
        `\n`,
    );

    await writeFile(
      partialPath,
      JSON.stringify(
        {
          prefecture_prefix: prefix,
          fetched_at: new Date().toISOString(),
          types: ATTRACTION_TYPES,
          dropped,
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
  const droppedAll: DroppedQuery[] = [];
  for (const f of files) {
    const data = JSON.parse(
      await readFile(`${partialDir}${f}`, "utf8"),
    ) as { attractions: AttractionRecord[]; dropped?: DroppedQuery[] };
    droppedAll.push(...(data.dropped ?? []));
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

  let aliasesAttached = 0;
  if (process.env.WD_SKIP_ALIASES !== "1") {
    process.stderr.write(`[wd_v2] alias pass over ${records.length} items\n`);
    aliasesAttached = await attachAliases(records);
    process.stderr.write(`[wd_v2] aliases attached: ${aliasesAttached}\n`);
  }

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
        "P856 (official website)",
        "rdfs:label (multilingual)",
        "skos:altLabel (ja, en aliases)",
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
    // Slices the endpoint never answered, after narrowing to a single type
    // on a five-digit municipality prefix. Empty means complete coverage of
    // the type list for every prefecture fetched.
    dropped_queries: droppedAll,
    aliases_attached: aliasesAttached,
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
