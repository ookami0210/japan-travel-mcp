/**
 * The spot image layer (DATA_SOURCES.md #50).
 *
 * One shape for every image a spot can carry, whatever it came from:
 *
 *   - `wikidata_p18`:   the image Wikidata itself records for the entity (P18)
 *   - `wikipedia_lead`: the lead image of the entity's own ja / en Wikipedia
 *                       article, reached through the Wikidata sitelink
 *   - `official_site`:  the representative image of the entity's official page
 *   - `municipal_page`: the representative image of the municipal or tourism
 *                       association page the spot was scraped from
 *
 * Every image is tied to its spot by an identifier or a page the spot already
 * holds; nothing is found by searching for the spot's name. The dataset ships
 * the image URL and where it came from, never the image itself: each image
 * stays under its own license (`license` is null when the page states none),
 * and `credit` is the line a consumer shows next to it.
 *
 * Files are optional. A dataset without them simply has no images.
 */

import { readFile } from "node:fs/promises";

export type ImageSource = "wikidata_p18" | "wikipedia_lead" | "official_site" | "municipal_page";

/** Order in which a spot's images are listed: the first is its primary image. */
export const IMAGE_SOURCE_ORDER: readonly ImageSource[] = [
  "wikidata_p18",
  "wikipedia_lead",
  "official_site",
  "municipal_page",
];

export interface SpotImage {
  url: string;
  width: number | null;
  height: number | null;
  source: ImageSource;
  /** The page the image was read from (Commons file page, article, official or municipal page). */
  page_url: string;
  /** Short license name ("CC BY-SA 4.0", "CC0", "Public domain"); null when the page states none. */
  license: string | null;
  license_url: string | null;
  author: string | null;
  attribution_required: boolean | null;
  /** One line to show with the image. */
  credit: string;
}

/** At most this many images are kept per spot. */
export const MAX_IMAGES_PER_SPOT = 3;
/** Narrower originals are not kept: they are icons, crops or scans of a label. */
export const MIN_IMAGE_WIDTH = 400;

const SOURCES = new Set<string>(IMAGE_SOURCE_ORDER);

/**
 * Licenses a Wikimedia image may carry to be kept. Commons only hosts free
 * files, but a short name outside this list (a trademark notice, an unusual
 * GFDL-only file) is dropped rather than guessed at.
 */
export function isAllowedLicense(shortName: string | null | undefined): boolean {
  if (!shortName) return false;
  const s = shortName.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (s === "cc0" || s.startsWith("cc0 ")) return true;
  if (s.startsWith("public domain") || s === "pd" || s.startsWith("pd ")) return true;
  return /^cc by( sa)? \d(\.\d)?/.test(s);
}

/** Commons metadata values are HTML fragments; keep their text. */
export function htmlToText(html: string | null | undefined): string | null {
  if (!html) return null;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

/** The credit line for an image, from what it carries. */
export function buildCredit(img: Pick<SpotImage, "source" | "author" | "license" | "page_url">): string {
  if (img.source === "wikidata_p18" || img.source === "wikipedia_lead") {
    const who = img.author ?? "Wikimedia Commons";
    return img.license ? `Photo: ${who} / ${img.license} (Wikimedia Commons)` : `Photo: ${who} (Wikimedia Commons)`;
  }
  let host = img.page_url;
  try {
    host = new URL(img.page_url).host;
  } catch {
    // keep the raw value
  }
  return `Source: ${host}`;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/**
 * Read-side check of one image record. Anything that is not an http(s) URL
 * with a known source and a page it came from is dropped; a missing credit is
 * rebuilt rather than trusted.
 */
export function normalizeSpotImage(raw: unknown): SpotImage | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const url = asString(r.url);
  const pageUrl = asString(r.page_url);
  const source = asString(r.source);
  if (!url || !/^https?:\/\//i.test(url)) return null;
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) return null;
  if (!source || !SOURCES.has(source)) return null;
  const width = asNumber(r.width);
  if (width !== null && width < MIN_IMAGE_WIDTH) return null;
  const img: SpotImage = {
    url,
    width,
    height: asNumber(r.height),
    source: source as ImageSource,
    page_url: pageUrl,
    license: asString(r.license),
    license_url: asString(r.license_url),
    author: asString(r.author),
    attribution_required: typeof r.attribution_required === "boolean" ? r.attribution_required : null,
    credit: "",
  };
  if ((img.source === "wikidata_p18" || img.source === "wikipedia_lead") && !isAllowedLicense(img.license)) {
    return null;
  }
  img.credit = asString(r.credit) ?? buildCredit(img);
  return img;
}

/**
 * Order a spot's images by source, drop repeats of the same file and keep
 * at most MAX_IMAGES_PER_SPOT. A Wikipedia lead image is usually the P18
 * image again; the P18 entry wins.
 */
export function orderSpotImages(images: SpotImage[]): SpotImage[] {
  const rank = (s: ImageSource) => IMAGE_SOURCE_ORDER.indexOf(s);
  const sorted = [...images].sort((a, b) => rank(a.source) - rank(b.source));
  const seen = new Set<string>();
  const out: SpotImage[] = [];
  for (const img of sorted) {
    const key = fileKey(img);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(img);
    if (out.length >= MAX_IMAGES_PER_SPOT) break;
  }
  return out;
}

/** Same file regardless of thumbnail width or query string. */
function fileKey(img: SpotImage): string {
  if (img.page_url.includes("commons.wikimedia.org/wiki/File:")) return img.page_url;
  return img.url.replace(/[?#].*$/, "");
}

/** One record of an image layer file. */
export interface SpotImageRecord {
  /** `wd:Q…` for Wikidata entities. */
  key: string;
  images: SpotImage[];
}

/**
 * Parse one image layer file (`{ records: [{ key | qid, images }] }`) into
 * key → images. Torn or unknown records are skipped.
 */
export function parseSpotImageFile(json: unknown): Map<string, SpotImage[]> {
  const map = new Map<string, SpotImage[]>();
  const records = (json as { records?: unknown })?.records;
  if (!Array.isArray(records)) return map;
  for (const rec of records) {
    if (!rec || typeof rec !== "object") continue;
    const r = rec as Record<string, unknown>;
    const key = asString(r.key) ?? (asString(r.qid) ? `wd:${asString(r.qid)}` : null);
    if (!key || !Array.isArray(r.images)) continue;
    const imgs = r.images.map(normalizeSpotImage).filter((x): x is SpotImage => x !== null);
    if (imgs.length === 0) continue;
    map.set(key, [...(map.get(key) ?? []), ...imgs]);
  }
  return map;
}

let cached: Map<string, SpotImage[]> | null = null;

/**
 * Load every image layer file and merge them by key. A missing or unreadable
 * file contributes nothing; the server runs without images.
 */
export async function loadSpotImages(paths: string[]): Promise<Map<string, SpotImage[]>> {
  if (cached) return cached;
  const merged = new Map<string, SpotImage[]>();
  for (const path of paths) {
    let parsed: Map<string, SpotImage[]>;
    try {
      parsed = parseSpotImageFile(JSON.parse(await readFile(path, "utf8")));
    } catch {
      continue;
    }
    for (const [key, imgs] of parsed) merged.set(key, [...(merged.get(key) ?? []), ...imgs]);
  }
  for (const [key, imgs] of merged) merged.set(key, orderSpotImages(imgs));
  cached = merged;
  return merged;
}

export function clearSpotImagesCache(): void {
  cached = null;
}

/** Attach each Wikidata attraction's images (`a.images`). Returns how many got one. */
export function applySpotImagesToAttractions(
  attractions: Array<{ qid?: string; images?: SpotImage[] }>,
  images: Map<string, SpotImage[]>,
): number {
  let applied = 0;
  for (const a of attractions) {
    if (!a.qid) continue;
    const imgs = images.get(`wd:${a.qid}`);
    if (!imgs || imgs.length === 0) continue;
    a.images = imgs;
    applied += 1;
  }
  return applied;
}
