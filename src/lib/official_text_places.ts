/**
 * Places named by official explanatory texts (DATA_SOURCES.md #54).
 *
 * Many 観光庁 多言語解説文 entries (#53) are about a place the attraction
 * master does not hold (摩周湖, 洞爺湖, 河童橋 ...). `match_tagengo_places.ts`
 * resolves such a title to the Wikidata item with exactly that label in the
 * entry's prefecture and writes it here in the attraction shape. The server
 * adds these items to their prefecture at load time, so they are spots like
 * any other, and the entry then links to them by name.
 */

import { readFile } from "node:fs/promises";

export interface OfficialTextPlace {
  qid: string;
  wikidata_url: string;
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  description_en: string | null;
  coordinates: { lat: number; lng: number };
  prefecture_code: string;
  admin_code: string | null;
  admin_name: string | null;
  types: string[];
  aliases: string[];
  source_anchor: "official_text";
  /** The explanatory-text entries whose title named this place. */
  official_entry_ids: string[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

export function normalizeOfficialTextPlace(raw: unknown): OfficialTextPlace | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const qid = str(r.qid);
  const pc = str(r.prefecture_code);
  const c = r.coordinates as { lat?: unknown; lng?: unknown } | null | undefined;
  if (!qid || !/^Q\d+$/.test(qid) || !pc || !/^\d{2}$/.test(pc)) return null;
  if (!c || typeof c.lat !== "number" || typeof c.lng !== "number") return null;
  const nameJa = str(r.name_ja);
  const nameEn = str(r.name_en);
  if (!nameJa && !nameEn) return null;
  return {
    qid,
    wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
    name_ja: nameJa,
    name_en: nameEn,
    name_zh: str(r.name_zh),
    name_ko: str(r.name_ko),
    description_en: str(r.description_en),
    coordinates: { lat: c.lat, lng: c.lng },
    prefecture_code: pc,
    admin_code: str(r.admin_code),
    admin_name: str(r.admin_name),
    types: strList(r.types),
    aliases: strList(r.aliases),
    source_anchor: "official_text",
    official_entry_ids: strList(r.official_entry_ids),
  };
}

export function parseOfficialTextPlaces(json: unknown): OfficialTextPlace[] {
  const recs = (json as { records?: unknown } | null)?.records;
  if (!Array.isArray(recs)) return [];
  const out: OfficialTextPlace[] = [];
  for (const r of recs) {
    const n = normalizeOfficialTextPlace(r);
    if (n) out.push(n);
  }
  return out;
}

/** Read the file; a missing or unreadable file is no places. */
export async function loadOfficialTextPlaces(path: string): Promise<OfficialTextPlace[]> {
  try {
    return parseOfficialTextPlaces(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return [];
  }
}

/**
 * Add each place to its prefecture's attractions. A place whose QID the
 * prefecture already holds under another name gives that attraction the
 * text's name as an alias instead, so the text links to it. Returns how many
 * attractions were added.
 */
export function mergeOfficialTextPlaces<A extends { qid?: string | null; aliases?: string[] | null }>(
  prefectures: Array<{ prefecture: { code: string }; wikidata_attractions?: A[] }>,
  places: OfficialTextPlace[],
  toAttraction: (p: OfficialTextPlace) => A,
): number {
  const byCode = new Map(prefectures.map((p) => [p.prefecture.code, p]));
  const held = new Map<string, A>();
  for (const p of prefectures) for (const a of p.wikidata_attractions ?? []) if (a?.qid) held.set(a.qid, a);
  let added = 0;
  for (const place of places) {
    const existing = held.get(place.qid);
    if (existing) {
      const aliases = new Set(existing.aliases ?? []);
      for (const a of place.aliases) aliases.add(a);
      existing.aliases = [...aliases];
      continue;
    }
    const pref = byCode.get(place.prefecture_code);
    if (!pref) continue;
    const a = toAttraction(place);
    (pref.wikidata_attractions ??= []).push(a);
    held.set(place.qid, a);
    added += 1;
  }
  return added;
}
