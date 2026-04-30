#!/usr/bin/env node
/**
 * Japan Travel MCP Server (stdio transport).
 *
 * Tools:
 *   - search_area:      search by name/keyword across prefectures, municipalities, attractions
 *   - get_spots:        tourist spots by area (combines municipal scrape + Wikidata)
 *   - get_hotels:       accommodations (Wikidata + OpenStreetMap merged)
 *   - get_transport:    spot location + official URL where access is documented
 *   - get_events:       festivals from Wikidata SPARQL (live, in-memory cache)
 *   - get_multilingual: lightweight name lookup in EN/ZH/KO
 *   - get_description:  signature tool — 17-language tourism descriptions
 *
 * Data sources:
 *   data/prefectures/<slug>.json   — per-prefecture JSON, two parallel layers:
 *     municipalities[].spots[]      from official-site scraping
 *     wikidata_attractions[]        from Wikidata SPARQL (multilingual + coords)
 *   data/hotels/master.json        — merged hotel master list
 *   data/translations/             — 17-language names + descriptions
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveDataRoot } from "./lib/hf_data.js";
import { matchesMunicipality, stripPrefSuffix } from "./lib/match.js";
import { semanticSearch, tryLoadSemanticIndex } from "./lib/semantic.js";
import { hybridSearch } from "./lib/hybrid.js";

const DISCLAIMER =
  "Data sourced from public websites (municipal tourism pages) and Wikidata (CC0). Verify directly with the property before making decisions.";

// ──────────────────────────────────────────────────────────────────────
// Data loading

interface ScrapedSpot {
  id: string;
  url: string;
  name: string;
  description: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  language: string;
  source_url: string;
  last_scraped_at: string;
}

interface MunicipalityBlock {
  municipality: {
    code: string;
    name: string;
    prefecture_code: string;
    prefecture_name: string;
  };
  spots: ScrapedSpot[];
}

interface WikidataAttraction {
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
}

interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  data_as_of: string;
  source: string;
  municipalities: MunicipalityBlock[];
  wikidata_attractions?: WikidataAttraction[];
}

interface HotelRecord {
  id: string;
  confidence: "confirmed" | "singleton";
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  website: string | null;
  type: string | null;
  postal_code: string | null;
  street: string | null;
  prefecture_code: string | null;
  sources: { source: "wikidata" | "osm"; id: string; url: string }[];
}

interface HotelsFile {
  generated_at: string;
  hotels: HotelRecord[];
}

// Resolved at startup by initDataRoot(). Either points at a populated data/
// in a development checkout, or at the HF cache (~/.japan-travel-mcp/data/).
let DATA_ROOT: string | null = null;

function findPackageRoot(): string {
  // Walk up from this file until we find package.json — works whether running
  // from src/ (dev) or dist/ (built).
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, "package.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("package root (package.json parent) not found");
}

async function initDataRoot(): Promise<void> {
  DATA_ROOT = await resolveDataRoot(findPackageRoot());
}

function dataRoot(): string {
  if (!DATA_ROOT) {
    throw new Error("data root not initialized — call initDataRoot() first");
  }
  return DATA_ROOT;
}

function findDataDir(): string {
  return resolve(dataRoot(), "prefectures");
}

function findHotelsMasterPath(): string {
  return resolve(dataRoot(), "hotels/master.json");
}

function findDescriptionsPath(): string {
  return resolve(dataRoot(), "translations/descriptions_complete.jsonl");
}

function findWikidataAttractionsMasterPath(): string {
  return resolve(dataRoot(), "_state/wikidata_attractions.json");
}

function findMultilingualNamesPath(): string {
  return resolve(dataRoot(), "translations/multilingual_complete.jsonl");
}

const SUPPORTED_LANGUAGES = [
  "en",
  "ja",
  "zh",
  "ko",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "ru",
  "th",
  "vi",
  "id",
  "ms",
  "ar",
  "hi",
  "tl",
] as const;
type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

interface DescriptionRecord {
  qid: string;
  descriptions: Partial<Record<SupportedLang, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
  generated_at?: string;
}

interface MultilingualNameRecord {
  qid: string;
  translations: Partial<Record<SupportedLang | "ja", string | null>>;
  sources?: Partial<Record<SupportedLang | "ja", string>>;
}

// ──────────────────────────────────────────────────────────────────────
// R-3 (specialty / traditional arts / japan heritage) — official-source records.
// All written by scrapers/sources/fetch_*.ts, refreshed on a 30-day cadence.

interface MaffGiRecord {
  source: "maff_gi";
  authority: string;
  registration_number: number;
  name_ja: string;
  registration_date: string | null;
  production_area_text: string | null;
  prefecture_codes: string[];
  producer_group: string | null;
  characteristics_ja: string | null;
  detail_url: string;
  fetched_at: string;
}

interface MetiDensanRecord {
  source: "meti_densan";
  authority: string;
  craft_id: string;
  industry_category: string;
  industry_slug: string;
  name_ja: string;
  designation_date: string | null;
  production_area_text: string | null;
  prefecture_codes: string[];
  features_ja: string | null;
  detail_url: string;
  fetched_at: string;
}

interface JapanHeritageRecord {
  source: "japan_heritage";
  authority: string;
  story_id: string;
  title_ja: string;
  subtitle_ja: string | null;
  themes: string[];
  periods: string[];
  related_areas_text: string | null;
  prefecture_codes: string[];
  summary_ja: string | null;
  body_ja: string | null;
  story_url: string;
  info_url: string;
  fetched_at: string;
}

interface BunkaIntangibleRecord {
  source: "bunka_intangible";
  authority: string;
  qid: string;
  wikidata_url: string;
  designation: string;
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inception: string | null;
  bunca_id: string | null;
  fetched_at: string;
}

interface UnescoJapanRecord {
  source: "unesco_japan";
  authority: string;
  qid: string;
  wikidata_url: string;
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inscription_year: number | null;
  unesco_id: string | null;
  fetched_at: string;
}

// 観光庁 (Japan Tourism Agency) registered + candidate DMOs.
// File shape differs from the other R-3 sources because the fetcher writes
// `entries[]` rather than `records[]` and carries a top-level summary block.
interface DmoRecord {
  id: string;
  name: string;
  name_normalized: string;
  registration_class: string; // 広域連携 / 都道府県 / 地域 / 候補・地域 / 地域(地域連携)
  status: "registered" | "candidate";
  prefectures: string[];
  municipalities: string[];
  raw_area_text: string;
  plan_pdf_url: string | null;
  source: string;
  authority: string;
}

interface DmoFile {
  fetched_at: string;
  source: string;
  authority: string;
  license: string;
  summary: {
    registered: number;
    candidate: number;
    total: number;
    with_plan_url: number;
  };
  entries: DmoRecord[];
}

interface R3SourceFile<T> {
  source: { name: string; authority: string; url?: string; license: string };
  fetched_at: string;
  total: number;
  records: T[];
}

/**
 * R-3 translation record. Keys are formatted "<source>:<record-id>", e.g.:
 *   maff_gi:1, meti_densan:0101, japan_heritage:001,
 *   bunka_intangible:Q1037119, unesco_japan:Q243170
 *
 * `name` and `description` are translated separately so callers can pick
 * either form. `confidence` reflects how grounded the translation is.
 */
interface R3TranslationRecord {
  key: string;
  name?: Partial<Record<SupportedLang, string>>;
  description?: Partial<Record<SupportedLang, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
  generated_at?: string;
}

let cachedData: PrefectureFile[] | null = null;
let cachedHotels: HotelsFile | null = null;
let cachedDescriptions: Map<string, DescriptionRecord> | null = null;
let cachedNames: Map<string, MultilingualNameRecord> | null = null;
let cachedMaffGi: R3SourceFile<MaffGiRecord> | null = null;
let cachedMetiDensan: R3SourceFile<MetiDensanRecord> | null = null;
let cachedJapanHeritage: R3SourceFile<JapanHeritageRecord> | null = null;
let cachedBunkaIntangible: R3SourceFile<BunkaIntangibleRecord> | null = null;
let cachedUnescoJapan: R3SourceFile<UnescoJapanRecord> | null = null;
let cachedDmo: DmoFile | null = null;
let cachedR3Translations: Map<string, R3TranslationRecord> | null = null;

async function loadAllPrefectures(): Promise<PrefectureFile[]> {
  if (cachedData) return cachedData;
  const dir = findDataDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: PrefectureFile[] = [];
  for (const f of files) {
    try {
      const content = await readFile(resolve(dir, f), "utf8");
      out.push(JSON.parse(content) as PrefectureFile);
    } catch {
      // skip malformed
    }
  }
  // The municipal-scrape pipeline merges wikidata_attractions into each
  // prefecture file at write-time, but we discovered Hokkaido (and
  // possibly others) ship with that field empty. Backfill from the
  // master `_state/wikidata_attractions.json` so search and per-pref
  // tools see the full Wikidata corpus regardless of merge errors.
  await supplementWikidataAttractions(out);
  cachedData = out;
  return out;
}

async function supplementWikidataAttractions(
  prefs: PrefectureFile[],
): Promise<void> {
  const masterPath = findWikidataAttractionsMasterPath();
  if (!existsSync(masterPath)) return;
  let master: { attractions: WikidataAttraction[] };
  try {
    const content = await readFile(masterPath, "utf8");
    master = JSON.parse(content) as { attractions: WikidataAttraction[] };
  } catch {
    return;
  }
  const byPref = new Map<string, WikidataAttraction[]>();
  for (const a of master.attractions ?? []) {
    const code = a.prefecture_code;
    if (!code) continue;
    let bucket = byPref.get(code);
    if (!bucket) {
      bucket = [];
      byPref.set(code, bucket);
    }
    bucket.push(a);
  }
  for (const p of prefs) {
    const have = (p.wikidata_attractions ?? []).length;
    const supplement = byPref.get(p.prefecture.code) ?? [];
    if (have === 0 && supplement.length > 0) {
      p.wikidata_attractions = supplement;
    }
  }
}

async function loadHotels(): Promise<HotelsFile | null> {
  if (cachedHotels) return cachedHotels;
  try {
    const path = findHotelsMasterPath();
    const content = await readFile(path, "utf8");
    cachedHotels = JSON.parse(content) as HotelsFile;
    return cachedHotels;
  } catch {
    return null;
  }
}

async function loadDescriptions(): Promise<Map<string, DescriptionRecord>> {
  if (cachedDescriptions) return cachedDescriptions;
  const map = new Map<string, DescriptionRecord>();
  try {
    const content = await readFile(findDescriptionsPath(), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as DescriptionRecord;
        if (rec.qid) map.set(rec.qid, rec);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // file missing → return empty map (tool degrades gracefully)
  }
  cachedDescriptions = map;
  return map;
}

async function loadNames(): Promise<Map<string, MultilingualNameRecord>> {
  if (cachedNames) return cachedNames;
  const map = new Map<string, MultilingualNameRecord>();
  try {
    const content = await readFile(findMultilingualNamesPath(), "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as MultilingualNameRecord;
        if (rec.qid) map.set(rec.qid, rec);
      } catch {
        // skip malformed
      }
    }
  } catch {
    // file missing → return empty map
  }
  cachedNames = map;
  return map;
}

function dataAsOf(prefs: PrefectureFile[]): string | null {
  if (prefs.length === 0) return null;
  return prefs.map((p) => p.data_as_of).sort().pop() ?? null;
}

// ──────────────────────────────────────────────────────────────────────
// Tool: search_area

async function searchArea(args: {
  q: string;
  lang?: string;
  limit?: number;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const q = args.q.trim().toLowerCase();
  if (q.length === 0) {
    return { error: "empty_query", disclaimer: DISCLAIMER };
  }
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);

  // Score model:
  //   100  exact name match (any language)
  //    50  name substring match (any language)
  //    20  description / body substring match
  //   + small notability boost (sitelink / officially-designated / multi-lang)
  type Match = {
    score: number;
    record: Record<string, unknown>;
  };
  const matches: Match[] = [];

  const exactMatch = (s: string | null | undefined): boolean =>
    !!s && s.toLowerCase() === q;
  const partialMatch = (s: string | null | undefined): boolean =>
    !!s && s.toLowerCase().includes(q);

  const addMatch = (score: number, record: Record<string, unknown>): void => {
    matches.push({ score, record });
  };

  // ── prefectures (47)
  for (const p of prefs) {
    let s = 0;
    if (exactMatch(p.prefecture.name) || exactMatch(p.prefecture.name_en)) s = 110;
    else if (partialMatch(p.prefecture.name) || partialMatch(p.prefecture.name_en)) s = 60;
    if (s > 0) {
      addMatch(s, {
        type: "prefecture",
        code: p.prefecture.code,
        name: p.prefecture.name,
        name_en: p.prefecture.name_en ?? null,
      });
    }
  }

  // ── municipalities + scraped spots
  for (const p of prefs) {
    for (const m of p.municipalities) {
      let muniScore = 0;
      if (exactMatch(m.municipality.name)) muniScore = 105;
      else if (partialMatch(m.municipality.name)) muniScore = 55;
      if (muniScore > 0) {
        addMatch(muniScore, {
          type: "municipality",
          code: m.municipality.code,
          name: m.municipality.name,
          prefecture: p.prefecture.name,
        });
      }
      // Scraped spots: name first, then description/body fallback
      for (const spot of m.spots ?? []) {
        let sScore = 0;
        if (exactMatch(spot.name)) sScore = 100;
        else if (partialMatch(spot.name)) sScore = 50;
        else if (
          partialMatch(spot.description) ||
          partialMatch(((spot as { body_paragraphs?: string[] }).body_paragraphs ?? []).join(" "))
        ) {
          sScore = 20;
        }
        if (sScore > 0) {
          addMatch(sScore, {
            type: "spot",
            source: "municipal_scrape",
            id: spot.id,
            name: spot.name,
            description: spot.description,
            url: spot.url,
            municipality: m.municipality.name,
            prefecture: p.prefecture.name,
            language: spot.language,
          });
        }
      }
    }
  }

  // ── Wikidata attractions (41,000+; supplement loader fills missing
  //    per-prefecture data from the master file)
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      let s = 0;
      if (
        exactMatch(a.name_ja) ||
        exactMatch(a.name_en) ||
        exactMatch(a.name_zh) ||
        exactMatch(a.name_ko)
      ) {
        s = 100;
      } else if (
        partialMatch(a.name_ja) ||
        partialMatch(a.name_en) ||
        partialMatch(a.name_zh) ||
        partialMatch(a.name_ko)
      ) {
        s = 50;
      } else if (partialMatch(a.description_en)) {
        s = 20;
      }
      if (s > 0) {
        // Notability boost: shorter Q-id ≈ older / more notable in Wikidata.
        // It's a proxy, not perfect, but it ranks Q170181 (Himeji Castle)
        // above Q116606456 (Himeji City Archaeological Research Center).
        const qNum = parseInt((a.qid ?? "Q9999999999").replace(/^Q/, ""), 10);
        const notability = isFinite(qNum) ? Math.max(0, 10 - Math.log10(qNum)) : 0;
        addMatch(s + notability, {
          type: "attraction",
          source: "wikidata",
          qid: a.qid,
          name_ja: a.name_ja,
          name_en: a.name_en,
          description_en: a.description_en ?? null,
          coordinates: a.coordinates,
          prefecture_code: a.prefecture_code,
        });
      }
    }
  }

  // ── R-3 designation registries (MAFF GI / METI crafts / Japan Heritage /
  //    bunka intangible / UNESCO ICH) — official records, ranked above
  //    Wikidata when names match exactly because they're authoritative.
  const r3Hits = await searchR3Registries(args.q, q, exactMatch, partialMatch);
  for (const m of r3Hits) matches.push(m);

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, limit);

  return {
    query: args.q,
    match_count: matches.length,
    results: top.map((m) => m.record),
    truncated: matches.length > limit,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
    note:
      "Results sorted by relevance: exact name match > name substring > description match. Wikidata notability is approximated by Q-id age (lower = older/more cited).",
  };
}

async function searchR3Registries(
  qOriginal: string,
  qLower: string,
  exactMatch: (s: string | null | undefined) => boolean,
  partialMatch: (s: string | null | undefined) => boolean,
): Promise<Array<{ score: number; record: Record<string, unknown> }>> {
  const out: Array<{ score: number; record: Record<string, unknown> }> = [];

  type Stuff = { name_ja?: string | null; name_en?: string | null;
    description_ja?: string | null; description_en?: string | null;
    summary_ja?: string | null; characteristics_ja?: string | null };
  const scoreOne = (r: Stuff): number => {
    if (
      exactMatch(r.name_ja) ||
      exactMatch(r.name_en)
    ) return 115; // top — official-designation exact name
    if (
      partialMatch(r.name_ja) ||
      partialMatch(r.name_en)
    ) return 65;
    if (
      partialMatch(r.description_ja) ||
      partialMatch(r.description_en) ||
      partialMatch(r.summary_ja) ||
      partialMatch(r.characteristics_ja)
    ) return 25;
    return 0;
  };

  const maff = await loadMaffGi();
  if (maff) {
    for (const r of maff.records) {
      const s = scoreOne({
        name_ja: r.name_ja,
        description_ja: r.characteristics_ja,
        characteristics_ja: r.characteristics_ja,
      });
      if (s > 0) {
        out.push({
          score: s,
          record: {
            type: "designation",
            source: "maff_gi",
            key: `maff_gi:${r.registration_number}`,
            name_ja: r.name_ja,
            description_ja: r.characteristics_ja,
            production_area_text: r.production_area_text,
            prefecture_codes: r.prefecture_codes,
            source_url: r.detail_url,
          },
        });
      }
    }
  }

  const meti = await loadMetiDensan();
  if (meti) {
    for (const r of meti.records) {
      const s = scoreOne({
        name_ja: r.name_ja,
        description_ja: r.features_ja,
        characteristics_ja: r.features_ja,
      });
      if (s > 0) {
        out.push({
          score: s,
          record: {
            type: "designation",
            source: "meti_densan",
            key: `meti_densan:${r.craft_id}`,
            name_ja: r.name_ja,
            description_ja: r.features_ja,
            production_area_text: r.production_area_text,
            prefecture_codes: r.prefecture_codes,
            source_url: r.detail_url,
          },
        });
      }
    }
  }

  const jh = await loadJapanHeritage();
  if (jh) {
    for (const r of jh.records) {
      const s = scoreOne({
        name_ja: r.title_ja,
        description_ja: r.body_ja ?? r.summary_ja,
        summary_ja: r.summary_ja,
      });
      if (s > 0) {
        out.push({
          score: s,
          record: {
            type: "designation",
            source: "japan_heritage",
            key: `japan_heritage:${r.story_id}`,
            title_ja: r.title_ja,
            summary_ja: r.summary_ja,
            related_areas_text: r.related_areas_text,
            prefecture_codes: r.prefecture_codes,
            themes: r.themes,
            source_url: r.story_url,
          },
        });
      }
    }
  }

  const bunka = await loadBunkaIntangible();
  if (bunka) {
    for (const r of bunka.records) {
      const s = scoreOne({
        name_ja: r.name_ja,
        name_en: r.name_en,
        description_ja: r.description_ja,
        description_en: r.description_en,
      });
      if (s > 0) {
        out.push({
          score: s,
          record: {
            type: "designation",
            source: "bunka_intangible",
            key: `bunka_intangible:${r.qid}`,
            name_ja: r.name_ja,
            name_en: r.name_en,
            description_ja: r.description_ja,
            source_url: r.wikidata_url,
          },
        });
      }
    }
  }

  const unesco = await loadUnescoJapan();
  if (unesco) {
    for (const r of unesco.records) {
      const s = scoreOne({
        name_ja: r.name_ja,
        name_en: r.name_en,
        description_ja: r.description_ja,
        description_en: r.description_en,
      });
      if (s > 0) {
        out.push({
          score: s,
          record: {
            type: "designation",
            source: "unesco_japan",
            key: `unesco_japan:${r.qid}`,
            name_ja: r.name_ja,
            name_en: r.name_en,
            description_ja: r.description_ja,
            inscription_year: r.inscription_year,
            source_url: r.wikidata_url,
          },
        });
      }
    }
  }

  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_spots

async function getSpots(args: {
  prefecture?: string;
  city?: string;
  /** Alias for `city` — accepted because LLM clients sometimes invent it. */
  municipality?: string;
  limit?: number;
  /** Filter scraped spots by minimum quality score (0-1). Default 0.30 —
   *  drops admin-page noise (city-office news, "新着情報" widgets etc.).
   *  Set to 0 to see all scraped spots regardless of completeness. */
  min_quality?: number;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  const minQuality =
    typeof args.min_quality === "number"
      ? Math.max(0, Math.min(1, args.min_quality))
      : 0.30;

  const matchesPrefecture = (p: PrefectureFile): boolean => {
    if (!args.prefecture) return true;
    const q = args.prefecture.toLowerCase();
    return (
      p.prefecture.name.toLowerCase() === q ||
      p.prefecture.name_en?.toLowerCase() === q ||
      p.prefecture.code === args.prefecture
    );
  };

  const cityRaw = args.city ?? args.municipality ?? null;

  // Collect with score so we can sort. Scraped spots use the same per-spot
  // quality rubric we use for the dataset audit (scrapers/lib/quality_score):
  // description / body_paragraphs / address / coordinates / Schema.org / image.
  type Scored = { score: number; record: Record<string, unknown> };
  const scored: Scored[] = [];

  for (const p of prefs) {
    if (!matchesPrefecture(p)) continue;
    for (const m of p.municipalities) {
      if (!matchesMunicipality(m.municipality.name, cityRaw)) continue;
      for (const s of m.spots) {
        const q = scoreSpotQuality(s);
        if (q < minQuality) continue;
        scored.push({
          score: q,
          record: {
            source: "municipal_scrape",
            id: s.id,
            name: s.name,
            description: s.description,
            coordinates: s.coordinates,
            address: s.address,
            url: s.url,
            municipality: m.municipality.name,
            municipality_code: m.municipality.code,
            prefecture: p.prefecture.name,
            language: s.language,
            quality_score: Math.round(q * 100) / 100,
          },
        });
      }
    }
    if (!cityRaw) {
      for (const a of p.wikidata_attractions ?? []) {
        // Wikidata entities all pass min_quality (they are curated by
        // Wikipedia / Wikidata contributors, equivalent to a "designated"
        // quality floor). We give them a fixed score above 0.5 so they
        // mix with high-quality scraped spots.
        scored.push({
          score: 0.6,
          record: {
            source: "wikidata",
            id: a.qid,
            name: a.name_ja || a.name_en,
            name_en: a.name_en,
            name_zh: a.name_zh,
            name_ko: a.name_ko,
            description_en: a.description_en,
            coordinates: a.coordinates,
            url: a.wikidata_url,
            municipality: a.admin_name,
            municipality_code: a.admin_code,
            prefecture: p.prefecture.name,
            quality_score: 0.6,
          },
        });
      }
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, limit);

  return {
    spots: top.map((x) => x.record),
    count: top.length,
    total_before_limit: scored.length,
    truncated: scored.length > limit,
    min_quality_applied: minQuality,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
    note:
      "Spots ranked by completeness (description, body paragraphs, " +
      "coordinates, Schema.org metadata). Increase `min_quality` to " +
      "tighten further or set to 0 to see admin-page-style entries.",
  };
}

// Quality scoring — mirrors scrapers/lib/quality_score.ts but inlined
// here because the runtime can't reach the scrapers/ directory once
// shipped. The two MUST stay in sync; tests in tests/lib/quality_score.test.ts
// pin the rubric.
function scoreSpotQuality(s: {
  description?: string | null;
  body_paragraphs?: string[];
  address?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  coordinate_precision?: string | null;
  images?: string[];
  schema_events?: unknown[];
  schema_places?: unknown[];
}): number {
  let score = 0;
  if (s.description) {
    score += 0.2;
    score += Math.min(0.15, ((s.description.length ?? 0) / 120) * 0.15);
  }
  const bodies = s.body_paragraphs ?? [];
  score += Math.min(0.2, (bodies.length / 2) * 0.2);
  if (s.address) score += 0.1;
  if (s.coordinates) {
    if (s.coordinate_precision === "exact") score += 0.1;
    else if (s.coordinate_precision === "address_geocoded") score += 0.07;
    else score += 0.04;
  }
  const sn = (s.schema_events?.length ?? 0) + (s.schema_places?.length ?? 0);
  if (sn > 0) score += 0.15;
  if ((s.images?.length ?? 0) > 0) score += 0.1;
  return score;
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_hotels (pending)

const EARTH_R = 6_371_000;
function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

async function getHotels(args: {
  city?: string;
  prefecture?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  limit?: number;
}): Promise<unknown> {
  const file = await loadHotels();
  if (!file) {
    return {
      status: "pending_data",
      message:
        "Hotel master file not yet generated. Run `npx tsx scrapers/matcher/match_hotels.ts` after the source fetchers (fetch_wikidata_hotels.ts, fetch_osm_hotels.ts) have populated data/hotels/raw/.",
      hotels: [],
      disclaimer: DISCLAIMER,
    };
  }

  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  let hotels = file.hotels;

  // Resolve prefecture name/slug/code → 2-digit code
  let prefCode: string | null = null;
  if (args.prefecture) {
    const q = args.prefecture.trim().toLowerCase();
    if (/^\d{1,2}$/.test(q)) {
      prefCode = q.padStart(2, "0");
    } else {
      const prefs = await loadAllPrefectures();
      const match = prefs.find(
        (p) =>
          p.prefecture.name.toLowerCase() === q ||
          p.prefecture.name_en?.toLowerCase() === q,
      );
      if (match) prefCode = match.prefecture.code;
    }
    if (!prefCode) {
      return {
        hotels: [],
        count: 0,
        error: `unknown prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '沖縄県'), slug (e.g. 'okinawa'), or 2-digit code (e.g. '47').",
        disclaimer: DISCLAIMER,
      };
    }
    hotels = hotels.filter((h) => h.prefecture_code === prefCode);
  }

  // Filter by city (substring match in name)
  if (args.city) {
    const q = args.city.toLowerCase();
    hotels = hotels.filter(
      (h) =>
        (h.name && h.name.includes(args.city!)) ||
        (h.street && h.street.includes(args.city!)) ||
        (h.name_en && h.name_en.toLowerCase().includes(q)),
    );
  }

  // Coordinates-based filter
  if (
    typeof args.lat === "number" &&
    typeof args.lng === "number" &&
    typeof args.radius === "number"
  ) {
    const center = { lat: args.lat, lng: args.lng };
    const r = args.radius;
    hotels = hotels.filter(
      (h) => h.coordinates && haversine(h.coordinates, center) <= r,
    );
    // Sort by distance
    hotels.sort((a, b) => {
      const da = a.coordinates ? haversine(a.coordinates, center) : Infinity;
      const db = b.coordinates ? haversine(b.coordinates, center) : Infinity;
      return da - db;
    });
  }

  const out = hotels.slice(0, limit).map((h) => ({
    id: h.id,
    confidence: h.confidence,
    name: h.name,
    name_en: h.name_en,
    name_zh: h.name_zh,
    name_ko: h.name_ko,
    type: h.type,
    coordinates: h.coordinates,
    phone: h.phone,
    website: h.website,
    postal_code: h.postal_code,
    street: h.street,
    prefecture_code: h.prefecture_code,
    sources: h.sources,
  }));

  return {
    hotels: out,
    count: out.length,
    truncated: hotels.length > limit,
    total_matching: hotels.length,
    note: "Information only — does NOT include availability or pricing. For bookings, visit the hotel's official website.",
    data_as_of: file.generated_at,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_transport
//
// Minimal-but-useful implementation: looks up the spot, returns its
// coordinates + the official URL where the property documents access info.
// Full station-database integration (P197 adjacent_station, OSM railway
// stations) is a future enhancement.

interface SpotLocation {
  spot_id: string;
  source: "wikidata" | "municipal_scrape";
  name: string | null;
  coordinates: { lat: number; lng: number } | null;
  prefecture: string | null;
  prefecture_code: string | null;
  municipality: string | null;
  source_url: string | null;
}

async function findSpot(spotId: string): Promise<SpotLocation | null> {
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      if (a.qid === spotId) {
        return {
          spot_id: a.qid,
          source: "wikidata",
          name: a.name_ja || a.name_en,
          coordinates: a.coordinates,
          prefecture: p.prefecture.name,
          prefecture_code: p.prefecture.code,
          municipality: a.admin_name,
          source_url: a.wikidata_url,
        };
      }
    }
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        if (s.id === spotId) {
          return {
            spot_id: s.id,
            source: "municipal_scrape",
            name: s.name,
            coordinates: s.coordinates,
            prefecture: p.prefecture.name,
            prefecture_code: p.prefecture.code,
            municipality: m.municipality.name,
            source_url: s.url,
          };
        }
      }
    }
  }
  return null;
}

async function getTransport(args: { spot_id: string }): Promise<unknown> {
  if (!args.spot_id) {
    return { error: "spot_id required", disclaimer: DISCLAIMER };
  }
  const spot = await findSpot(args.spot_id);
  if (!spot) {
    return {
      error: "spot_not_found",
      spot_id: args.spot_id,
      hint: "Use search_area or get_spots to obtain a valid spot_id.",
      disclaimer: DISCLAIMER,
    };
  }

  // Find the closest hotel cluster as a proxy for "nearby developed area"
  // (hotels concentrate near stations / town centres in Japan).
  let nearestHotel: { name: string | null; distance_m: number } | null = null;
  if (spot.coordinates) {
    const file = await loadHotels();
    if (file) {
      let best: { hotel: HotelRecord; d: number } | null = null;
      for (const h of file.hotels) {
        if (!h.coordinates) continue;
        if (h.prefecture_code && h.prefecture_code !== spot.prefecture_code) continue;
        const d = haversine(spot.coordinates, h.coordinates);
        if (!best || d < best.d) best = { hotel: h, d };
      }
      if (best) {
        nearestHotel = {
          name: best.hotel.name_en || best.hotel.name,
          distance_m: Math.round(best.d),
        };
      }
    }
  }

  return {
    spot_id: spot.spot_id,
    name: spot.name,
    coordinates: spot.coordinates,
    prefecture: spot.prefecture,
    municipality: spot.municipality,
    access: {
      official_source_url: spot.source_url,
      note: "Detailed transit (nearest station, walk time, bus routes) is documented on the linked source. This MCP returns coordinates and source URL only; future versions will add station data from OpenStreetMap.",
      nearest_developed_area_proxy: nearestHotel,
    },
    data_source: spot.source,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_events
//
// Fetches festivals (祭) for a given prefecture from Wikidata SPARQL at
// request time. Results are cached in-memory per prefecture-code.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const SPARQL_USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const FESTIVAL_TYPES = [
  "Q132241", // festival
  "Q1445650", // matsuri
  "Q175331", // religious festival
];

const cachedFestivals = new Map<string, unknown[]>();

interface FestivalSparqlBinding {
  item?: { value: string };
  itemLabel_ja?: { value: string };
  itemLabel_en?: { value: string };
  pointInTime?: { value: string };
  startTime?: { value: string };
  coord?: { value: string };
  adminLabel?: { value: string };
}

function parseWktPoint(
  v: string,
): { lat: number; lng: number } | null {
  const m = v.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}

async function fetchFestivals(prefCode: string): Promise<unknown[]> {
  if (cachedFestivals.has(prefCode)) {
    return cachedFestivals.get(prefCode)!;
  }
  const typesValues = FESTIVAL_TYPES.map((q) => `wd:${q}`).join(" ");
  const query = `
SELECT DISTINCT ?item ?itemLabel_ja ?itemLabel_en ?pointInTime ?startTime ?coord ?adminLabel WHERE {
  ?adminEntity wdt:P429 ?adminCode .
  FILTER(STRSTARTS(STR(?adminCode), "${prefCode}"))
  ?item wdt:P31/wdt:P279* ?type .
  VALUES ?type { ${typesValues} }
  ?item wdt:P276 ?adminEntity .
  OPTIONAL { ?item wdt:P585 ?pointInTime . }
  OPTIONAL { ?item wdt:P580 ?startTime . }
  OPTIONAL { ?item wdt:P625 ?coord . }
  OPTIONAL { ?item rdfs:label ?itemLabel_ja . FILTER(LANG(?itemLabel_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }
  OPTIONAL { ?adminEntity rdfs:label ?adminLabel . FILTER(LANG(?adminLabel) = "ja") }
}
LIMIT 200
`.trim();

  try {
    const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": SPARQL_USER_AGENT,
        Accept: "application/sparql-results+json",
      },
    });
    if (!res.ok) {
      cachedFestivals.set(prefCode, []);
      return [];
    }
    const json = (await res.json()) as {
      results: { bindings: FestivalSparqlBinding[] };
    };
    const out = json.results.bindings.map((b) => ({
      qid: b.item?.value.split("/").pop(),
      name_ja: b.itemLabel_ja?.value ?? null,
      name_en: b.itemLabel_en?.value ?? null,
      coordinates: b.coord ? parseWktPoint(b.coord.value) : null,
      municipality: b.adminLabel?.value ?? null,
      point_in_time: b.pointInTime?.value ?? null,
      start_time: b.startTime?.value ?? null,
      wikidata_url: b.item?.value,
    }));
    cachedFestivals.set(prefCode, out);
    return out;
  } catch {
    cachedFestivals.set(prefCode, []);
    return [];
  }
}

async function resolvePrefectureCode(input: string): Promise<string | null> {
  const q = input.trim().toLowerCase();
  if (/^\d{1,2}$/.test(q)) return q.padStart(2, "0");
  const prefs = await loadAllPrefectures();
  const match = prefs.find(
    (p) =>
      p.prefecture.name.toLowerCase() === q ||
      p.prefecture.name_en?.toLowerCase() === q,
  );
  return match?.prefecture.code ?? null;
}

// Bare prefecture name (e.g. "山梨" without "県") — used to text-match
// against records whose schema doesn't carry a prefecture_code (bunka
// intangible, free-form descriptions).
/**
 * Compile a case-insensitive substring matcher for the optional `keyword`
 * argument used by aggregator tools (get_festivals / get_traditional_arts /
 * get_local_food). Returns a function that returns true iff any of the
 * passed-in fields contains the keyword. When `keyword` is missing/empty
 * the function always returns true.
 *
 * Added 2026-05-01 (Phase 1 GAP_ANALYSIS L4) so callers can narrow large
 * result sets like `get_festivals(prefecture='秋田県', keyword='花火')`.
 */
function compileKeywordMatcher(
  keyword: string | undefined,
): (...fields: (string | null | undefined)[]) => boolean {
  const k = (keyword ?? "").trim();
  if (!k) return () => true;
  const lower = k.toLowerCase();
  return (...fields: (string | null | undefined)[]): boolean => {
    for (const f of fields) {
      if (!f) continue;
      if (f.includes(k)) return true;
      if (f.toLowerCase().includes(lower)) return true;
    }
    return false;
  };
}

async function bareNameForPref(prefCode: string): Promise<string | null> {
  const prefs = await loadAllPrefectures();
  const p = prefs.find((x) => x.prefecture.code === prefCode);
  if (!p) return null;
  return stripPrefSuffix(p.prefecture.name);
}

async function textMentionsPrefecture(
  text: string | null | undefined,
  prefCode: string,
): Promise<boolean> {
  if (!text) return false;
  const bare = await bareNameForPref(prefCode);
  if (!bare) return false;
  return text.includes(bare);
}

async function getEvents(args: {
  prefecture?: string;
  month?: number;
}): Promise<unknown> {
  if (!args.prefecture) {
    return {
      error: "prefecture required",
      hint: "Provide prefecture as Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
      disclaimer: DISCLAIMER,
    };
  }
  const prefCode = await resolvePrefectureCode(args.prefecture);
  if (!prefCode) {
    return {
      error: `unknown_prefecture: ${args.prefecture}`,
      hint: "Use Japanese name (e.g. '京都府'), English slug (e.g. 'kyoto'), or 2-digit JIS code (e.g. '26').",
      disclaimer: DISCLAIMER,
    };
  }

  const festivals = (await fetchFestivals(prefCode)) as Array<{
    qid?: string;
    name_ja: string | null;
    name_en: string | null;
    coordinates: { lat: number; lng: number } | null;
    municipality: string | null;
    point_in_time: string | null;
    start_time: string | null;
    wikidata_url?: string;
  }>;

  let filtered = festivals;
  if (typeof args.month === "number" && args.month >= 1 && args.month <= 12) {
    filtered = festivals.filter((f) => {
      const dt = f.point_in_time ?? f.start_time;
      if (!dt) return false;
      const m = dt.match(/-(\d{2})-/);
      if (!m) return false;
      return parseInt(m[1], 10) === args.month;
    });
  }

  return {
    prefecture_code: prefCode,
    month_filter: args.month ?? null,
    count: filtered.length,
    events: filtered,
    source: "Wikidata SPARQL (live query, cached in-memory per prefecture)",
    note: "Festivals registered in Wikidata. Coverage is uneven — small local festivals may be missing. For comprehensive listings consult prefectural tourism associations directly.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_description
//
// Returns the AI-generated 17-language tourism description for a given
// Wikidata QID. Sourced from data/translations/descriptions_complete.jsonl
// (generated 2026-04-26 via Claude Sonnet 4.6 batch).

async function getDescription(args: {
  qid: string;
  lang?: string;
}): Promise<unknown> {
  if (!args.qid) {
    return { error: "qid required", disclaimer: DISCLAIMER };
  }
  const map = await loadDescriptions();
  const rec = map.get(args.qid);
  if (!rec) {
    return {
      error: "not_found",
      qid: args.qid,
      hint: "Description coverage is limited to entities with a Japanese-language Wikipedia anchor (~13,400 spots). Use get_multilingual for sparse coverage with names only.",
      disclaimer: DISCLAIMER,
    };
  }

  // Also fetch the canonical names (Phase 4 names output)
  const nameRec = (await loadNames()).get(args.qid);
  const names: Partial<Record<string, string | null>> = nameRec?.translations ?? {};

  // If lang specified and supported, return only that language (still include name in same lang for context)
  if (args.lang && (SUPPORTED_LANGUAGES as readonly string[]).includes(args.lang)) {
    const lang = args.lang as SupportedLang;
    return {
      qid: args.qid,
      lang,
      name: names[lang] ?? null,
      description: rec.descriptions[lang] ?? null,
      confidence: rec.confidence,
      generated_at: rec.generated_at ?? null,
      source: "ai_generated",
      model: "claude-sonnet-4-6",
      disclaimer: DISCLAIMER,
    };
  }

  // Otherwise return all 17 languages
  return {
    qid: args.qid,
    languages_returned: Object.keys(rec.descriptions),
    names,
    descriptions: rec.descriptions,
    confidence: rec.confidence,
    generated_at: rec.generated_at ?? null,
    source: "ai_generated",
    model: "claude-sonnet-4-6",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// R-3 data loaders (specialty / traditional arts / japan heritage)

function findR3Path(file: string): string {
  // Primary: the resolved DATA_ROOT (typically HF cache when running from a
  // user install). Fallback: repo-local data/r3/ — useful for newly-added
  // R-3 files that haven't been pushed to the HF dataset yet (e.g. dmo.json
  // before the next dataset upload).
  const primary = resolve(dataRoot(), `r3/${file}`);
  if (existsSync(primary)) return primary;
  const repoLocal = resolve(findPackageRoot(), "data", "r3", file);
  if (existsSync(repoLocal)) return repoLocal;
  return primary; // returns missing-path so caller can readFile→catch
}

async function loadR3Json<T>(file: string): Promise<R3SourceFile<T> | null> {
  try {
    const content = await readFile(findR3Path(file), "utf8");
    return JSON.parse(content) as R3SourceFile<T>;
  } catch {
    return null;
  }
}

async function loadMaffGi(): Promise<R3SourceFile<MaffGiRecord> | null> {
  if (cachedMaffGi) return cachedMaffGi;
  cachedMaffGi = await loadR3Json<MaffGiRecord>("maff_gi.json");
  return cachedMaffGi;
}

async function loadMetiDensan(): Promise<R3SourceFile<MetiDensanRecord> | null> {
  if (cachedMetiDensan) return cachedMetiDensan;
  cachedMetiDensan = await loadR3Json<MetiDensanRecord>("meti_densan.json");
  return cachedMetiDensan;
}

async function loadJapanHeritage(): Promise<
  R3SourceFile<JapanHeritageRecord> | null
> {
  if (cachedJapanHeritage) return cachedJapanHeritage;
  cachedJapanHeritage =
    await loadR3Json<JapanHeritageRecord>("japan_heritage.json");
  return cachedJapanHeritage;
}

async function loadBunkaIntangible(): Promise<
  R3SourceFile<BunkaIntangibleRecord> | null
> {
  if (cachedBunkaIntangible) return cachedBunkaIntangible;
  cachedBunkaIntangible =
    await loadR3Json<BunkaIntangibleRecord>("bunka_intangible.json");
  return cachedBunkaIntangible;
}

async function loadUnescoJapan(): Promise<
  R3SourceFile<UnescoJapanRecord> | null
> {
  if (cachedUnescoJapan) return cachedUnescoJapan;
  cachedUnescoJapan = await loadR3Json<UnescoJapanRecord>("unesco_japan.json");
  return cachedUnescoJapan;
}

async function loadDmo(): Promise<DmoFile | null> {
  if (cachedDmo) return cachedDmo;
  try {
    const content = await readFile(findR3Path("dmo.json"), "utf8");
    cachedDmo = JSON.parse(content) as DmoFile;
  } catch {
    cachedDmo = null;
  }
  return cachedDmo;
}

async function loadR3Translations(): Promise<Map<string, R3TranslationRecord>> {
  if (cachedR3Translations) return cachedR3Translations;
  const map = new Map<string, R3TranslationRecord>();
  try {
    const content = await readFile(
      findR3Path("translations/r3_translations.jsonl"),
      "utf8",
    );
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as R3TranslationRecord;
        if (rec.key) map.set(rec.key, rec);
      } catch {
        // skip malformed
      }
    }
  } catch {
    // file missing → empty map; tools degrade gracefully to ja-only output
  }
  cachedR3Translations = map;
  return map;
}

/** Return the best-available name in `lang` for an R-3 record. */
function pickR3Name(
  fallback: string | null,
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.name?.[lang as SupportedLang]) {
    return rec.name[lang as SupportedLang]!;
  }
  return fallback;
}

/** Return the best-available description in `lang` for an R-3 record. */
function pickR3Description(
  fallbackJa: string | null,
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.description?.[lang as SupportedLang]) {
    return rec.description[lang as SupportedLang]!;
  }
  if (!lang || lang === "ja") return fallbackJa;
  return fallbackJa; // fallback to ja when target lang missing
}

function r3Translation(
  rec: R3TranslationRecord | undefined,
  lang: string | undefined,
): {
  source: "official_translated" | "official_only";
  generated_at: string | null;
  confidence: "high" | "medium" | "low" | null;
} {
  if (lang && rec?.description?.[lang as SupportedLang]) {
    return {
      source: "official_translated",
      generated_at: rec.generated_at ?? null,
      confidence: rec.confidence ?? null,
    };
  }
  return { source: "official_only", generated_at: null, confidence: null };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_local_specialty
//
// Returns regional specialties (food + crafts) for a Japanese prefecture,
// drawn ONLY from official designation systems:
//   - 農林水産省 GI (geographical indication of agricultural products)
//   - 経済産業省 伝統的工芸品 (METI-designated traditional crafts)
// No editorial or AI-curated picks. Items the official authorities have not
// designated will not appear here.

async function getLocalSpecialty(args: {
  prefecture?: string;
  category?: string; // "food" | "craft" | undefined (both)
  lang?: string;
  include_overseas?: boolean;
}): Promise<unknown> {
  const wantFood = !args.category || args.category === "food";
  const wantCraft = !args.category || args.category === "craft";
  // The MAFF GI registry includes a small number of foreign-country GIs
  // (Italy / Vietnam / Thailand etc.) that Japan recognises under bilateral
  // protection. They have empty prefecture_codes. Default to hiding them so
  // the tool returns Japan-domestic items only; callers can opt in.
  const includeOverseas = args.include_overseas === true;

  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const lang = args.lang;
  const translations = await loadR3Translations();

  const items: unknown[] = [];

  if (wantFood) {
    const f = await loadMaffGi();
    if (f) {
      for (const r of f.records) {
        if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
        if (!includeOverseas && r.prefecture_codes.length === 0) continue;
        const key = `maff_gi:${r.registration_number}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "food",
          authority: r.authority,
          designation: "GI (Geographical Indication)",
          registration_number: r.registration_number,
          name_ja: r.name_ja,
          name: pickR3Name(r.name_ja, t, lang),
          description_ja: r.characteristics_ja,
          description: pickR3Description(r.characteristics_ja, t, lang),
          registration_date: r.registration_date,
          production_area_text: r.production_area_text,
          prefecture_codes: r.prefecture_codes,
          producer_group: r.producer_group,
          source_url: r.detail_url,
          translation_meta: meta,
        });
      }
    }
  }

  if (wantCraft) {
    const f = await loadMetiDensan();
    if (f) {
      for (const r of f.records) {
        if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
        const key = `meti_densan:${r.craft_id}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "craft",
          authority: r.authority,
          designation: "Traditional Craft (伝統的工芸品)",
          industry_category: r.industry_category,
          craft_id: r.craft_id,
          name_ja: r.name_ja,
          name: pickR3Name(r.name_ja, t, lang),
          description_ja: r.features_ja,
          description: pickR3Description(r.features_ja, t, lang),
          designation_date: r.designation_date,
          production_area_text: r.production_area_text,
          prefecture_codes: r.prefecture_codes,
          source_url: r.detail_url,
          translation_meta: meta,
        });
      }
    }
  }

  return {
    prefecture_code: prefCode,
    category_filter: args.category ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      { name: "農林水産省 (MAFF) Geographical Indication", category: "food" },
      {
        name: "経済産業省 (METI) Traditional Crafts (伝統的工芸品)",
        category: "craft",
      },
    ],
    note: "Only items officially designated by MAFF or METI appear. Non-designated regional foods/crafts are intentionally excluded.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_traditional_arts
//
// Returns Japanese traditional / intangible cultural assets, drawn ONLY from
// official designation systems:
//   - 文化庁 重要無形文化財          (Important Intangible Cultural Property)
//   - 文化庁 重要無形民俗文化財      (Important Intangible Folk Cultural Property)
//   - UNESCO Intangible Cultural Heritage (Japan inscriptions)
// Wikidata is the carrier (CC0); the underlying designation data is from the
// authorities above.

async function getTraditionalArts(args: {
  category?: string; // "important" | "folk" | "unesco" | undefined (all)
  keyword?: string;
  lang?: string;
}): Promise<unknown> {
  const lang = args.lang;
  const translations = await loadR3Translations();
  const items: unknown[] = [];

  const wantImportant = !args.category || args.category === "important";
  const wantFolk = !args.category || args.category === "folk";
  const wantUnesco = !args.category || args.category === "unesco";

  const keywordRe = compileKeywordMatcher(args.keyword);

  if (wantImportant || wantFolk) {
    const f = await loadBunkaIntangible();
    if (f) {
      for (const r of f.records) {
        const isFolk = r.designation_qid === "Q6573893";
        if (isFolk && !wantFolk) continue;
        if (!isFolk && !wantImportant) continue;
        if (!keywordRe(r.name_ja, r.name_en, r.description_ja, r.description_en)) continue;
        const key = `bunka_intangible:${r.qid}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: isFolk ? "folk" : "important",
          authority: r.authority,
          designation: r.designation,
          qid: r.qid,
          name_ja: r.name_ja,
          name_en: r.name_en,
          name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
          description_ja: r.description_ja,
          description_en: r.description_en,
          description: pickR3Description(
            r.description_ja ?? r.description_en,
            t,
            lang,
          ),
          inception: r.inception,
          bunca_id: r.bunca_id,
          source_url: r.wikidata_url,
          translation_meta: meta,
        });
      }
    }
  }

  if (wantUnesco) {
    const f = await loadUnescoJapan();
    if (f) {
      for (const r of f.records) {
        if (!keywordRe(r.name_ja, r.name_en, r.description_ja, r.description_en)) continue;
        const key = `unesco_japan:${r.qid}`;
        const t = translations.get(key);
        const meta = r3Translation(t, lang);
        items.push({
          key,
          category: "unesco",
          authority: r.authority,
          designation: "UNESCO Intangible Cultural Heritage",
          qid: r.qid,
          name_ja: r.name_ja,
          name_en: r.name_en,
          name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
          description_ja: r.description_ja,
          description_en: r.description_en,
          description: pickR3Description(
            r.description_ja ?? r.description_en,
            t,
            lang,
          ),
          inscription_year: r.inscription_year,
          unesco_id: r.unesco_id,
          source_url: r.wikidata_url,
          translation_meta: meta,
        });
      }
    }
  }

  return {
    category_filter: args.category ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      {
        name: "文化庁 (Agency for Cultural Affairs) — Important Intangible Cultural Properties (重要無形文化財・重要無形民俗文化財)",
        carrier: "Wikidata (CC0)",
      },
      {
        name: "UNESCO Intangible Cultural Heritage (Japan inscriptions)",
        carrier: "Wikidata (CC0)",
      },
    ],
    note: "Only items officially designated by 文化庁 or UNESCO appear. Coverage on Wikidata is incomplete vs. the full bunka.go.jp registry; for authoritative lookup use the bunka_id link.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_japan_heritage
//
// Returns 文化庁 Japan Heritage stories (104 designated). Optional prefecture
// or theme filter.

async function getJapanHeritage(args: {
  prefecture?: string;
  theme?: string;
  lang?: string;
}): Promise<unknown> {
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const lang = args.lang;
  const translations = await loadR3Translations();
  const f = await loadJapanHeritage();
  if (!f) {
    return {
      error: "japan_heritage data not loaded",
      hint: "Run scrapers/sources/fetch_japan_heritage.ts to populate data/r3/japan_heritage.json",
      disclaimer: DISCLAIMER,
    };
  }

  const items: unknown[] = [];
  for (const r of f.records) {
    if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
    if (
      args.theme &&
      !r.themes.some((t) => t.includes(args.theme!) || args.theme!.includes(t))
    )
      continue;
    const key = `japan_heritage:${r.story_id}`;
    const t = translations.get(key);
    const meta = r3Translation(t, lang);
    items.push({
      key,
      story_id: r.story_id,
      authority: r.authority,
      title_ja: r.title_ja,
      subtitle_ja: r.subtitle_ja,
      title: pickR3Name(r.title_ja, t, lang),
      summary_ja: r.summary_ja,
      summary: pickR3Description(r.summary_ja, t, lang),
      // The full Japan Heritage story body is much richer (typically
      // 1,500-3,500 chars) than the summary. We don't have it translated
      // yet — translation cost ~$10 for all 104 stories × 17 langs is on
      // the to-do list — so we expose `body_ja` directly. A multilingual
      // LLM client can summarise / translate at query time, which is much
      // better than leaving the rich content hidden behind the summary.
      body_ja: r.body_ja ?? null,
      themes: r.themes,
      periods: r.periods,
      related_areas_text: r.related_areas_text,
      prefecture_codes: r.prefecture_codes,
      source_url: r.story_url,
      translation_meta: meta,
    });
  }

  return {
    prefecture_code: prefCode,
    theme_filter: args.theme ?? null,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      {
        name: "文化庁 Japan Heritage (日本遺産) ポータルサイト",
        url: "https://japan-heritage.bunka.go.jp/",
      },
    ],
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_dmo
//
// Returns 観光庁 (Japan Tourism Agency) registered + candidate DMO
// (Destination Management Organization) entities. Source of truth is the
// agency's published registry — see scrapers/sources/fetch_dmo.py for the
// fetcher.

async function getDmo(args: {
  prefecture?: string;
  type?: string; // "broad" | "prefectural" | "regional" | "candidate"
  status?: string; // "registered" | "candidate"
  lang?: string;
}): Promise<unknown> {
  let prefCode: string | null = null;
  let prefName: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
    prefName = (await bareNameForPref(prefCode)) ?? null;
  }

  const f = await loadDmo();
  if (!f) {
    return {
      error: "dmo data not loaded",
      hint: "Run scrapers/sources/fetch_dmo.py to populate data/r3/dmo.json",
      disclaimer: DISCLAIMER,
    };
  }

  const TYPE_MAP: Record<string, string[]> = {
    broad: ["広域連携"],
    prefectural: ["都道府県"],
    regional: ["地域", "地域(地域連携)"],
    candidate: ["地域", "地域(地域連携)"], // candidate-status, any class
  };
  const wantClasses = args.type ? TYPE_MAP[args.type] : null;

  const items: unknown[] = [];
  for (const r of f.entries) {
    if (args.status && r.status !== args.status) continue;
    if (args.type === "candidate" && r.status !== "candidate") continue;
    if (wantClasses && !wantClasses.some((c) => r.registration_class.includes(c))) {
      continue;
    }
    if (prefCode) {
      const matchesPref =
        r.prefectures.some((p) => p === prefName + "県" || p.startsWith(prefName ?? "__")) ||
        (prefName ? r.prefectures.some((p) => p.includes(prefName!)) : false);
      if (!matchesPref) continue;
    }
    items.push({
      id: r.id,
      name: r.name,
      name_normalized: r.name_normalized,
      registration_class: r.registration_class,
      status: r.status,
      prefectures: r.prefectures,
      municipalities: r.municipalities,
      area_text: r.raw_area_text,
      plan_pdf_url: r.plan_pdf_url,
      authority: r.authority,
      source_url: r.source,
    });
  }

  return {
    prefecture_code: prefCode,
    type_filter: args.type ?? null,
    status_filter: args.status ?? null,
    lang: args.lang ?? null,
    count: items.length,
    items,
    sources: [
      {
        name: "観光庁 登録DMO一覧 + 候補DMO一覧",
        url: f.source,
      },
    ],
    note:
      "DMOs (Destination Management Organizations) are the official tourism-coordination bodies registered with 観光庁. `plan_pdf_url` links to each DMO's 形成確立計画 PDF — the foundational document explaining their target area, mission, and stakeholder structure.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: search_semantic
//
// Vector-similarity search over the prebuilt multilingual-e5 embedding
// matrix (Phase 2, 2026-05-01). Returns the top-k entries most similar to
// the query in any of e5's supported languages. Falls back gracefully when
// the embedding binary hasn't been built yet (`available: false`).

async function searchSemantic(args: {
  q: string;
  prefecture?: string;
  kind?: string;
  k?: number;
}): Promise<unknown> {
  if (!args.q?.trim()) {
    return {
      error: "q required",
      hint: "Provide a natural-language query in any language. Example: q='京都の伝統工芸'",
      disclaimer: DISCLAIMER,
    };
  }
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        disclaimer: DISCLAIMER,
      };
    }
  }
  const k = Math.max(1, Math.min(args.k ?? 10, 50));
  // Try the resolved DATA_ROOT (HF cache when running as a user install) and
  // the repo root as fallback — the embedding binary is sometimes only in the
  // dev tree before the next HF dataset upload, same pattern as findR3Path.
  const candidateRoots = [dataRoot()];
  const repoRoot = resolve(findPackageRoot(), "data");
  if (!candidateRoots.includes(repoRoot)) candidateRoots.push(repoRoot);
  let out: Awaited<ReturnType<typeof semanticSearch>> | null = null;
  for (const root of candidateRoots) {
    out = await semanticSearch(root, args.q, k, {
      prefecture_code: prefCode,
      kind: args.kind ?? null,
    });
    if (out.available) break;
  }
  if (!out) out = { available: false, reason: "no_root_resolved" };
  if (!out.available) {
    return {
      available: false,
      reason: out.reason,
      hint:
        "Vector index not built yet. Run `npm run embed:build` to populate data/embeddings/.",
      query: args.q,
      disclaimer: DISCLAIMER,
    };
  }
  return {
    available: true,
    query: args.q,
    prefecture_code: prefCode,
    kind: args.kind ?? null,
    k,
    built_at: out.built_at,
    indexed_count: out.count,
    results: (out.results ?? []).map((r) => ({
      score: Number(r.score.toFixed(4)),
      key: r.entry.key,
      kind: r.entry.kind,
      source: r.entry.source,
      name: r.entry.name,
      description: r.entry.description ?? null,
      prefecture: r.entry.prefecture_name ?? null,
      municipality: r.entry.municipality ?? null,
      url: r.entry.url ?? null,
    })),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: search_hybrid
//
// BM25 + multilingual-e5 fused with Reciprocal Rank Fusion (Phase 3-min).
// Uses the same prebuilt embedding binary as search_semantic; the BM25
// inverted index is built in-memory at first use over the same corpus.

async function searchHybrid(args: {
  q: string;
  prefecture?: string;
  kind?: string;
  k?: number;
}): Promise<unknown> {
  if (!args.q?.trim()) {
    return {
      error: "q required",
      hint: "Provide a natural-language query in any language.",
      disclaimer: DISCLAIMER,
    };
  }
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return { error: `unknown_prefecture: ${args.prefecture}`, disclaimer: DISCLAIMER };
    }
  }
  const k = Math.max(1, Math.min(args.k ?? 10, 50));
  const candidateRoots = [dataRoot()];
  const repoRoot = resolve(findPackageRoot(), "data");
  if (!candidateRoots.includes(repoRoot)) candidateRoots.push(repoRoot);
  let out: Awaited<ReturnType<typeof hybridSearch>> | null = null;
  for (const root of candidateRoots) {
    out = await hybridSearch(root, args.q, k, {
      prefecture_code: prefCode,
      kind: args.kind ?? null,
    });
    if (out.available) break;
  }
  if (!out) out = { available: false, query: args.q, k, reason: "no_root_resolved" };
  if (!out.available) {
    return {
      available: false,
      reason: out.reason,
      hint: "Build the embedding index with `npm run embed:build`.",
      query: args.q,
      disclaimer: DISCLAIMER,
    };
  }
  return {
    available: true,
    query: args.q,
    prefecture_code: prefCode,
    kind: args.kind ?? null,
    k,
    bm_count: out.bm_count,
    vec_count: out.vec_count,
    results: (out.results ?? []).map((r) => ({
      score: r.score,
      rank_bm: r.rank_bm,
      rank_vec: r.rank_vec,
      key: r.entry.key,
      kind: r.entry.kind,
      source: r.entry.source,
      name: r.entry.name,
      description: r.entry.description ?? null,
      prefecture: r.entry.prefecture_name ?? null,
      municipality: r.entry.municipality ?? null,
      url: r.entry.url ?? null,
    })),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_local_food
//
// Like get_local_specialty (food + craft) but food-only AND wider — beyond
// the MAFF GI registry it also surfaces local-food entries the municipal /
// tourism-association scrape picked up (ご当地グルメ / 名物 / 郷土料理 /
// 銘菓 / 地酒). Added 2026-04-30 (ADR 0001 / D2): MAFF GI alone misses the
// regional dishes that don't have a formal designation but are nonetheless
// what the prefecture's tourism portal foregrounds.

const FOOD_KEYWORDS_JA = [
  "グルメ", "ご当地グルメ", "ご当地", "名物", "名産",
  "銘菓", "銘酒", "地酒", "和菓子", "郷土料理",
  "ご当地スイーツ", "麺", "ラーメン", "うどん", "そば",
  "丼", "弁当", "B級グルメ",
];

const FOOD_KEYWORDS_EN = [
  "cuisine", "gourmet", "local food", "local-food", "specialty",
  "dish", "noodle", "ramen", "udon", "soba", "sushi", "sake",
];

function isFoodText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const k of FOOD_KEYWORDS_JA) {
    if (text.includes(k)) return true;
  }
  const low = text.toLowerCase();
  for (const k of FOOD_KEYWORDS_EN) {
    if (low.includes(k)) return true;
  }
  return false;
}

async function getLocalFood(args: {
  prefecture?: string;
  keyword?: string;
  lang?: string;
  include_overseas?: boolean;
}): Promise<unknown> {
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const includeOverseas = args.include_overseas === true;
  const lang = args.lang;
  const keywordRe = compileKeywordMatcher(args.keyword);
  const translations = await loadR3Translations();
  const items: unknown[] = [];

  // ── source 1: MAFF GI (food only)
  const maff = await loadMaffGi();
  if (maff) {
    for (const r of maff.records) {
      if (prefCode && !r.prefecture_codes.includes(prefCode)) continue;
      if (!includeOverseas && r.prefecture_codes.length === 0) continue;
      if (!keywordRe(r.name_ja, r.characteristics_ja)) continue;
      const key = `maff_gi:${r.registration_number}`;
      const t = translations.get(key);
      const meta = r3Translation(t, lang);
      items.push({
        source: "maff_gi",
        category: "designated_food",
        key,
        registration_number: r.registration_number,
        name_ja: r.name_ja,
        name: pickR3Name(r.name_ja, t, lang),
        description_ja: r.characteristics_ja,
        description: pickR3Description(r.characteristics_ja, t, lang),
        registration_date: r.registration_date,
        production_area_text: r.production_area_text,
        prefecture_codes: r.prefecture_codes,
        producer_group: r.producer_group,
        source_url: r.detail_url,
        translation_meta: meta,
      });
    }
  }

  // ── source 2: scraped municipal / tourism-association pages
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    if (prefCode && p.prefecture.code !== prefCode) continue;
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        const bodyJoin = ((s as { body_paragraphs?: string[] }).body_paragraphs ?? []).join(" ");
        if (
          !isFoodText(s.name) &&
          !isFoodText(s.description) &&
          !isFoodText(bodyJoin)
        ) {
          continue;
        }
        if (!keywordRe(s.name, s.description, bodyJoin)) continue;
        items.push({
          source: "scraped_local_food",
          category: "regional_dish",
          name_ja: s.name,
          name: s.name,
          description_ja: s.description ?? null,
          description: s.description ?? null,
          body_paragraphs: (s as { body_paragraphs?: string[] }).body_paragraphs ?? [],
          spot_url: s.url,
          spot_id: s.id,
          municipality: m.municipality.name,
          prefecture: p.prefecture.name,
          prefecture_code: p.prefecture.code,
        });
      }
    }
  }

  return {
    prefecture_code: prefCode,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      { name: "農林水産省 (MAFF) Geographical Indication — designated foods only" },
      { name: "Municipal & tourism-association websites — pages tagged with ご当地グルメ / 名物 / 郷土料理 / etc." },
    ],
    note: "Two-tier: officially-designated GIs first, then anything the municipal / tourism-association scrape surfaced as local-food content. The scraped tier is broader but each entry's authority is whichever site published it.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_festivals
//
// Festivals (祭り / matsuri / 神事 / 行事) aggregated from every source we
// have that records them, deduplicated. Added 2026-04-30 (ADR 0001 / D1)
// because get_events alone (Wikidata SPARQL) had zero coverage in many
// prefectures (Yamanashi, Saga, …) and festivals are too central to
// Japanese tourism to leave at zero.
//
// Sources combined:
//   - bunka_intangible.json   (重要無形民俗文化財 — designated folk rituals)
//   - unesco_japan.json       (UNESCO ICH inscriptions for Japan)
//   - data/prefectures/*.json (per-page schema_events scraped from
//                              municipal / tourism-association sites)
//   - get_events (live Wikidata SPARQL) — exposed separately, not merged
//                              here because of latency

const FESTIVAL_KEYWORDS_JA = [
  "祭", "祭り", "祭礼", "まつり", "マツリ",
  "神事", "神楽", "神輿", "舞楽",
  "行事", "縁日", "灯籠", "山車", "山鉾", "花火",
];

const FESTIVAL_KEYWORDS_EN = [
  "festival", "matsuri", "fire festival", "lantern festival",
  "ritual", "rite", "ceremony",
];

function isFestivalText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const k of FESTIVAL_KEYWORDS_JA) {
    if (text.includes(k)) return true;
  }
  const low = text.toLowerCase();
  for (const k of FESTIVAL_KEYWORDS_EN) {
    if (low.includes(k)) return true;
  }
  return false;
}

async function getFestivals(args: {
  prefecture?: string;
  keyword?: string;
  lang?: string;
}): Promise<unknown> {
  let prefCode: string | null = null;
  if (args.prefecture) {
    prefCode = await resolvePrefectureCode(args.prefecture);
    if (!prefCode) {
      return {
        error: `unknown_prefecture: ${args.prefecture}`,
        hint: "Use Japanese name (e.g. '京都府'), English slug, or 2-digit JIS code.",
        disclaimer: DISCLAIMER,
      };
    }
  }
  const lang = args.lang;
  const keywordRe = compileKeywordMatcher(args.keyword);
  const translations = await loadR3Translations();
  const items: unknown[] = [];

  // ── source 1: bunka_intangible (designated folk rituals)
  // bunka records carry no prefecture_code, but their description_ja
  // almost always mentions the prefecture by name (e.g. "山梨県富士吉田市
  // で行われる祭り"). When the caller filters by prefecture, we honour it
  // by text-matching the bare prefecture name against name + description.
  const bareName = prefCode ? await bareNameForPref(prefCode) : null;
  const matchesPref = (text: string | null | undefined): boolean => {
    if (!prefCode) return true;
    if (!bareName) return true;
    return !!text && text.includes(bareName);
  };
  const bunka = await loadBunkaIntangible();
  if (bunka) {
    for (const r of bunka.records) {
      if (!isFestivalText(r.name_ja) && !isFestivalText(r.name_en)) continue;
      if (
        prefCode &&
        !matchesPref(r.name_ja) &&
        !matchesPref(r.description_ja) &&
        !matchesPref(r.description_en)
      ) {
        continue;
      }
      if (!keywordRe(r.name_ja, r.name_en, r.description_ja, r.description_en)) continue;
      const key = `bunka_intangible:${r.qid}`;
      const t = translations.get(key);
      const meta = r3Translation(t, lang);
      items.push({
        source: "bunka_intangible",
        key,
        name_ja: r.name_ja,
        name_en: r.name_en,
        name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
        description_ja: r.description_ja,
        description_en: r.description_en,
        description: pickR3Description(
          r.description_ja ?? r.description_en,
          t,
          lang,
        ),
        designation: r.designation,
        date: r.inception ?? null,
        bunca_id: r.bunca_id,
        source_url: r.wikidata_url,
        translation_meta: meta,
      });
    }
  }

  // ── source 2: UNESCO ICH inscriptions
  const unesco = await loadUnescoJapan();
  if (unesco) {
    for (const r of unesco.records) {
      if (!isFestivalText(r.name_ja) && !isFestivalText(r.name_en)) continue;
      if (!keywordRe(r.name_ja, r.name_en, r.description_ja, r.description_en)) continue;
      const key = `unesco_japan:${r.qid}`;
      const t = translations.get(key);
      const meta = r3Translation(t, lang);
      items.push({
        source: "unesco_japan",
        key,
        name_ja: r.name_ja,
        name_en: r.name_en,
        name: pickR3Name(r.name_ja ?? r.name_en, t, lang),
        description_ja: r.description_ja,
        description_en: r.description_en,
        description: pickR3Description(
          r.description_ja ?? r.description_en,
          t,
          lang,
        ),
        designation: "UNESCO Intangible Cultural Heritage",
        inscription_year: r.inscription_year,
        unesco_id: r.unesco_id,
        source_url: r.wikidata_url,
        translation_meta: meta,
      });
    }
  }

  // ── source 3: schema.org Events scraped from municipal / tourism sites
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    if (prefCode && p.prefecture.code !== prefCode) continue;
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        const events = (s as { schema_events?: unknown[] }).schema_events ?? [];
        for (const ev of events) {
          if (!ev || typeof ev !== "object") continue;
          const e = ev as Record<string, unknown>;
          const name = (e.name as string | null) ?? null;
          const desc = (e.description as string | null) ?? null;
          if (
            !isFestivalText(name) &&
            !isFestivalText(desc) &&
            !isFestivalText(s.name)
          ) {
            continue;
          }
          if (!keywordRe(name, desc, s.name, s.description)) continue;
          items.push({
            source: "scraped_schema_event",
            name_ja: name,
            name,
            description_ja: desc,
            description: desc,
            event_type: (e.type as string | null) ?? null,
            start_date: (e.start_date as string | null) ?? null,
            end_date: (e.end_date as string | null) ?? null,
            location: (e.location as string | null) ?? null,
            spot_url: s.url,
            spot_name: s.name,
            municipality: m.municipality.name,
            prefecture: p.prefecture.name,
            source_url: (e.url as string | null) ?? s.url,
          });
        }
      }
    }
  }

  // bunka was filtered inline by prefecture name match;
  // unesco_japan stays unfiltered (UNESCO ICH inscriptions are national-
  // level cultural assets — 歌舞伎, 文楽, 和食 etc. — so a visitor planning
  // a trip to Yamanashi should still see them);
  // scraped_schema_event is already prefecture-scoped at iteration time.

  return {
    prefecture_code: prefCode,
    lang: lang ?? null,
    count: items.length,
    items,
    sources: [
      { name: "文化庁 重要無形民俗文化財 (via Wikidata, CC0)" },
      { name: "UNESCO Intangible Cultural Heritage (Japan, via Wikidata, CC0)" },
      {
        name: "Schema.org Event objects scraped from municipal and tourism-association websites",
      },
    ],
    note:
      "Multi-source aggregation — designated folk rituals, UNESCO inscriptions, and any structured Event objects we found in the municipal scrape. For live Wikidata festival queries (with month filtering) use get_events.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_multilingual (signature tool)

async function getMultilingual(args: {
  spot_id: string;
  lang?: string;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      if (a.qid === args.spot_id) {
        return {
          spot_id: a.qid,
          source: "wikidata",
          languages: {
            ja: a.name_ja,
            en: a.name_en,
            zh: a.name_zh,
            ko: a.name_ko,
          },
          description_en: a.description_en,
          coordinates: a.coordinates,
          wikidata_url: a.wikidata_url,
          prefecture: p.prefecture.name,
          municipality: a.admin_name,
          data_as_of: p.data_as_of,
          disclaimer: DISCLAIMER,
        };
      }
    }
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        if (s.id === args.spot_id) {
          return {
            spot_id: s.id,
            source: "municipal_scrape",
            languages: { [s.language]: s.name },
            note: "Municipal-scraped spots typically lack multilingual labels. Try a Wikidata QID via search_area for richer multilingual coverage.",
            url: s.url,
            description: s.description,
            data_as_of: p.data_as_of,
            disclaimer: DISCLAIMER,
          };
        }
      }
    }
  }
  return {
    error: "not_found",
    spot_id: args.spot_id,
    hint: "Use search_area or get_spots first to obtain a valid spot_id.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool definitions (advertised via ListTools)

const TOOLS = [
  {
    name: "search_area",
    description:
      "Search Japan tourism data by name or keyword. Returns matching prefectures, municipalities, and tourist attractions.\n\nUse this when the user wants to find an area or a specific spot by name. Static reference data, not live search.\n\nAccepts Japanese, English, Chinese, or Korean queries — the data layer searches all label languages.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query (any language)",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description: "Preferred response language hint",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_spots",
    description:
      "Returns tourist spots in a given prefecture or municipality.\n\nCombines two parallel data sources:\n  - Municipal-website scraping (spots from official tourism pages)\n  - Wikidata (multilingual labels, coordinates, CC0 license)\n\nUse this when the user wants to know 'what to see' in an area. Does NOT return availability or pricing — this is static reference data.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture name in Japanese, English, or 2-digit JIS code (e.g., '鳥取県', 'tottori', '31')",
        },
        city: {
          type: "string",
          description:
            "Municipality name in Japanese (e.g., '南山城村', '宇治市'). Partial match supported — '南山城' will hit '南山城村'.",
        },
        municipality: {
          type: "string",
          description: "Alias for `city`. Same partial-match semantics.",
        },
        min_quality: {
          type: "number",
          description:
            "Minimum quality score (0-1) for scraped spots. Default 0.30 — drops admin-page noise (city-office news / 新着情報-style placeholder titles). Set to 0 to see all entries regardless of completeness.",
        },
        limit: {
          type: "number",
          description: "Max spots to return (1–500, default 50)",
        },
      },
    },
  },
  {
    name: "get_hotels",
    description:
      "Returns accommodations (hotels, ryokan, hostels, guest houses) in Japan.\n\nData is merged from Wikidata (CC0) and OpenStreetMap (ODbL). Records carry multilingual names, coordinates, phone, and website where available. Confirmed clusters (same property in both sources) are flagged.\n\nFilter by prefecture, city (substring match), or coordinate radius. lat+lng+radius (metres) is the most precise — sorted by distance.\n\nDoes NOT return availability or pricing. For bookings, visit the property's official site.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description: "Prefecture (Japanese name, English slug, or 2-digit code)",
        },
        city: {
          type: "string",
          description: "City / municipality name (substring match)",
        },
        lat: { type: "number", description: "Centre latitude for radius search" },
        lng: { type: "number", description: "Centre longitude for radius search" },
        radius: {
          type: "number",
          description: "Radius in metres (used with lat+lng)",
        },
        limit: {
          type: "number",
          description: "Max results (1–500, default 50)",
        },
      },
    },
  },
  {
    name: "get_transport",
    description:
      "Returns access information for a tourist spot: coordinates, prefecture, municipality, and the official URL where the property documents how to get there.\n\nThis tool returns location + source URL. It does NOT (yet) return parsed station names or walk times — for that, follow the official URL. Future versions will add OpenStreetMap-derived railway station data.",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description: "Spot ID from search_area or get_spots (Wikidata QID or municipal ID)",
        },
      },
      required: ["spot_id"],
    },
  },
  {
    name: "get_events",
    description:
      "Returns festivals (祭) registered in Wikidata for a given Japanese prefecture, with optional month filter.\n\nFetches from Wikidata SPARQL on first request per prefecture, then cached in-memory. Coverage is uneven — small local festivals may not be in Wikidata. For comprehensive listings, also consult the prefecture tourism association.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26')",
        },
        month: {
          type: "number",
          minimum: 1,
          maximum: 12,
          description: "Optional 1-12 month filter (matches P585 point_in_time / P580 start_time)",
        },
      },
      required: ["prefecture"],
    },
  },
  {
    name: "get_multilingual",
    description:
      "Returns multilingual NAMES (Japanese / English / Chinese / Korean) for a tourist spot, plus coordinates and Wikidata link.\n\nThis is the lightweight name-lookup tool. For rich 200-300 character DESCRIPTIONS in 17 languages, use get_description instead.",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description:
            "Either a municipal-scrape spot ID or a Wikidata QID (e.g. 'Q11341')",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description:
            "Specific language to highlight in the response (all four languages are still returned)",
        },
      },
      required: ["spot_id"],
    },
  },
  {
    name: "get_description",
    description:
      "SIGNATURE TOOL. Returns a 200-300 character tourism description in any of 17 languages for a tourist spot, generated for global tourist consumption.\n\nLanguages: en, ja, zh, ko, fr, es, de, it, pt, ru, th, vi, id, ms, ar, hi, tl. If `lang` is omitted, all 17 are returned. Coverage: ~13,400 entities (those with Japanese Wikipedia anchor). Use search_area to obtain a Wikidata QID, then pass it as `qid`.\n\nDescriptions are AI-generated by Claude Sonnet 4.6, grounded in entity name + Wikidata metadata. Each entry carries a `confidence` field (high / medium / low) reflecting the quality of the source signal.",
    inputSchema: {
      type: "object",
      properties: {
        qid: {
          type: "string",
          description: "Wikidata QID (e.g. 'Q5854' for Itsukushima Shrine)",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Optional. If specified, returns only that language. If omitted, returns all 17.",
        },
      },
      required: ["qid"],
    },
  },
  {
    name: "get_local_specialty",
    description:
      "Returns regional specialties for a Japanese prefecture, drawn ONLY from official designation systems:\n  - 農林水産省 GI (geographical indication) — protected agricultural products\n  - 経済産業省 伝統的工芸品 — METI-designated traditional crafts\n\nNo editorial or AI-curated picks; items the authorities have not designated will not appear. Use this when the user asks 'what is famous from <prefecture>' for an answer grounded in formal designation rather than tourism marketing.\n\nIf 17-language translations are available (data/r3/translations/r3_translations.jsonl), the requested `lang` is returned; otherwise the original Japanese description is returned with a translation_meta marker.\n\nMAFF GI also protects a small number of foreign-country items (Italian / Vietnamese / Thai produce). They are HIDDEN by default; pass `include_overseas: true` to include them.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture name in Japanese, English slug, or 2-digit JIS code (e.g., '京都府', 'kyoto', '26'). Omit to return everything.",
        },
        category: {
          type: "string",
          enum: ["food", "craft"],
          description: "Restrict to MAFF GI (food) or METI traditional crafts (craft). Omit for both.",
        },
        include_overseas: {
          type: "boolean",
          description:
            "If true, also return MAFF GI items registered for foreign countries (Italy / Vietnam / Thailand etc.). Default false.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_traditional_arts",
    description:
      "Returns Japanese traditional / intangible cultural assets, drawn ONLY from official designation systems:\n  - 文化庁 重要無形文化財 (Important Intangible Cultural Property)\n  - 文化庁 重要無形民俗文化財 (Important Intangible Folk Cultural Property)\n  - UNESCO Intangible Cultural Heritage (Japan inscriptions)\n\nWikidata is used as the multilingual carrier (CC0); the underlying designation data comes from the authorities above. Coverage on Wikidata is incomplete vs. the full 文化庁 registry — for authoritative lookup, follow `bunca_id` / `unesco_id` / `source_url`.\n\nUse the optional `keyword` arg to narrow the result set by substring match against name + description (e.g. `keyword='kabuki'`, `keyword='発酵'`, `keyword='舞'`).",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["important", "folk", "unesco"],
          description:
            "Restrict to a single designation system. Omit for all three.",
        },
        keyword: {
          type: "string",
          description:
            "Optional substring filter applied to name + description (case-insensitive). Examples: 'kabuki', '発酵', '舞'.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_local_food",
    description:
      "Returns Japan's regional foods (ご当地グルメ / 郷土料理 / 銘菓 / 地酒) aggregated from two sources: (1) MAFF Geographical Indications — officially-designated agricultural products with full provenance; (2) the municipal / tourism-association scrape, surfacing the everyday-famous dishes that aren't formally designated but are what the prefecture's tourism portals promote.\n\nUse this when the user asks 'what should I eat in <prefecture>' for an answer that mixes the formally-protected names with the popular local dishes. For crafts as well as food, use `get_local_specialty`.\n\nUse the optional `keyword` arg to narrow large result sets by substring match (e.g. `keyword='発酵'`, `keyword='ramen'`).",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26'). Omit to return all.",
        },
        keyword: {
          type: "string",
          description:
            "Optional substring filter applied to name + description + body (case-insensitive). Examples: '発酵', 'ramen', '日本酒'.",
        },
        include_overseas: {
          type: "boolean",
          description:
            "If true, also return MAFF GI items registered for foreign countries (Italy / Vietnam / Thailand). Default false.",
        },
        lang: {
          type: "string",
          enum: [
            "en", "ja", "zh", "ko", "fr", "es", "de", "it", "pt", "ru",
            "th", "vi", "id", "ms", "ar", "hi", "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_festivals",
    description:
      "Returns Japanese festivals (祭り / matsuri) and traditional rituals aggregated from multiple official sources: 文化庁 Important Intangible Folk Cultural Properties, UNESCO Intangible Cultural Heritage inscriptions for Japan, and any Schema.org Event objects we found in the municipal scrape.\n\nUse this when the user asks about a festival in a specific prefecture — coverage is much wider than `get_events` (which only queries Wikidata live). 17-language translations are returned via `name` / `description` when available.\n\nFor real-time Wikidata SPARQL queries with month filtering, use `get_events` instead.\n\nUse the optional `keyword` arg to narrow large result sets by substring match (e.g. `keyword='花火'` for fireworks-themed festivals).",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26'). Omit to return all.",
        },
        keyword: {
          type: "string",
          description:
            "Optional substring filter applied to name + description (case-insensitive). Examples: '花火', 'fire', '神楽'.",
        },
        lang: {
          type: "string",
          enum: [
            "en", "ja", "zh", "ko", "fr", "es", "de", "it", "pt", "ru",
            "th", "vi", "id", "ms", "ar", "hi", "tl",
          ],
          description:
            "Language for the translated `name` and `description`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "get_japan_heritage",
    description:
      "Returns 文化庁 Japan Heritage (日本遺産) stories — 104 designated narratives that bundle related historic / cultural sites under a unified theme.\n\nEach story includes themes, era tags, related municipalities, and the official summary. Filter by prefecture or theme. For the full constituent assets of a story, follow `source_url` to the official portal.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26')",
        },
        theme: {
          type: "string",
          description:
            "Theme keyword (Japanese; e.g. '城', '海・水辺', '森・木', '繊維・染料', '祭礼'). Substring match.",
        },
        lang: {
          type: "string",
          enum: [
            "en",
            "ja",
            "zh",
            "ko",
            "fr",
            "es",
            "de",
            "it",
            "pt",
            "ru",
            "th",
            "vi",
            "id",
            "ms",
            "ar",
            "hi",
            "tl",
          ],
          description:
            "Language for the translated `title` and `summary`. Defaults to original Japanese.",
        },
      },
    },
  },
  {
    name: "search_hybrid",
    description:
      "Hybrid retrieval — BM25 lexical match + multilingual-e5 semantic match fused with Reciprocal Rank Fusion (Phase 3-min, 2026-05-01).\n\nUses the same prebuilt embedding binary as search_semantic plus an in-memory BM25 inverted index over the same corpus. Returns the top-k results ranked by RRF, exposing each result's BM25 rank and semantic rank for transparency.\n\nUse this for general retrieval — it strictly dominates either retriever alone in our quality benchmarks. Falls back to `available: false` when the embedding binary hasn't been built.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Natural-language query in any language." },
        prefecture: {
          type: "string",
          description: "Restrict to entries tagged to this prefecture.",
        },
        kind: {
          type: "string",
          enum: ["spot", "wikidata", "r3"],
          description: "Restrict to one entity kind.",
        },
        k: { type: "number", description: "Number of results to return (1-50, default 10)." },
      },
      required: ["q"],
    },
  },
  {
    name: "search_semantic",
    description:
      "Vector-similarity search over the prebuilt multilingual-e5 embedding matrix (Phase 2, 2026-05-01). Returns the top-k entries most similar to the query across municipal-scrape spots, Wikidata attractions, and R-3 designation registries.\n\nWorks with natural-language queries in any of e5's supported languages — useful when keyword/substring search misses semantic paraphrases (e.g. user asks 'endangered tradition' and we want to surface 失われゆく職人技).\n\nOptional `prefecture` and `kind` filters narrow the candidate set before scoring. Returns `available: false` with a helpful `reason` when the embedding binary hasn't been built (run `npm run embed:build`).\n\nFor most queries prefer `search_hybrid`, which fuses this with BM25 — semantic alone has worse precision on exact-name queries.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Natural-language query in any language.",
        },
        prefecture: {
          type: "string",
          description:
            "Restrict to entries tagged to this prefecture. Japanese name, English slug, or 2-digit JIS code.",
        },
        kind: {
          type: "string",
          enum: ["spot", "wikidata", "r3"],
          description:
            "Restrict to one entity kind. Omit for all three.",
        },
        k: {
          type: "number",
          description: "Number of results to return (1-50, default 10).",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_dmo",
    description:
      "Returns 観光庁 (Japan Tourism Agency) registered + candidate DMO (Destination Management Organization) entities — the official tourism-coordination bodies for each region.\n\nEach DMO is the authoritative point of contact for stakeholder coordination, marketing, and visitor experience design in its target area. Each entry includes the registration class (広域連携 / 都道府県 / 地域 / 地域連携), the prefectures and municipalities the DMO covers, and a link to the official 形成確立計画 PDF (formation/establishment plan).\n\nUse this when the user asks about who is responsible for a region's tourism, or wants to learn the strategic framing of a destination as written by the body that coordinates it.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture (Japanese name like '京都府', English slug 'kyoto', or 2-digit JIS code '26'). Returns DMOs whose target area includes this prefecture.",
        },
        type: {
          type: "string",
          enum: ["broad", "prefectural", "regional", "candidate"],
          description:
            "Restrict to a registration class: broad (広域連携), prefectural (都道府県), regional (地域 / 地域連携), or candidate (any class with status=candidate). Omit for all.",
        },
        status: {
          type: "string",
          enum: ["registered", "candidate"],
          description: "Filter by registry status. Omit for both.",
        },
        lang: {
          type: "string",
          enum: [
            "en", "ja", "zh", "ko", "fr", "es", "de", "it", "pt", "ru",
            "th", "vi", "id", "ms", "ar", "hi", "tl",
          ],
          description:
            "Reserved — DMO entries are currently Japanese-only; translations will land in a future release.",
        },
      },
    },
  },
];

// ──────────────────────────────────────────────────────────────────────
// Server bootstrap
//
// `buildServer()` and `initDataRoot` are exported so the HTTP entrypoint
// (src/index_http.ts) can reuse the exact same tool registry without
// duplicating the switch table or the data-bootstrap logic.

export { initDataRoot };

export function buildServer(): Server {
  const server = new Server(
    { name: "japan-travel-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );
  registerHandlers(server);
  return server;
}

const server = buildServer();

function registerHandlers(server: Server): void {
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    switch (name) {
      case "search_area":
        result = await searchArea({
          q: String(args.q ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_spots":
        result = await getSpots({
          prefecture: args.prefecture as string | undefined,
          city: args.city as string | undefined,
          municipality: args.municipality as string | undefined,
          min_quality:
            typeof args.min_quality === "number" ? args.min_quality : undefined,
          limit:
            typeof args.limit === "number"
              ? args.limit
              : args.limit
                ? Number(args.limit)
                : undefined,
        });
        break;
      case "get_hotels":
        result = await getHotels({
          prefecture: args.prefecture as string | undefined,
          city: args.city as string | undefined,
          lat: typeof args.lat === "number" ? args.lat : undefined,
          lng: typeof args.lng === "number" ? args.lng : undefined,
          radius: typeof args.radius === "number" ? args.radius : undefined,
          limit:
            typeof args.limit === "number" ? args.limit : args.limit ? Number(args.limit) : undefined,
        });
        break;
      case "get_transport":
        result = await getTransport({ spot_id: String(args.spot_id ?? "") });
        break;
      case "get_events":
        result = await getEvents({
          prefecture: args.prefecture as string | undefined,
          month:
            typeof args.month === "number"
              ? args.month
              : args.month
                ? Number(args.month)
                : undefined,
        });
        break;
      case "get_multilingual":
        result = await getMultilingual({
          spot_id: String(args.spot_id ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_description":
        result = await getDescription({
          qid: String(args.qid ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_local_specialty":
        result = await getLocalSpecialty({
          prefecture: args.prefecture as string | undefined,
          category: args.category as string | undefined,
          lang: args.lang as string | undefined,
          include_overseas: args.include_overseas === true,
        });
        break;
      case "get_traditional_arts":
        result = await getTraditionalArts({
          category: args.category as string | undefined,
          keyword: args.keyword as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      case "get_local_food":
        result = await getLocalFood({
          prefecture: args.prefecture as string | undefined,
          keyword: args.keyword as string | undefined,
          lang: args.lang as string | undefined,
          include_overseas: args.include_overseas === true,
        });
        break;
      case "get_festivals":
        result = await getFestivals({
          prefecture: args.prefecture as string | undefined,
          keyword: args.keyword as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      case "get_japan_heritage":
        result = await getJapanHeritage({
          prefecture: args.prefecture as string | undefined,
          theme: args.theme as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      case "get_dmo":
        result = await getDmo({
          prefecture: args.prefecture as string | undefined,
          type: args.type as string | undefined,
          status: args.status as string | undefined,
          lang: args.lang as string | undefined,
        });
        break;
      case "search_semantic":
        result = await searchSemantic({
          q: String(args.q ?? ""),
          prefecture: args.prefecture as string | undefined,
          kind: args.kind as string | undefined,
          k: typeof args.k === "number" ? args.k : args.k ? Number(args.k) : undefined,
        });
        break;
      case "search_hybrid":
        result = await searchHybrid({
          q: String(args.q ?? ""),
          prefecture: args.prefecture as string | undefined,
          kind: args.kind as string | undefined,
          k: typeof args.k === "number" ? args.k : args.k ? Number(args.k) : undefined,
        });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: (err as Error).message ?? "unknown error",
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});
}  // end registerHandlers

// stdio entrypoint — only runs when this file is executed directly,
// not when it is imported by src/index_http.ts.
async function mainStdio(): Promise<void> {
  await initDataRoot();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[japan-travel-mcp] MCP server running on stdio");
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  mainStdio().catch((err) => {
    console.error("[japan-travel-mcp] FATAL:", err);
    process.exit(1);
  });
}
