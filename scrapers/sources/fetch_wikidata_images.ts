/**
 * Images for Wikidata attractions (DATA_SOURCES.md #50).
 *
 * Two sources, both reached through the entity's own identifier:
 *
 *   1. `wikidata_p18`: the image Wikidata records for the entity (P18).
 *      Preferred-rank statements win, deprecated ones are never used.
 *   2. `wikipedia_lead`: the lead image of the entity's ja / en Wikipedia
 *      article, reached through the entity's sitelink (never a title search).
 *
 * Every candidate file is then read from Wikimedia Commons: a file that is
 * not on Commons (a local, possibly non-free upload), is not a raster photo
 * format, is narrower than MIN_IMAGE_WIDTH, or carries a license outside
 * the allow-list is dropped. What is kept is the thumbnail URL, its size,
 * the Commons file page, the license, the author and a credit line. The
 * image itself is never copied into the dataset.
 *
 * Output: data/images/wikidata_images.json ({ records: [{ qid, images }] }).
 * The file is refused (previous file kept, exit 1) when the result collapses
 * against the file it would replace, or when too many lookups failed.
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikidata_images.ts
 *   LIMIT=500 npx tsx scrapers/sources/fetch_wikidata_images.ts   # first 500 QIDs, local check
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MIN_IMAGE_WIDTH,
  buildCredit,
  htmlToText,
  isAllowedLicense,
  orderSpotImages,
  type ImageSource,
  type SpotImage,
} from "../../src/lib/spot_images.js";
import { assertNotCollapsed, previousRecordCount } from "../lib/r3_write_guard.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const MASTER = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");
const OUT_FILE = resolve(REPO_ROOT, "data/images/wikidata_images.json");

const SPARQL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKI_API = (lang: string) => `https://${lang}.wikipedia.org/w/api.php`;
const USER_AGENT = "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const SPARQL_BATCH = 200;
const API_BATCH = 50;
const DELAY_MS = 300;
const THUMB_WIDTH = 960;
/** More failed lookups than this share and the run is refused, not published. */
const MAX_FAILED_SHARE = 0.05;
const RASTER_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/tiff"]);
const LIMIT = Number(process.env.LIMIT ?? "0");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let calls = 0;
let failedCalls = 0;

async function getJson(url: string, init?: RequestInit): Promise<unknown | null> {
  calls += 1;
  for (let attempt = 1; attempt <= 3; attempt++) {
    await sleep(DELAY_MS);
    try {
      const res = await fetch(url, {
        ...init,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init?.headers ?? {}) },
      });
      if (res.ok) return await res.json();
      if (res.status !== 429 && res.status < 500) break;
    } catch {
      // network error: retry
    }
    await sleep(2000 * attempt);
  }
  failedCalls += 1;
  return null;
}

// ── 1. P18 and sitelinks ────────────────────────────────────────────────

export interface EntityLookup {
  p18: string | null;
  jawiki: string | null;
  enwiki: string | null;
}

interface SparqlRow {
  item?: { value: string };
  img?: { value: string };
  rank?: { value: string };
  jaTitle?: { value: string };
  enTitle?: { value: string };
}

/** Commons file name from a P18 value (`…/Special:FilePath/Name.jpg`). */
export function fileNameFromP18(value: string): string {
  const tail = value.replace(/^.*\/Special:FilePath\//, "");
  return decodeURIComponent(tail).replace(/_/g, " ");
}

const RANK_ORDER: Record<string, number> = { PreferredRank: 0, NormalRank: 1 };

/**
 * Fold SPARQL rows into one lookup per entity. Preferred rank beats normal;
 * deprecated statements are ignored; ties go to the alphabetically first
 * file so reruns pick the same image.
 */
export function foldEntityRows(rows: SparqlRow[]): Map<string, EntityLookup> {
  const best = new Map<string, { file: string; rank: number }>();
  const out = new Map<string, EntityLookup>();
  for (const row of rows) {
    const qid = row.item?.value.replace(/^.*\/entity\//, "");
    if (!qid) continue;
    const cur = out.get(qid) ?? { p18: null, jawiki: null, enwiki: null };
    if (row.jaTitle?.value) cur.jawiki = row.jaTitle.value;
    if (row.enTitle?.value) cur.enwiki = row.enTitle.value;
    if (row.img?.value && row.rank?.value) {
      const rankName = row.rank.value.replace(/^.*#/, "");
      const rank = RANK_ORDER[rankName];
      if (rank !== undefined) {
        const file = fileNameFromP18(row.img.value);
        const prev = best.get(qid);
        if (!prev || rank < prev.rank || (rank === prev.rank && file < prev.file)) {
          best.set(qid, { file, rank });
          cur.p18 = file;
        }
      }
    }
    out.set(qid, cur);
  }
  return out;
}

async function lookupEntities(qids: string[]): Promise<Map<string, EntityLookup>> {
  const out = new Map<string, EntityLookup>();
  for (let i = 0; i < qids.length; i += SPARQL_BATCH) {
    const chunk = qids.slice(i, i + SPARQL_BATCH);
    const query = `SELECT ?item ?img ?rank ?jaTitle ?enTitle WHERE {
  VALUES ?item { ${chunk.map((q) => `wd:${q}`).join(" ")} }
  OPTIONAL { ?item p:P18 ?st . ?st ps:P18 ?img ; wikibase:rank ?rank . }
  OPTIONAL { ?ja schema:about ?item ; schema:isPartOf <https://ja.wikipedia.org/> ; schema:name ?jaTitle . }
  OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?enTitle . }
}`;
    const json = (await getJson(SPARQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: new URLSearchParams({ query }).toString(),
    })) as { results?: { bindings?: SparqlRow[] } } | null;
    for (const [qid, v] of foldEntityRows(json?.results?.bindings ?? [])) out.set(qid, v);
    if ((i / SPARQL_BATCH) % 25 === 0) {
      console.log(`  entities ${Math.min(i + SPARQL_BATCH, qids.length)}/${qids.length}`);
    }
  }
  return out;
}

// ── 2. Wikipedia lead images ────────────────────────────────────────────

interface QueryPages {
  query?: {
    normalized?: Array<{ from: string; to: string }>;
    redirects?: Array<{ from: string; to: string }>;
    pages?: Record<string, { title?: string; pageimage?: string; missing?: string }>;
  };
}

/** Article title → lead image file name, following normalisation and redirects. */
export function leadImagesFromResponse(titles: string[], json: QueryPages | null): Map<string, string> {
  const out = new Map<string, string>();
  const q = json?.query;
  if (!q) return out;
  const hop = new Map<string, string>();
  for (const n of [...(q.normalized ?? []), ...(q.redirects ?? [])]) hop.set(n.from, n.to);
  const byTitle = new Map<string, string>();
  for (const p of Object.values(q.pages ?? {})) {
    if (p.title && p.pageimage) byTitle.set(p.title, p.pageimage.replace(/_/g, " "));
  }
  for (const t of titles) {
    let cur = t;
    for (let i = 0; i < 3 && hop.has(cur); i++) cur = hop.get(cur)!;
    const file = byTitle.get(cur);
    if (file) out.set(t, file);
  }
  return out;
}

async function lookupLeadImages(lang: "ja" | "en", titles: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let i = 0; i < titles.length; i += API_BATCH) {
    const chunk = titles.slice(i, i + API_BATCH);
    const params = new URLSearchParams({
      action: "query",
      titles: chunk.join("|"),
      prop: "pageimages",
      piprop: "name",
      pilicense: "free",
      redirects: "1",
      format: "json",
      formatversion: "1",
    });
    const json = (await getJson(`${WIKI_API(lang)}?${params}`)) as QueryPages | null;
    for (const [t, f] of leadImagesFromResponse(chunk, json)) out.set(t, f);
  }
  return out;
}

// ── 3. Commons file metadata ────────────────────────────────────────────

interface ImageInfo {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  url?: string;
  width?: number;
  height?: number;
  mime?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}

export interface CommonsFile {
  url: string;
  width: number | null;
  height: number | null;
  page_url: string;
  license: string | null;
  license_url: string | null;
  author: string | null;
  attribution_required: boolean | null;
}

/** Drop the tracking parameters Commons appends to thumbnail URLs. */
export function cleanThumbUrl(url: string): string {
  return url.replace(/\?utm_[^#]*$/, "");
}

/**
 * Turn one Commons imageinfo entry into a kept file, or null when it fails
 * a check (format, width, license, missing URL).
 */
export function commonsFileFromInfo(info: ImageInfo | undefined): CommonsFile | null {
  if (!info) return null;
  if (!info.mime || !RASTER_MIMES.has(info.mime)) return null;
  if (!info.width || info.width < MIN_IMAGE_WIDTH) return null;
  const meta = info.extmetadata ?? {};
  const license = htmlToText(meta.LicenseShortName?.value);
  if (!isAllowedLicense(license)) return null;
  const url = info.thumburl ? cleanThumbUrl(info.thumburl) : info.url;
  if (!url || !info.descriptionurl) return null;
  const attr = meta.AttributionRequired?.value;
  return {
    url,
    width: info.thumburl ? info.thumbwidth ?? null : info.width ?? null,
    height: info.thumburl ? info.thumbheight ?? null : info.height ?? null,
    page_url: info.descriptionurl,
    license,
    license_url: htmlToText(meta.LicenseUrl?.value),
    author: htmlToText(meta.Artist?.value),
    attribution_required: attr === "true" ? true : attr === "false" ? false : null,
  };
}

async function lookupCommonsFiles(files: string[]): Promise<Map<string, CommonsFile>> {
  const out = new Map<string, CommonsFile>();
  for (let i = 0; i < files.length; i += API_BATCH) {
    const chunk = files.slice(i, i + API_BATCH);
    const params = new URLSearchParams({
      action: "query",
      titles: chunk.map((f) => `File:${f}`).join("|"),
      prop: "imageinfo",
      iiprop: "url|size|mime|extmetadata",
      iiurlwidth: String(THUMB_WIDTH),
      iiextmetadatafilter: "LicenseShortName|LicenseUrl|Artist|AttributionRequired",
      format: "json",
      formatversion: "1",
    });
    const json = (await getJson(`${COMMONS_API}?${params}`)) as
      | { query?: QueryPages["query"] & { pages?: Record<string, { title?: string; imageinfo?: ImageInfo[]; missing?: string }> } }
      | null;
    const q = json?.query;
    if (!q) continue;
    const hop = new Map<string, string>();
    for (const n of q.normalized ?? []) hop.set(n.from, n.to);
    const byTitle = new Map<string, ImageInfo | undefined>();
    for (const p of Object.values(q.pages ?? {})) {
      if (p.title && p.missing === undefined) byTitle.set(p.title, p.imageinfo?.[0]);
    }
    for (const f of chunk) {
      const asked = `File:${f}`;
      const kept = commonsFileFromInfo(byTitle.get(hop.get(asked) ?? asked));
      if (kept) out.set(f, kept);
    }
    if ((i / API_BATCH) % 50 === 0) console.log(`  commons ${Math.min(i + API_BATCH, files.length)}/${files.length}`);
  }
  return out;
}

// ── main ────────────────────────────────────────────────────────────────

function toImage(file: CommonsFile, source: ImageSource): SpotImage {
  const img: SpotImage = { ...file, source, credit: "" };
  img.credit = buildCredit(img);
  return img;
}

async function main(): Promise<void> {
  const master = JSON.parse(await readFile(MASTER, "utf8")) as { attractions?: Array<{ qid?: string }> };
  let qids = [
    ...new Set((master.attractions ?? []).map((a) => a.qid).filter((q): q is string => !!q && /^Q\d+$/.test(q))),
  ];
  if (LIMIT > 0) qids = qids.slice(0, LIMIT);
  console.log(`[wikidata_images] ${qids.length} entities`);

  const entities = await lookupEntities(qids);
  const ja = [...new Set([...entities.values()].map((e) => e.jawiki).filter((t): t is string => !!t))];
  const en = [...new Set([...entities.values()].map((e) => e.enwiki).filter((t): t is string => !!t))];
  console.log(`[wikidata_images] P18 on ${[...entities.values()].filter((e) => e.p18).length}; articles ja=${ja.length} en=${en.length}`);
  const leadJa = await lookupLeadImages("ja", ja);
  const leadEn = await lookupLeadImages("en", en);

  const wanted = new Set<string>();
  for (const e of entities.values()) {
    if (e.p18) wanted.add(e.p18);
    if (e.jawiki && leadJa.has(e.jawiki)) wanted.add(leadJa.get(e.jawiki)!);
    if (e.enwiki && leadEn.has(e.enwiki)) wanted.add(leadEn.get(e.enwiki)!);
  }
  console.log(`[wikidata_images] ${wanted.size} distinct files to check on Commons`);
  const files = await lookupCommonsFiles([...wanted]);

  const records: Array<{ qid: string; images: SpotImage[] }> = [];
  let withP18 = 0;
  let withLead = 0;
  for (const qid of qids) {
    const e = entities.get(qid);
    if (!e) continue;
    const imgs: SpotImage[] = [];
    const p18 = e.p18 ? files.get(e.p18) : undefined;
    if (p18) {
      imgs.push(toImage(p18, "wikidata_p18"));
      withP18 += 1;
    }
    let lead = false;
    for (const f of [e.jawiki ? leadJa.get(e.jawiki) : undefined, e.enwiki ? leadEn.get(e.enwiki) : undefined]) {
      const file = f ? files.get(f) : undefined;
      if (file) {
        imgs.push(toImage(file, "wikipedia_lead"));
        lead = true;
      }
    }
    if (lead) withLead += 1;
    const ordered = orderSpotImages(imgs);
    if (ordered.length > 0) records.push({ qid, images: ordered });
  }

  const failedShare = calls > 0 ? failedCalls / calls : 0;
  console.log(
    `[wikidata_images] ${records.length}/${qids.length} entities have an image` +
      ` (P18 ${withP18}, lead ${withLead}); ${failedCalls}/${calls} lookups failed`,
  );
  if (failedShare > MAX_FAILED_SHARE) {
    console.error(`[wikidata_images] ${(failedShare * 100).toFixed(1)}% of lookups failed; not writing ${OUT_FILE}`);
    process.exit(1);
  }
  if (LIMIT === 0) {
    const previous = await previousRecordCount("wikidata_images", OUT_FILE);
    assertNotCollapsed("wikidata_images", previous, records.length);
  }

  const out = {
    source: "Wikidata P18 + ja/en Wikipedia lead images, file metadata from Wikimedia Commons",
    fetched_at: new Date().toISOString(),
    fetcher_version: "v1",
    entities_checked: qids.length,
    with_p18: withP18,
    with_wikipedia_lead: withLead,
    records,
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(out));
  await rename(tmp, OUT_FILE);
  console.log(`[wikidata_images] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
