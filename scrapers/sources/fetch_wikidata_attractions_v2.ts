/**
 * Wikidata SPARQL attraction fetcher (v2 line).
 *
 * What it does:
 *   - For each prefecture, asks Wikidata for every item whose class (P31,
 *     followed through P279*) is one of the classes in
 *     scrapers/lib/wikidata_attraction_types.ts and whose P131 chain reaches
 *     a municipality with a JIS code (P429) in that prefecture.
 *   - Classes are queried in batches (WD_TYPE_BATCH, default 6).
 *   - When the endpoint cannot answer a (prefecture, classes) question, the
 *     question is narrowed until it can: first by class, then by listing the
 *     prefecture's municipality codes explicitly (see fetchSlice). Anything
 *     still unanswered is recorded in `dropped_queries`, never lost silently.
 *   - A second pass attaches skos:altLabel aliases (金閣寺 for 鹿苑寺).
 *   - Per-prefecture checkpoints go to
 *     data/_state/wikidata_attractions.partial/<NN>.json; RESUME=1 skips
 *     prefectures that already have one.
 *   - The master file data/_state/wikidata_attractions.json is only replaced
 *     when a full run collected at least WD_MIN_KEEP_RATIO (default 0.5) of
 *     the items the previous file held; a collapsed run is written next to it
 *     as wikidata_attractions.rejected.json and the process exits 1.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 *   RESUME=1 npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 *   WD_PREFECTURES=13,26 npx tsx scrapers/sources/fetch_wikidata_attractions_v2.ts
 *
 * Env:
 *   WD_TYPE_BATCH       classes per query (6)
 *   WD_LIMIT            SPARQL LIMIT per query (8000); hitting it counts as
 *                       an unanswered question and triggers narrowing
 *   WD_CODE_CHUNK       municipality codes per narrowed query (8)
 *   WD_RUN_BUDGET_MIN   after this many minutes, stop narrowing and retrying
 *                       and record the rest as dropped (270)
 *   WD_CONCURRENCY      prefectures fetched at the same time (2)
 *   WD_MIN_KEEP_RATIO   see above (0.5)
 *   WD_SKIP_ALIASES=1   skip the alias pass
 */

import { writeFile, mkdir, readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ATTRACTION_TYPE_QIDS } from "../lib/wikidata_attraction_types.js";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const PREFECTURE_PREFIXES =
  process.env.WD_PREFECTURES?.split(",").map((s) => s.trim()).filter(Boolean) ??
  Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));

const RESUME = process.env.RESUME === "1";
const PER_QUERY_LIMIT = Number(process.env.WD_LIMIT ?? "8000");
const TYPE_BATCH_SIZE = Number(process.env.WD_TYPE_BATCH ?? "6");
const CODE_CHUNK = Number(process.env.WD_CODE_CHUNK ?? "8");
const CONCURRENCY = Math.max(1, Number(process.env.WD_CONCURRENCY ?? "2"));
const RUN_BUDGET_MS = Number(process.env.WD_RUN_BUDGET_MIN ?? "270") * 60_000;
const MIN_KEEP_RATIO = Number(process.env.WD_MIN_KEEP_RATIO ?? "0.5");
const FULL_RUN = !process.env.WD_PREFECTURES;
const RUN_STARTED_MS = Date.now();
function withinBudget(): boolean {
  return Date.now() - RUN_STARTED_MS < RUN_BUDGET_MS;
}

// The class list lives in scrapers/lib/wikidata_attraction_types.ts, with
// the Wikidata label of every QID recorded next to it and a script that
// checks the two still agree (scripts/check_wikidata_type_labels.ts).
const ATTRACTION_TYPES: string[] = [...ATTRACTION_TYPE_QIDS];

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

/**
 * One SPARQL question. `codes` null asks for every municipality whose P429
 * code starts with `prefix`; a list of codes asks for exactly those
 * municipalities. The explicit form is what the narrowing falls back to:
 * Wikidata answers "religious sites in these eight Tokyo wards" in seconds
 * while the prefix form for the same wards times out, because the prefix
 * filter cannot drive the join and the class side is evaluated first.
 */
function buildQuery(prefix: string, types: string[], codes: string[] | null = null): string {
  const typesValues = types.map((q) => `wd:${q}`).join(" ");
  const adminClause = codes
    ? `VALUES ?adminCode { ${codes.map((c) => JSON.stringify(c)).join(" ")} }
  ?adminEntity wdt:P429 ?adminCode .`
    : `?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefix}"))`;
  return `
SELECT DISTINCT ?item ?coord ?adminCode ?adminLabel ?type
  ?label_ja ?label_en ?label_zh ?label_ko ?desc_en ?official
WHERE {
  ${adminClause}

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

async function querySparql(query: string, timeoutMs = 70_000): Promise<SparqlBinding[]> {
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
  /** Set when the slice had already been narrowed to explicit P429 codes. */
  admin_codes?: string[];
  types: string[];
  error: string;
}

const RETRIES_PER_QUERY = 3;
const RETRIES_WHEN_NARROWED = 2;

interface QueryOutcome {
  bindings: SparqlBinding[] | null;
  error: string;
  /** The request never reached Wikidata (DNS, connection reset, no route). */
  network: boolean;
}

/**
 * A failure of the connection rather than of the query. Asking a narrower
 * question does nothing for these; waiting does.
 */
function isNetworkError(message: string): boolean {
  return /fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|socket hang up|network/i.test(
    message,
  );
}

/**
 * Run one question with retries. A response that fills the LIMIT is treated
 * as unanswered too: the rows past the limit are missing and nothing in the
 * response says which, so the caller has to ask a narrower question.
 */
async function queryWithRetries(
  prefix: string,
  types: string[],
  codes: string[] | null,
  label: string,
  attempts: number,
): Promise<QueryOutcome> {
  let lastErr = "";
  let network = false;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const bindings = await querySparql(buildQuery(prefix, types, codes));
      if (bindings.length >= PER_QUERY_LIMIT) {
        lastErr = `LIMIT ${PER_QUERY_LIMIT} reached`;
        process.stderr.write(`  ${label}: ${lastErr}, narrowing\n`);
        return { bindings: null, error: lastErr, network: false };
      }
      return { bindings, error: "", network: false };
    } catch (err) {
      lastErr = (err as Error).message;
      network = isNetworkError(lastErr);
      process.stderr.write(
        `  ${label} attempt ${attempt}/${attempts} failed: ${lastErr}\n`,
      );
      if (attempt < attempts) {
        // A connection failure gets a real pause; a slow query gets a short one.
        await new Promise((r) => setTimeout(r, (network ? 20_000 : 3000) * attempt));
      }
    }
  }
  return { bindings: null, error: lastErr, network };
}

const adminCodeCache = new Map<string, string[] | null>();

/**
 * Every P429 code under `prefix`, as Wikidata has them (six digits, the
 * prefecture's own code first since it is the heaviest to walk). Null when
 * Wikidata could not even answer that.
 */
async function listAdminCodes(prefix: string): Promise<string[] | null> {
  if (adminCodeCache.has(prefix)) return adminCodeCache.get(prefix) ?? null;
  const query = `
SELECT DISTINCT ?c WHERE {
  ?e wdt:P429 ?c .
  FILTER(STRSTARTS(?c, "${prefix}"))
} ORDER BY ?c`.trim();
  let codes: string[] | null = null;
  for (let attempt = 1; attempt <= RETRIES_PER_QUERY && codes === null; attempt += 1) {
    try {
      const rows = (await querySparql(query, 60_000)) as Array<{ c?: SparqlValue }>;
      codes = rows.map((r) => r.c?.value ?? "").filter((c) => c.length > 0);
    } catch (err) {
      process.stderr.write(
        `  pref ${prefix}: listing P429 codes attempt ${attempt} failed: ${(err as Error).message}\n`,
      );
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (codes) {
    const isPrefectureLevel = (c: string) => /^\d\d000\d$/.test(c);
    codes.sort((a, b) =>
      Number(isPrefectureLevel(b)) - Number(isPrefectureLevel(a)) || a.localeCompare(b),
    );
  }
  adminCodeCache.set(prefix, codes);
  return codes;
}

/**
 * Split a municipality-code list into chunks, keeping prefecture-level
 * codes (the whole prefecture as one P131 target) in chunks of their own.
 */
function chunkCodes(codes: string[]): string[][] {
  const pref = codes.filter((c) => /^\d\d000\d$/.test(c));
  const rest = codes.filter((c) => !/^\d\d000\d$/.test(c));
  return [...pref.map((c) => [c]), ...chunk(rest, CODE_CHUNK)];
}

/**
 * Fetch one (prefecture, classes) question, narrowing it until Wikidata
 * answers or nothing narrower is left to ask.
 *
 * Wikidata gives up after 60 s. For the dense prefectures (Tokyo, Kanagawa,
 * Aichi, Osaka) a six-class batch over the whole prefecture is past that,
 * and the earlier fallback, which split the type list once and then dropped
 * whatever still failed, is how 浅草寺 went missing from Tokyo for months
 * while the run reported success.
 *
 * Narrowing order:
 *   1. split the class list in halves until a single class remains;
 *   2. for a single class, list the prefecture's P429 codes and ask for
 *      them explicitly, WD_CODE_CHUNK at a time, halving a chunk that still
 *      fails down to a single municipality.
 * A single class on a single municipality that still fails is recorded in
 * `dropped`. The narrowing is bounded: a prefecture has at most a few dozen
 * codes, so the fan-out is tens of questions, not thousands. (An earlier
 * version split the code *prefix* one digit at a time, which asked for
 * codes that do not exist and took five hours on Tokyo alone.)
 *
 * Two things are not narrowed: a connection failure (narrowing cannot fix
 * the network; the question is retried after a pause and then dropped), and
 * anything once the run is past WD_RUN_BUDGET_MIN (one attempt, then
 * dropped), so the job finishes with an honest record of what it could not
 * get rather than being killed by the workflow timeout.
 */
interface PrefectureContext {
  byQid: Map<string, AttractionRecord>;
  dropped: DroppedQuery[];
  /**
   * Set once a prefecture-wide question has timed out. From then on every
   * batch for this prefecture is asked per municipality straight away: the
   * prefecture is evidently too dense for the wide form, and each further
   * wide attempt costs a minute before it fails.
   */
  wideFailed: boolean;
}

async function fetchSlice(
  prefix: string,
  types: string[],
  codes: string[] | null,
  ctx: PrefectureContext,
  depth = 0,
): Promise<void> {
  const { byQid, dropped } = ctx;
  const scope = codes ? `pref ${prefix} codes=${codes.length}` : `pref ${prefix}`;
  const label = `${scope} types=${types.length}${depth ? ` depth=${depth}` : ""}`;
  if (!codes && ctx.wideFailed && withinBudget()) {
    const all = await listAdminCodes(prefix);
    if (all && all.length > 0) {
      process.stderr.write(`  ${label}: asking per municipality (${all.length} codes)\n`);
      for (const part of chunkCodes(all)) {
        await fetchSlice(prefix, types, part, ctx, depth + 1);
      }
      return;
    }
  }
  const attempts = !withinBudget() ? 1 : depth === 0 ? RETRIES_PER_QUERY : RETRIES_WHEN_NARROWED;
  const outcome = await queryWithRetries(prefix, types, codes, label, attempts);
  await new Promise((r) => setTimeout(r, 600));
  if (outcome.bindings) {
    processBindings(outcome.bindings, byQid);
    process.stderr.write(
      `  ${label}: ${outcome.bindings.length} bindings, byQid=${byQid.size}\n`,
    );
    return;
  }
  const giveUp = (why: string) => {
    process.stderr.write(`  ${label}: GIVING UP (${why})\n`);
    dropped.push({
      admin_prefix: prefix,
      ...(codes ? { admin_codes: codes } : {}),
      types,
      error: why,
    });
  };
  if (outcome.network) {
    giveUp(`network: ${outcome.error}`);
    return;
  }
  if (!withinBudget()) {
    giveUp(`run budget exhausted; last error: ${outcome.error}`);
    return;
  }
  if (!codes) ctx.wideFailed = true;
  if (types.length > 1) {
    const half = Math.ceil(types.length / 2);
    process.stderr.write(`  ${label}: narrowing by type\n`);
    for (const sub of chunk(types, half)) {
      await fetchSlice(prefix, sub, codes, ctx, depth + 1);
    }
    return;
  }
  if (!codes) {
    const all = await listAdminCodes(prefix);
    if (!all || all.length === 0) {
      giveUp(`could not list P429 codes; last error: ${outcome.error}`);
      return;
    }
    process.stderr.write(
      `  ${label}: narrowing to ${all.length} explicit municipality codes\n`,
    );
    for (const part of chunkCodes(all)) {
      await fetchSlice(prefix, types, part, ctx, depth + 1);
    }
    return;
  }
  if (codes.length > 1) {
    const half = Math.ceil(codes.length / 2);
    process.stderr.write(`  ${label}: narrowing by municipality\n`);
    for (const part of chunk(codes, half)) {
      await fetchSlice(prefix, types, part, ctx, depth + 1);
    }
    return;
  }
  giveUp(outcome.error);
}

async function fetchPrefecture(
  prefix: string,
): Promise<{ records: AttractionRecord[]; dropped: DroppedQuery[] }> {
  const ctx: PrefectureContext = {
    byQid: new Map<string, AttractionRecord>(),
    dropped: [],
    wideFailed: false,
  };
  for (const batch of chunk(ATTRACTION_TYPES, TYPE_BATCH_SIZE)) {
    await fetchSlice(prefix, batch, null, ctx);
  }
  return {
    records: Array.from(ctx.byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid)),
    dropped: ctx.dropped,
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
    `[wd_v2] start at ${startedAt} | prefectures=${PREFECTURE_PREFIXES.length} | types=${ATTRACTION_TYPES.length} | type_batch=${TYPE_BATCH_SIZE} | code_chunk=${CODE_CHUNK} | budget_min=${RUN_BUDGET_MS / 60_000} | resume=${RESUME}\n`,
  );

  const processPrefecture = async (prefix: string): Promise<void> => {
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
          return;
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
  };

  // A small pool: Wikidata tolerates a couple of parallel queries from one
  // client, and the dense prefectures would otherwise set the wall time alone.
  const queue = [...PREFECTURE_PREFIXES];
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let prefix = queue.shift(); prefix !== undefined; prefix = queue.shift()) {
        await processPrefecture(prefix);
      }
    }),
  );

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

  const outPath = fileURLToPath(
    new URL("../../data/_state/wikidata_attractions.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });

  // A full run that collected far fewer items than the file it would replace
  // is a broken run, not a smaller Japan. Keep the previous file. (The
  // previous file may also carry items the P1435 heritage merge added after
  // the class fetch, which is why the ratio is lenient.)
  if (FULL_RUN && existsSync(outPath)) {
    let previousCount = 0;
    try {
      const prev = JSON.parse(await readFile(outPath, "utf8")) as {
        attractions?: unknown[];
        total_attractions?: number;
      };
      previousCount = prev.attractions?.length ?? prev.total_attractions ?? 0;
    } catch {
      previousCount = 0;
    }
    if (previousCount > 0 && records.length < previousCount * MIN_KEEP_RATIO) {
      const rejectedPath = outPath.replace(/\.json$/, ".rejected.json");
      await writeFile(
        rejectedPath,
        JSON.stringify(
          { collected: records.length, previous: previousCount, dropped_queries: droppedAll },
          null,
          2,
        ),
        "utf8",
      );
      throw new Error(
        `collected ${records.length} attractions but the current file holds ${previousCount}; ` +
          `refusing to replace it (WD_MIN_KEEP_RATIO=${MIN_KEEP_RATIO}). Details: ${rejectedPath}`,
      );
    }
  }

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
      fetcher_version: "v2.3",
    },
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
    prefecture_prefixes_fetched: PREFECTURE_PREFIXES,
    // Questions Wikidata never answered, after narrowing to a single class
    // on a single municipality (or cut short by WD_RUN_BUDGET_MIN). Empty
    // means complete coverage of the class list for every prefecture fetched.
    dropped_queries: droppedAll,
    aliases_attached: aliasesAttached,
    total_attractions: records.length,
    multilingual_coverage: { en: withEn, zh: withZh, ko: withKo },
    coordinate_coverage: withCoord,
    attractions: records,
  };

  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    `[wd_v2] saved → ${outPath} (${records.length} attractions, ${droppedAll.length} dropped question(s))\n`,
  );
}

main().catch((err) => {
  console.error("[wd_v2] FAILED:", err);
  process.exit(1);
});
