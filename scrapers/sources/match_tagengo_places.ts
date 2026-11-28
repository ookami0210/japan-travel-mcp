/**
 * Places named by official explanatory texts (DATA_SOURCES.md #54).
 *
 * Many 観光庁 多言語解説文 entries (#53) are about a place the attraction
 * master does not hold (摩周湖, 洞爺湖, 河童橋 ...), so the text has no spot to
 * attach to. For each entry whose title names no master attraction in its
 * prefectures, ask the Wikidata query service for items whose Japanese label
 * or alias is exactly that name, in Japan, with coordinates. An item is kept
 * only when:
 *
 *   - it is the only such item whose coordinates fall in one of the entry's
 *     prefectures (nearest municipality centroid within 30 km), and
 *   - when the name is held by more than one item in Japan (八幡神社), the
 *     item's municipality (its P131 label, or the nearest centroid's name)
 *     also appears in the entry's location.
 *
 * Not looked up: entries whose genres are only events, food, local products
 * or crafts (a festival is not a spot). Not kept: administrative units (items
 * with a municipality code, P429), so a text about a whole city adds no spot.
 *
 * Kept items are written in the attraction shape; the server adds them to
 * their prefecture and the entry then links to them by name. Names, types
 * and the English description come from Wikidata (CC0).
 *
 * Politeness: 200 names per SPARQL query, 2 s apart; 50 ids per
 * wbgetentities call; Retry-After honoured (retryDelayMs).
 *
 * Output: data/_state/official_text_places.json, refused when more than 5% of
 * the lookups failed or the result collapses against the file it replaces.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  matchOfficialTexts,
  normalizeName,
  parseTagengoFile,
  titleForms,
  type MatchableEntity,
  type MlitTagengoRecord,
} from "../../src/lib/official_texts.js";
import type { OfficialTextPlace } from "../../src/lib/official_text_places.js";
import { assertNotCollapsed, previousRecordCount } from "../lib/r3_write_guard.js";
import { retryDelayMs } from "./fetch_wikidata_images.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const TAGENGO = resolve(REPO_ROOT, "data/official_texts/mlit_tagengo.json");
const MASTER = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");
const CENTROIDS = resolve(REPO_ROOT, "data/_state/municipality_centroids.json");
const MUNICIPALITIES = resolve(REPO_ROOT, "data/_state/municipalities.json");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/official_text_places.json");

const SPARQL = "https://query.wikidata.org/sparql";
const API = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; official-text places)";
const BATCH = 200;
const MAX_ATTEMPTS = 6;
const MAX_FAILED_SHARE = 0.05;
/** A coordinate farther than this from every municipality centroid is not placed. */
export const MAX_CENTROID_KM = 30;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let calls = 0;
let failedCalls = 0;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown | null> {
  calls += 1;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let retryAfter: string | null = null;
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.headers ?? {}) },
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { error?: { code?: string } };
        // The action API answers a lagged replica with 200 and error=maxlag.
        if (json?.error?.code !== "maxlag") return json;
        retryAfter = res.headers.get("retry-after") ?? "5";
      } else {
        if (res.status !== 429 && res.status < 500) break;
        retryAfter = res.headers.get("retry-after");
      }
    } catch {
      // network error: retry
    }
    if (attempt < MAX_ATTEMPTS) await sleep(retryDelayMs(retryAfter, attempt));
  }
  failedCalls += 1;
  return null;
}

// ── Pure helpers (tested) ───────────────────────────────────────────────

export interface Centroid {
  code: string;
  name: string | null;
  lat: number;
  lng: number;
}

/** The nearest municipality centroid within MAX_CENTROID_KM, or null. */
export function nearestMunicipality(lat: number, lng: number, centroids: Centroid[]): Centroid | null {
  let best: Centroid | null = null;
  let bestKm = Infinity;
  const cos = Math.cos((lat * Math.PI) / 180);
  for (const c of centroids) {
    const dy = (c.lat - lat) * 111;
    const dx = (c.lng - lng) * 111 * cos;
    const km = Math.sqrt(dx * dx + dy * dy);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best && bestKm <= MAX_CENTROID_KM ? best : null;
}

/** Names to ask for, per entry: the title's place forms, short ones only. */
const NON_PLACE_GENRES = new Set(["年中行事", "食・食文化", "地域の特産物", "アート・工芸・芸能"]);

export function placeQueries(r: MlitTagengoRecord): string[] {
  if (r.genres.length > 0 && r.genres.every((g) => NON_PLACE_GENRES.has(g))) return [];
  const out: string[] = [];
  for (const f of [...titleForms(r.title_ja), ...titleForms(r.texts.ja?.title)]) {
    if (f.length <= 30 && !/[\n\r]/.test(f) && !out.includes(f)) out.push(f);
  }
  return out;
}

export interface Hit {
  qid: string;
  lat: number;
  lng: number;
  /** Japanese labels of the item's P131 (located in). */
  admins?: string[];
}

/**
 * The one item a name stands for in this entry, or null. `hits` are all
 * items in Japan with that exact label or alias.
 */
export function choosePlace(
  hits: Hit[],
  entry: { prefecture_codes: string[]; address: string | null },
  centroids: Centroid[],
): { hit: Hit; municipality: Centroid } | null {
  const distinct = new Map<string, Hit>();
  for (const h of hits) {
    const prev = distinct.get(h.qid);
    if (prev) prev.admins = [...new Set([...(prev.admins ?? []), ...(h.admins ?? [])])];
    else distinct.set(h.qid, { ...h, admins: [...(h.admins ?? [])] });
  }
  const inPref: Array<{ hit: Hit; municipality: Centroid }> = [];
  for (const h of distinct.values()) {
    const m = nearestMunicipality(h.lat, h.lng, centroids);
    if (m && entry.prefecture_codes.includes(m.code.slice(0, 2))) inPref.push({ hit: h, municipality: m });
  }
  if (inPref.length !== 1) return null;
  const only = inPref[0];
  if (distinct.size > 1) {
    // A name several places share: the entry's location must name the town.
    const towns = [...(only.hit.admins ?? []), ...(only.municipality.name ? [only.municipality.name] : [])];
    if (!entry.address || !towns.some((t) => entry.address!.includes(t))) return null;
  }
  return only;
}

/** SPARQL for items in Japan, with coordinates, labelled or aliased exactly as one of `names`. */
export function labelQuery(names: string[]): string {
  const vals = names.map((n) => `"${n.replace(/["\\]/g, "")}"@ja`).join(" ");
  return `SELECT ?item ?name ?coord ?admName WHERE {
  VALUES ?name { ${vals} }
  { ?item rdfs:label ?name } UNION { ?item skos:altLabel ?name }
  ?item wdt:P17 wd:Q17 ; wdt:P625 ?coord .
  FILTER NOT EXISTS { ?item wdt:P429 [] }
  OPTIONAL { ?item wdt:P131 ?adm . ?adm rdfs:label ?admName . FILTER(LANG(?admName) = "ja") }
}`;
}

/** Bindings -> name -> hits. */
export function hitsFromBindings(
  bindings: Array<{ item?: { value: string }; name?: { value: string }; coord?: { value: string }; admName?: { value: string } }>,
): Map<string, Hit[]> {
  const out = new Map<string, Hit[]>();
  for (const b of bindings) {
    const qid = b.item?.value.split("/").pop();
    const name = b.name?.value;
    const m = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(b.coord?.value ?? "");
    if (!qid || !/^Q\d+$/.test(qid) || !name || !m) continue;
    const list = out.get(name) ?? [];
    list.push({ qid, lat: Number(m[2]), lng: Number(m[1]), admins: b.admName?.value ? [b.admName.value] : [] });
    out.set(name, list);
  }
  return out;
}

// ── Run ─────────────────────────────────────────────────────────────────

interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  aliases?: Record<string, Array<{ value: string }>>;
  claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>>;
}

async function loadCentroids(): Promise<Centroid[]> {
  const c = JSON.parse(await readFile(CENTROIDS, "utf8")) as { centroids?: Record<string, { lat: number; lng: number }> };
  const m = JSON.parse(await readFile(MUNICIPALITIES, "utf8")) as { municipalities?: Array<{ code: string; name: string }> };
  const names = new Map((m.municipalities ?? []).map((x) => [x.code, x.name]));
  return Object.entries(c.centroids ?? {}).map(([code, p]) => ({ code, name: names.get(code) ?? null, lat: p.lat, lng: p.lng }));
}

async function main(): Promise<void> {
  const records = parseTagengoFile(JSON.parse(await readFile(TAGENGO, "utf8")));
  const master = JSON.parse(await readFile(MASTER, "utf8")) as {
    attractions?: Array<{ qid?: string; prefecture_code?: string; name_ja?: string | null; name_en?: string | null; aliases?: string[] | null; admin_name?: string | null }>;
  };
  const centroids = await loadCentroids();
  const entities: MatchableEntity[] = (master.attractions ?? [])
    .filter((a) => a.qid && a.prefecture_code)
    .map((a) => ({ key: `wd:${a.qid}`, prefecture_code: a.prefecture_code!, names: [a.name_ja, a.name_en, ...(a.aliases ?? [])], municipality: a.admin_name }));
  const linked = matchOfficialTexts(records, entities);
  const open = records.filter((r) => !linked.has(r.entry_id));
  const names = [...new Set(open.flatMap(placeQueries))];
  console.log(`[tagengo_places] ${records.length} entries, ${linked.size} already name an attraction; ${names.length} names to look up`);

  const hits = new Map<string, Hit[]>();
  let batches = 0;
  let failedBatches = 0;
  for (let i = 0; i < names.length; i += BATCH) {
    batches += 1;
    const json = (await fetchJson(SPARQL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/sparql-results+json" },
      body: new URLSearchParams({ query: labelQuery(names.slice(i, i + BATCH)) }).toString(),
    })) as { results?: { bindings?: Parameters<typeof hitsFromBindings>[0] } } | null;
    if (!json) failedBatches += 1;
    for (const [n, h] of hitsFromBindings(json?.results?.bindings ?? [])) hits.set(n, [...(hits.get(n) ?? []), ...h]);
    await sleep(2_000);
  }
  if (batches > 0 && failedBatches / batches > MAX_FAILED_SHARE) {
    throw new Error(`${failedBatches}/${batches} label queries failed; not writing`);
  }

  // entry -> place, first form that resolves.
  const chosen = new Map<string, { qid: string; name: string; municipality: Centroid; admins: string[]; lat: number; lng: number; entries: string[] }>();
  const held = new Set(entities.map((e) => e.key.slice(3)));
  for (const r of open) {
    for (const n of placeQueries(r)) {
      const pick = choosePlace(hits.get(n) ?? [], r, centroids);
      if (!pick) continue;
      const prev = chosen.get(pick.hit.qid);
      if (prev) prev.entries.push(r.entry_id);
      else chosen.set(pick.hit.qid, { qid: pick.hit.qid, name: n, municipality: pick.municipality, admins: pick.hit.admins ?? [], lat: pick.hit.lat, lng: pick.hit.lng, entries: [r.entry_id] });
      break;
    }
  }
  console.log(`[tagengo_places] ${chosen.size} places resolved (${[...chosen.keys()].filter((q) => held.has(q)).length} already in the master under another name)`);

  const ids = [...chosen.keys()];
  const details = new Map<string, WdEntity>();
  for (let i = 0; i < ids.length; i += 50) {
    const params = new URLSearchParams({
      action: "wbgetentities",
      ids: ids.slice(i, i + 50).join("|"),
      props: "labels|descriptions|aliases|claims",
      languages: "ja|en|zh|ko",
      format: "json",
    });
    const json = (await fetchJson(`${API}?${params}`)) as { entities?: Record<string, WdEntity> } | null;
    for (const [q, e] of Object.entries(json?.entities ?? {})) details.set(q, e);
    await sleep(1_000);
  }
  if (calls > 0 && failedCalls / calls > MAX_FAILED_SHARE) throw new Error(`${failedCalls}/${calls} lookups failed; not writing`);
  if (ids.length > 0 && details.size < ids.length * 0.95) throw new Error(`details for ${details.size}/${ids.length} places only; not writing`);
  // Municipality: the item's own P131 when it names a municipality of that
  // prefecture, else the nearest centroid.
  const muniByName = new Map<string, Centroid>();
  for (const c of centroids) if (c.name) muniByName.set(`${c.code.slice(0, 2)}|${c.name}`, c);

  const out: OfficialTextPlace[] = [];
  for (const c of chosen.values()) {
    const e = details.get(c.qid);
    const label = (l: string) => e?.labels?.[l]?.value ?? null;
    const aliases = new Set<string>([c.name]);
    for (const l of ["ja", "en"]) for (const a of e?.aliases?.[l] ?? []) aliases.add(a.value);
    const types = (e?.claims?.P31 ?? []).map((x) => x.mainsnak?.datavalue?.value?.id).filter((x): x is string => !!x);
    out.push({
      qid: c.qid,
      wikidata_url: `https://www.wikidata.org/wiki/${c.qid}`,
      name_ja: label("ja") ?? c.name,
      name_en: label("en"),
      name_zh: label("zh"),
      name_ko: label("ko"),
      description_en: e?.descriptions?.en?.value ?? null,
      coordinates: { lat: c.lat, lng: c.lng },
      ...(() => {
        const pc = c.municipality.code.slice(0, 2);
        const own = c.admins.map((a) => muniByName.get(`${pc}|${a}`)).find((x) => !!x);
        const m = own ?? c.municipality;
        return { prefecture_code: pc, admin_code: m.code, admin_name: m.name };
      })(),
      types,
      aliases: [...aliases].filter((a) => normalizeName(a) !== normalizeName(label("ja") ?? "")),
      source_anchor: "official_text",
      official_entry_ids: c.entries.sort(),
    });
  }
  out.sort((a, b) => a.qid.localeCompare(b.qid));

  const prevCount = await previousRecordCount("official_text_places", OUT_FILE);
  assertNotCollapsed("official_text_places", prevCount, out.length);
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  await writeFile(
    tmp,
    JSON.stringify({
      source: "Wikidata items named by 観光庁 多言語解説文 titles (exact label, same prefecture)",
      fetched_at: new Date().toISOString(),
      fetcher_version: "v1",
      entries_considered: open.length,
      names_looked_up: names.length,
      records: out,
    }),
  );
  await rename(tmp, OUT_FILE);
  console.log(`[tagengo_places] wrote ${out.length} places to ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
