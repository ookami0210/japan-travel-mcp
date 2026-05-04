/**
 * Prefecture name → JIS code matcher.
 *
 * Used by R-3 source fetchers (MAFF GI, METI traditional crafts, Japan Heritage)
 * to extract prefecture codes from free-text "production area" / "designated
 * region" fields published on official sites.
 *
 * Source of truth: data/knowledge/taxonomies/japan_regions.json
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

interface PrefectureRow {
  code: string;
  name_ja: string;
  name_en: string;
}

let cache: PrefectureRow[] | null = null;

async function loadPrefectures(): Promise<PrefectureRow[]> {
  if (cache) return cache;
  const path = fileURLToPath(
    new URL(
      "../../data/knowledge/taxonomies/japan_regions.json",
      import.meta.url,
    ),
  );
  const raw = JSON.parse(await readFile(path, "utf8")) as {
    prefectures: PrefectureRow[];
  };
  cache = raw.prefectures;
  return cache;
}

/**
 * Find every prefecture mentioned in `text`. Returns JIS codes in the order
 * they first appear in the input. Matches both 「青森県」 and 「青森」 (no suffix),
 * as well as 「東京都」「大阪府」「京都府」「北海道」.
 */
export async function matchPrefectures(text: string): Promise<string[]> {
  if (!text) return [];
  const prefs = await loadPrefectures();
  const found = new Map<string, number>(); // code → first index
  for (const p of prefs) {
    const stems = [p.name_ja];
    // Add the bare stem (e.g. 青森 from 青森県) for fuzzy matches in long prose.
    // Keep 北海道/東京都/大阪府/京都府 intact because their suffix is part of
    // the conventional name; bare stems would over-match (e.g. "京都" appears
    // in "東京都" → false positive). Only add bare stems for ○○県 prefectures.
    if (p.name_ja.endsWith("県")) {
      stems.push(p.name_ja.slice(0, -1));
    }
    for (const stem of stems) {
      const idx = text.indexOf(stem);
      if (idx >= 0) {
        const prev = found.get(p.code);
        if (prev === undefined || idx < prev) found.set(p.code, idx);
        break;
      }
    }
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);
}

/** Synchronous variant that takes a pre-loaded prefecture list. */
export function matchPrefecturesSync(
  text: string,
  prefs: PrefectureRow[],
): string[] {
  if (!text) return [];
  const found = new Map<string, number>();
  for (const p of prefs) {
    const stems = [p.name_ja];
    if (p.name_ja.endsWith("県")) stems.push(p.name_ja.slice(0, -1));
    for (const stem of stems) {
      const idx = text.indexOf(stem);
      if (idx >= 0) {
        const prev = found.get(p.code);
        if (prev === undefined || idx < prev) found.set(p.code, idx);
        break;
      }
    }
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);
}

export async function loadPrefectureRows(): Promise<PrefectureRow[]> {
  return loadPrefectures();
}

interface MunicipalityRow {
  code: string;
  prefecture_code: string;
  prefecture_name: string;
  name: string;
}

let muniCache: MunicipalityRow[] | null = null;

export async function loadMunicipalityRows(): Promise<MunicipalityRow[]> {
  if (muniCache) return muniCache;
  const path = fileURLToPath(
    new URL("../../data/_state/municipalities.json", import.meta.url),
  );
  const raw = JSON.parse(await readFile(path, "utf8")) as {
    municipalities: MunicipalityRow[];
  };
  muniCache = raw.municipalities;
  return muniCache;
}

/**
 * Find prefecture codes by matching municipality names in `text`.
 * Falls back to ambiguous-municipality handling: when the same municipality
 * name exists in multiple prefectures (e.g. 府中市 in Tokyo and Hiroshima),
 * we include all matches — caller can dedup with prefecture-level matches.
 *
 * Long names (e.g. "西置賜郡白鷹町") are tried first so the substring
 * "白鷹町" doesn't match before the full county-prefixed form.
 */
export function matchPrefecturesByMunicipalitiesSync(
  text: string,
  munis: MunicipalityRow[],
): string[] {
  if (!text) return [];
  const found = new Map<string, number>();
  // Longest first so "○○郡△△町" matches before "△△町".
  const sorted = [...munis].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const idx = text.indexOf(m.name);
    if (idx >= 0) {
      const prev = found.get(m.prefecture_code);
      if (prev === undefined || idx < prev) found.set(m.prefecture_code, idx);
    }
  }
  return [...found.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([code]) => code);
}

/**
 * Combined extractor for free-text "production area" fields.
 *
 * Rule:
 *   - If the text explicitly names one or more prefectures (○○県 / ○○府 /
 *     北海道 / 東京都), use ONLY those — drop ambiguous municipality matches.
 *     Example: "滋賀県蒲生郡日野町" → only [25 (Shiga)], not [25, 31] —
 *     because 日野町 also exists in Tottori (31), but the text is unambiguous.
 *   - Otherwise (text contains only municipality names), fall back to
 *     municipality-name lookup. Multiple matches are returned (e.g. 府中市
 *     in both Tokyo and Hiroshima will produce both codes — caller must
 *     handle the ambiguity, but at least no information is lost).
 */
export function extractPrefectureCodes(
  text: string,
  prefRows: PrefectureRow[],
  muniRows: MunicipalityRow[],
): string[] {
  const byPrefName = matchPrefecturesSync(text, prefRows);
  if (byPrefName.length > 0) return byPrefName;
  return matchPrefecturesByMunicipalitiesSync(text, muniRows);
}
