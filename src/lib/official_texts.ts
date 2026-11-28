/**
 * Official explanatory texts (DATA_SOURCES.md #53): the Japan Tourism
 * Agency's multilingual explanatory-text database (観光庁 地域観光資源の多言語
 * 解説文データベース), written for signs, pamphlets and web pages at the places
 * themselves.
 *
 * The file mirrors the source: one record per published entry, texts kept
 * verbatim in every language the entry carries. The source terms allow
 * redistribution with a credit line but not rewriting, so nothing here edits
 * a text, and the texts never enter the translation pipeline.
 *
 * Linking a text to a spot happens at load time (`matchOfficialTexts`): a
 * title is linked only when, within the entry's prefectures, exactly one spot
 * carries that name. Entries about a theme or an area rather than one place
 * stay unlinked and are still found by search.
 */

import { readFile } from "node:fs/promises";

export type OfficialTextLang = "en" | "ja" | "zh-Hans" | "zh-Hant" | "ko";

export const OFFICIAL_TEXT_LANGS: readonly OfficialTextLang[] = ["en", "ja", "zh-Hans", "zh-Hant", "ko"];

export interface OfficialTextBody {
  title: string | null;
  body: string;
}

export interface MlitTagengoRecord {
  /** Entry id of the source page, e.g. "R6-00279". */
  entry_id: string;
  url: string;
  title_ja: string | null;
  prefectures: string[];
  prefecture_codes: string[];
  genres: string[];
  media: string[];
  fiscal_year: number | null;
  /** The regional council (DMO, municipality, park office) that commissioned it. */
  council: string | null;
  /** 位置情報 as the page states it (an address or a place name). */
  address: string | null;
  texts: Partial<Record<OfficialTextLang, OfficialTextBody>>;
  fetched_at: string;
}

/** What a linked spot carries: the record plus its credit lines. */
export interface OfficialText {
  source: "mlit_tagengo";
  entry_id: string;
  title_ja: string | null;
  title_en: string | null;
  genres: string[];
  prefecture_codes: string[];
  address: string | null;
  council: string | null;
  fiscal_year: number | null;
  texts: Partial<Record<OfficialTextLang, OfficialTextBody>>;
  source_url: string;
  credit: string;
  reuse: string;
}

export const MLIT_TAGENGO_CREDIT_PREFIX = "出典：地域観光資源の多言語解説文データベース";
export const MLIT_TAGENGO_CREDIT_EN = "This English-language text was created by the Japan Tourism Agency.";
export const MLIT_TAGENGO_REUSE =
  "Verbatim official text. The source terms allow reuse with this credit and ask that the text not be rewritten.";

const ENTRY_ID_RE = /^(H|R)\d{1,2}-\d{5}$/;
const SOURCE_URL_RE = /^https:\/\/www\.mlit\.go\.jp\/tagengo-db\//;

export function tagengoCredit(url: string): string {
  return `${MLIT_TAGENGO_CREDIT_PREFIX} ${url} / ${MLIT_TAGENGO_CREDIT_EN}`;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/** Validate one record read from the file; null when it is torn. */
export function normalizeTagengoRecord(raw: unknown): MlitTagengoRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const entryId = str(r.entry_id);
  const url = str(r.url);
  if (!entryId || !ENTRY_ID_RE.test(entryId) || !url || !SOURCE_URL_RE.test(url)) return null;
  const texts: Partial<Record<OfficialTextLang, OfficialTextBody>> = {};
  const rawTexts = (r.texts && typeof r.texts === "object" ? r.texts : {}) as Record<string, unknown>;
  for (const lang of OFFICIAL_TEXT_LANGS) {
    const t = rawTexts[lang] as Record<string, unknown> | undefined;
    const body = t && str(t.body);
    if (body) texts[lang] = { title: str(t.title), body };
  }
  if (!texts.en && !texts.ja) return null;
  return {
    entry_id: entryId,
    url,
    title_ja: str(r.title_ja),
    prefectures: strList(r.prefectures),
    prefecture_codes: strList(r.prefecture_codes).filter((c) => /^\d{2}$/.test(c)),
    genres: strList(r.genres),
    media: strList(r.media),
    fiscal_year: typeof r.fiscal_year === "number" && Number.isFinite(r.fiscal_year) ? r.fiscal_year : null,
    council: str(r.council),
    address: str(r.address),
    texts,
    fetched_at: str(r.fetched_at) ?? "",
  };
}

export function parseTagengoFile(json: unknown): MlitTagengoRecord[] {
  const recs = (json as { records?: unknown } | null)?.records;
  if (!Array.isArray(recs)) return [];
  const out: MlitTagengoRecord[] = [];
  for (const r of recs) {
    const n = normalizeTagengoRecord(r);
    if (n) out.push(n);
  }
  return out;
}

/** Read the file; a missing or unreadable file is no records. */
export async function loadTagengoRecords(path: string): Promise<MlitTagengoRecord[]> {
  try {
    return parseTagengoFile(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return [];
  }
}

export function toOfficialText(r: MlitTagengoRecord): OfficialText {
  return {
    source: "mlit_tagengo",
    entry_id: r.entry_id,
    title_ja: r.title_ja ?? r.texts.ja?.title ?? null,
    title_en: r.texts.en?.title ?? null,
    genres: r.genres,
    prefecture_codes: r.prefecture_codes,
    address: r.address,
    council: r.council,
    fiscal_year: r.fiscal_year,
    texts: r.texts,
    source_url: r.url,
    credit: tagengoCredit(r.url),
    reuse: MLIT_TAGENGO_REUSE,
  };
}

// ── Name matching ─────────────────────────────────────────────────────

/** Width-folded, lower-cased, without spaces and punctuation. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　・･·.,、。'’"“”「」『』【】〈〉《》()（）\[\]\-‐‑–—―~〜～!?！？:：]/g, "");
}

const SECTION_SUFFIX_RE = /\s*[-‐‑–—―:：]\s*(概要|はじめに|歴史|由来|見どころ|overview|introduction|history)\s*$/i;
// "紅葉台全体概要", "童の里の概要": an overview suffix written onto the name.
const OVERVIEW_SUFFIX_RE = /(全体概要|の概要|概要)$/;
// "No.19 ユートピア・ゲレンデ", "【冬のイベント】" style markers before a name.
const LEADING_MARK_RE = /^\s*(No\.?\s*\d+|[\d０-９]+[.．)）]|【[^】]*】)\s*/i;
const PAREN_RE = /[（(]([^（）()]*)[）)]/g;

/**
 * The place names a title can stand for, as written (width-folded, not
 * otherwise normalised). "硫黄山（アトサヌプリ）" gives the full title, 硫黄山
 * and アトサヌプリ; "さぎの湯温泉 - 概要" gives さぎの湯温泉.
 */
export function titleForms(title: string | null | undefined): string[] {
  if (!title) return [];
  const base = title.normalize("NFKC").replace(SECTION_SUFFIX_RE, "").replace(LEADING_MARK_RE, "").trim();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (normalizeName(t).length >= 2 && !out.includes(t)) out.push(t);
  };
  const forms = [base];
  // "<series> パンフレット：０２ 田島弥平旧宅": the part after the last colon,
  // without its section number, names the place.
  const parts = base.split(/[:：]/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].replace(/^\s*[\d０-９]+[\s.．、]*/, "").trim();
    if (last) forms.push(last);
  }
  for (const raw of forms) {
    const f = raw.replace(OVERVIEW_SUFFIX_RE, "").trim() || raw;
    add(f);
    const outside = f.replace(PAREN_RE, "").trim();
    if (outside !== f) add(outside);
    for (const m of f.matchAll(PAREN_RE)) add(m[1]);
  }
  return out;
}

/** titleForms, normalised for comparison. Names under two characters are dropped. */
export function titleNames(title: string | null | undefined): string[] {
  const out = new Set<string>();
  for (const f of titleForms(title)) out.add(normalizeName(f));
  return [...out];
}

export interface MatchableEntity {
  key: string;
  prefecture_code: string;
  names: Array<string | null | undefined>;
  /** Municipality name, used only to choose between same-named spots. */
  municipality?: string | null;
}

/**
 * entry_id -> entity key, for entries whose title names exactly one spot in
 * the entry's prefectures. Wikidata entities are tried before municipal
 * spots; when several spots share the name, the entry's address picks the
 * one in its municipality, and an entry that is still ambiguous stays
 * unlinked.
 */
export function matchOfficialTexts(
  records: MlitTagengoRecord[],
  entities: MatchableEntity[],
): Map<string, string> {
  const byName = new Map<string, MatchableEntity[]>();
  for (const e of entities) {
    const seen = new Set<string>();
    for (const n of e.names) {
      if (!n) continue;
      const k = `${e.prefecture_code}|${normalizeName(n)}`;
      if (seen.has(k) || normalizeName(n).length < 2) continue;
      seen.add(k);
      const list = byName.get(k);
      if (list) list.push(e);
      else byName.set(k, [e]);
    }
  }
  const out = new Map<string, string>();
  for (const r of records) {
    const names = [...titleNames(r.title_ja), ...titleNames(r.texts.ja?.title), ...titleNames(r.texts.en?.title)];
    let chosen: string | null = null;
    for (const n of names) {
      const hits = new Map<string, MatchableEntity>();
      for (const pc of r.prefecture_codes) {
        for (const e of byName.get(`${pc}|${n}`) ?? []) hits.set(e.key, e);
      }
      if (hits.size === 0) continue;
      chosen = pickOne([...hits.values()], r.address);
      break;
    }
    if (chosen) out.set(r.entry_id, chosen);
  }
  return out;
}

function pickOne(hits: MatchableEntity[], address: string | null): string | null {
  const wd = hits.filter((h) => h.key.startsWith("wd:"));
  const pool = wd.length > 0 ? wd : hits;
  if (pool.length === 1) return pool[0].key;
  if (!address) return null;
  const inMuni = pool.filter((h) => h.municipality && address.includes(h.municipality));
  return inMuni.length === 1 ? inMuni[0].key : null;
}

/**
 * The texts for one entity, kept only when the entity lies in a prefecture
 * the text covers. Entity keys are not always unique across prefectures (one
 * source id reused in two prefectures), so the key alone is not enough.
 */
export function officialTextsFor(
  byEntity: Map<string, OfficialText[]>,
  key: string,
  prefectureCode: string | null | undefined,
): OfficialText[] | null {
  const list = byEntity.get(key);
  if (!list || !prefectureCode) return null;
  const kept = list.filter((t) => t.prefecture_codes.includes(prefectureCode));
  return kept.length > 0 ? kept : null;
}

/** Group the linked texts by entity key, newest fiscal year first. */
export function officialTextsByEntity(
  records: MlitTagengoRecord[],
  links: Map<string, string>,
): Map<string, OfficialText[]> {
  const out = new Map<string, OfficialText[]>();
  for (const r of records) {
    const key = links.get(r.entry_id);
    if (!key) continue;
    const list = out.get(key);
    if (list) list.push(toOfficialText(r));
    else out.set(key, [toOfficialText(r)]);
  }
  for (const list of out.values()) {
    list.sort((a, b) => (b.fiscal_year ?? 0) - (a.fiscal_year ?? 0) || a.entry_id.localeCompare(b.entry_id));
  }
  return out;
}
