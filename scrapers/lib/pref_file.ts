/**
 * Prefecture-file merge + write, shared by the steady scraper and repair
 * tooling.
 *
 * HISTORY / WHY THIS EXISTS: the nightly scraper used to rebuild each
 * prefecture file from scratch ({prefecture, municipalities, ...} only).
 * Combined with CI runners that start with no local prefecture files, every
 * re-scraped prefecture lost (a) its top-level `wikidata_attractions` layer
 * and (b) every municipality block NOT scraped that same night. Consumers
 * reading the raw dataset saw prefectures shrink to "last night's scrape".
 * The merge below is preservation-first: existing top-level fields survive,
 * municipalities are unioned by code, and only fresher blocks replace
 * existing ones.
 */

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { classifySpot } from "./spot_category.js";

export interface PrefFileSpot {
  id?: string;
  name?: string;
  description?: string | null;
  /** Coarse category — extractor-set, else backfilled deterministically. */
  category?: string | null;
  last_scraped_at?: string;
  /** JIS municipality code — stamped at merge time for area joins. */
  area_id?: string;
  [key: string]: unknown;
}

export interface PrefFileMuniBlock {
  municipality: { code: string; [key: string]: unknown };
  spots?: PrefFileSpot[];
  [key: string]: unknown;
}

export interface PrefFileShape {
  prefecture?: { code: string; name: string; name_en?: string };
  data_as_of?: string;
  municipalities?: PrefFileMuniBlock[];
  wikidata_attractions?: unknown[];
  [key: string]: unknown;
}

/** Newest spot timestamp in a block — used to decide which duplicate wins. */
export function blockRecency(block: PrefFileMuniBlock): string {
  let newest = "";
  for (const s of block.spots ?? []) {
    const t = s.last_scraped_at ?? "";
    if (t > newest) newest = t;
  }
  return newest;
}

/** Stamp spot.area_id (JIS muni code) so raw-file consumers can join by area. */
export function stampAreaIds(block: PrefFileMuniBlock): void {
  const code = block.municipality?.code;
  if (!code) return;
  for (const s of block.spots ?? []) {
    if (s && typeof s === "object" && s.area_id === undefined) s.area_id = code;
  }
}

/** Backfill spot.category deterministically from name/description (see
 *  spot_category.ts). Only fills nulls — a category the extractor set from
 *  an explicit page signal always wins. */
export function stampCategories(block: PrefFileMuniBlock): void {
  for (const s of block.spots ?? []) {
    if (!s || typeof s !== "object") continue;
    if (s.category === undefined || s.category === null) {
      const c = classifySpot(
        s.name as string | undefined,
        s.description as string | undefined,
      );
      if (c) s.category = c;
    }
  }
}

/**
 * Merge fresh municipality blocks into an existing prefecture file.
 *
 * - Every top-level field of `existing` is preserved (wikidata_attractions,
 *   disclaimers, future fields — anything).
 * - Municipalities are unioned by code; an incoming block replaces the
 *   existing one only when it is at least as recent (by newest spot
 *   timestamp), so replaying an old night can never erase newer data.
 * - area_id is stamped on all incoming spots.
 */
export function mergePrefectureFile(
  existing: PrefFileShape | null,
  incoming: {
    prefCode: string;
    prefName: string;
    slug: string;
    results: PrefFileMuniBlock[];
    source?: string;
    disclaimer?: string;
  },
): PrefFileShape {
  const byCode = new Map<string, PrefFileMuniBlock>();
  for (const b of existing?.municipalities ?? []) {
    if (b?.municipality?.code) byCode.set(b.municipality.code, b);
  }
  for (const b of incoming.results) {
    const code = b?.municipality?.code;
    if (!code) continue;
    stampAreaIds(b);
    stampCategories(b);
    const prev = byCode.get(code);
    if (!prev || blockRecency(b) >= blockRecency(prev)) byCode.set(code, b);
  }

  return {
    // Preservation-first: carry over EVERYTHING the file already had.
    ...(existing ?? {}),
    prefecture: existing?.prefecture ?? {
      code: incoming.prefCode,
      name: incoming.prefName,
      name_en: incoming.slug,
    },
    data_as_of: new Date().toISOString(),
    source:
      (existing?.source as string | undefined) ??
      incoming.source ??
      "https://github.com/ookami0210/japan-travel-mcp",
    disclaimer:
      (existing?.disclaimer as string | undefined) ??
      incoming.disclaimer ??
      "Data sourced from public websites. Verify directly with the property before making decisions.",
    municipalities: Array.from(byCode.values()).sort((a, b) =>
      a.municipality.code.localeCompare(b.municipality.code),
    ),
  };
}

export async function readPrefFile(path: string): Promise<PrefFileShape | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PrefFileShape;
  } catch {
    return null;
  }
}

/** Atomic write (temp + rename) — a mid-write kill must not truncate. */
export async function writePrefFileAtomic(
  path: string,
  file: PrefFileShape,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(file, null, 2), "utf8");
  await rename(tmp, path);
}
