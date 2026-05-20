/**
 * Resolve famous Japanese landmark NAMES to Wikidata QIDs and fetch their
 * canonical entity record. Replaces the speculative QID-list approach (which
 * suffered hallucinated QIDs collapsing into unrelated foreign entities).
 *
 * Two-stage pipeline per name:
 *   1. wbsearchentities → top-3 candidate QIDs in ja and en
 *   2. wbgetentities for the candidates → keep the one whose P17=Q17 (Japan)
 *      and has P625 coordinates inside the Japanese bbox.
 *
 * Per-name checkpoint at `data/_state/landmark_by_name.partial/<slug>.json`
 * so the run is fully resumable. Run length scales linearly with name list;
 * a 200-name list finishes in ~4-6 minutes (250 ms wbsearch + 250 ms
 * wbgetentities = ~500 ms / name).
 *
 * Output: `data/_state/landmark_by_name.json` — array of entity records in
 * the same shape as the v2 attractions file (so it can be merged into
 * `data/_state/wikidata_attractions.json` by a follow-up inject script).
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_landmark_by_name.ts
 *   RESUME=1 npx tsx scrapers/sources/fetch_landmark_by_name.ts
 *   LANDMARK_NAMES=path/to/list.txt npx tsx scrapers/sources/fetch_landmark_by_name.ts
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PARTIAL_DIR = resolve(REPO_ROOT, "data/_state/landmark_by_name.partial");
const FINAL_FILE = resolve(REPO_ROOT, "data/_state/landmark_by_name.json");

const API_BASE = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const DELAY_MS = 250;
const RESUME = process.env.RESUME === "1";

// Japan bbox — main four islands + Okinawa + Ogasawara. We accept any coord
// inside this band; the P17=Q17 check is the strict filter.
const JP_BBOX = { latMin: 20.0, latMax: 46.0, lngMin: 122.0, lngMax: 154.0 };

// ──────────────────────────────────────────────────────────────────────
// Curated landmark name list — derived from JNTO top-100, MICHELIN
// Green Guide Japan, common itinerary canon. Each entry is a single
// landmark whose canonical entity is suspected missing or weakly tied to
// our master.
// ──────────────────────────────────────────────────────────────────────
const DEFAULT_NAMES: string[] = [
  // Nara
  "東大寺", "興福寺", "春日大社", "薬師寺",
  // Hiroshima / Miyajima
  "厳島神社", "原爆ドーム", "平和記念公園", "縮景園",
  // Kyoto temples (canonical landmarks)
  "金閣寺", "銀閣寺", "清水寺", "伏見稲荷大社", "竜安寺",
  "南禅寺", "天龍寺", "東福寺", "知恩院", "建仁寺",
  "三十三間堂", "高台寺", "永観堂", "詩仙堂", "曼殊院",
  "三千院", "寂光院", "大原野神社", "嵐山", "渡月橋",
  "嵯峨野竹林", "貴船神社", "鞍馬寺", "下鴨神社",
  "上賀茂神社", "平安神宮", "八坂神社", "祇園", "先斗町",
  "二条城", "京都御所", "錦市場",
  // Tokyo
  "浅草寺", "明治神宮", "靖国神社", "築地場外市場", "豊洲市場",
  "上野恩賜公園", "東京タワー", "東京スカイツリー", "皇居",
  "六本木ヒルズ", "渋谷スクランブル交差点",
  // Yokohama / Kanagawa
  "横浜中華街", "三溪園", "鎌倉大仏",
  // Onsen towns
  "草津温泉", "箱根温泉", "有馬温泉", "別府温泉", "由布院温泉",
  "黒川温泉", "下呂温泉", "城崎温泉", "登別温泉", "野沢温泉",
  "銀山温泉", "蔵王温泉", "湯布院", "道後温泉",
  "鬼怒川温泉", "伊香保温泉", "湯村温泉", "十和田湖",
  // Castles
  "姫路城", "松本城", "犬山城", "彦根城", "丸亀城",
  "丸岡城", "松江城", "宇和島城", "高知城", "備中松山城",
  "松山城", "弘前城", "二条城",
  // Natural / scenic
  "上高地", "黒部峡谷", "立山黒部アルペンルート", "白川郷",
  "五箇山", "尾瀬", "屋久島", "白神山地", "知床",
  "富士山", "阿蘇山", "桜島", "霧島山", "大雪山",
  "箱根", "日光東照宮", "中禅寺湖", "華厳の滝",
  "天橋立", "宮島", "松島", "蔵王", "山寺",
  "袋田の滝", "那智の滝", "白糸の滝",
  // Aquariums / zoos
  "旭山動物園", "上野動物園", "天王寺動物園", "東山動植物園",
  "沖縄美ら海水族館", "海遊館", "鳥羽水族館", "新江ノ島水族館",
  "葛西臨海水族園", "アクアパーク品川", "サンシャイン水族館",
  // Bikan / preservation districts
  "倉敷美観地区", "白川郷合掌造り集落", "美山かやぶきの里",
  "妻籠宿", "馬籠宿", "中山道", "宿場町",
  // Traditional towns
  "ひがし茶屋街", "金沢城", "兼六園", "ひがし山温泉",
  "近江八幡", "今井町", "萩",
  // Heritage / pilgrimage
  "高野山", "比叡山", "出羽三山", "熊野古道",
  "石見銀山", "原爆ドーム", "首里城",
  // Cultural / modern
  "国立西洋美術館", "国立科学博物館", "森美術館", "東京国立博物館",
  "京都国立博物館", "奈良国立博物館", "大原美術館", "ベネッセハウス",
  "豊島美術館", "地中美術館", "金沢21世紀美術館",
  // Anime / pop culture canon
  "飛騨古川", "鷲宮神社", "大洗磯前神社", "三鷹の森ジブリ美術館",
  // Sub-tropical / Okinawa
  "首里城公園", "斎場御嶽", "古宇利大橋", "万座毛", "波照間島",
  "石垣島", "西表島", "宮古島", "竹富島",
  // Hokkaido
  "函館山", "五稜郭", "小樽運河", "藻岩山", "大通公園",
  "知床五湖", "摩周湖", "屈斜路湖", "阿寒湖",
  // Beach / seaside
  "江の島", "稲村ヶ崎", "鳥取砂丘",
];

interface LandmarkRecord {
  name_query: string;
  match_qid: string | null;
  match_method: "ja_search" | "en_search" | "manual" | "unresolved";
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  description_en: string | null;
  description_ja: string | null;
  coordinates: { lat: number; lng: number } | null;
  types: string[];
  country_qid: string | null;
  admin_qid: string | null;
  enwiki_title: string | null;
  jawiki_title: string | null;
  wikidata_url: string | null;
  /** All candidates considered; the chosen one is `match_qid`. Keeps the
   *  audit trail in case a downstream injector needs to re-evaluate. */
  candidates: { qid: string; label: string; description?: string }[];
}

function nameSlug(name: string): string {
  return Buffer.from(name).toString("base64").replace(/[/+=]/g, "_");
}

async function wbSearch(query: string, language: "ja" | "en"): Promise<{ qid: string; label: string; description?: string }[]> {
  const params = new URLSearchParams({
    action: "wbsearchentities",
    search: query,
    language,
    type: "item",
    limit: "5",
    format: "json",
  });
  const url = `${API_BASE}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = (await r.json()) as { search?: { id: string; label: string; description?: string }[] };
  return (json.search ?? []).map((s) => ({ qid: s.id, label: s.label, description: s.description }));
}

type WdClaim = { mainsnak?: { datavalue?: { value?: unknown } } };

function snakValueId(claim: WdClaim | undefined): string | null {
  const v = claim?.mainsnak?.datavalue?.value as { id?: string } | undefined;
  return v?.id ?? null;
}

function snakValueCoord(claim: WdClaim | undefined): { lat: number; lng: number } | null {
  const v = claim?.mainsnak?.datavalue?.value as
    | { latitude?: number; longitude?: number }
    | undefined;
  if (!v || typeof v.latitude !== "number" || typeof v.longitude !== "number") return null;
  return { lat: v.latitude, lng: v.longitude };
}

interface WdEntity {
  labels?: Record<string, { value: string }>;
  descriptions?: Record<string, { value: string }>;
  claims?: Record<string, WdClaim[]>;
  sitelinks?: Record<string, { title: string }>;
}

async function wbGetEntities(qids: string[]): Promise<Record<string, WdEntity>> {
  if (qids.length === 0) return {};
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qids.join("|"),
    props: "labels|descriptions|claims|sitelinks",
    sitefilter: "enwiki|jawiki",
    languages: "en|ja|zh|ko",
    format: "json",
  });
  const url = `${API_BASE}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = (await r.json()) as { entities?: Record<string, WdEntity> };
  return json.entities ?? {};
}

function isInJapan(coord: { lat: number; lng: number } | null): boolean {
  if (!coord) return false;
  return (
    coord.lat >= JP_BBOX.latMin && coord.lat <= JP_BBOX.latMax &&
    coord.lng >= JP_BBOX.lngMin && coord.lng <= JP_BBOX.lngMax
  );
}

async function resolveName(name: string): Promise<LandmarkRecord> {
  let candidates: { qid: string; label: string; description?: string }[] = [];
  let method: LandmarkRecord["match_method"] = "ja_search";
  try {
    candidates = await wbSearch(name, "ja");
  } catch (e) {
    candidates = [];
  }
  if (candidates.length === 0) {
    method = "en_search";
    try {
      candidates = await wbSearch(name, "en");
    } catch (e) {
      candidates = [];
    }
  }
  await new Promise((r) => setTimeout(r, DELAY_MS));

  if (candidates.length === 0) {
    return {
      name_query: name,
      match_qid: null,
      match_method: "unresolved",
      name_ja: null,
      name_en: null,
      name_zh: null,
      name_ko: null,
      description_en: null,
      description_ja: null,
      coordinates: null,
      types: [],
      country_qid: null,
      admin_qid: null,
      enwiki_title: null,
      jawiki_title: null,
      wikidata_url: null,
      candidates: [],
    };
  }

  const entities = await wbGetEntities(candidates.map((c) => c.qid));
  await new Promise((r) => setTimeout(r, DELAY_MS));

  // Pick the first candidate that resolves to a Japan-located entity.
  for (const cand of candidates) {
    const ent = entities[cand.qid];
    if (!ent) continue;
    const country = snakValueId((ent.claims?.P17 ?? [])[0]);
    if (country !== "Q17") continue;
    const coord = snakValueCoord((ent.claims?.P625 ?? [])[0]);
    if (!isInJapan(coord)) continue;
    const types: string[] = [];
    for (const c of ent.claims?.P31 ?? []) {
      const t = snakValueId(c);
      if (t) types.push(t);
    }
    const adminQid = snakValueId((ent.claims?.P131 ?? [])[0]);
    return {
      name_query: name,
      match_qid: cand.qid,
      match_method: method,
      name_ja: ent.labels?.ja?.value ?? null,
      name_en: ent.labels?.en?.value ?? null,
      name_zh: ent.labels?.zh?.value ?? ent.labels?.["zh-hans"]?.value ?? null,
      name_ko: ent.labels?.ko?.value ?? null,
      description_en: ent.descriptions?.en?.value ?? null,
      description_ja: ent.descriptions?.ja?.value ?? null,
      coordinates: coord,
      types,
      country_qid: country,
      admin_qid: adminQid,
      enwiki_title: ent.sitelinks?.enwiki?.title ?? null,
      jawiki_title: ent.sitelinks?.jawiki?.title ?? null,
      wikidata_url: `https://www.wikidata.org/wiki/${cand.qid}`,
      candidates: candidates.map((c) => ({ qid: c.qid, label: c.label, description: c.description })),
    };
  }

  // No candidate passed the Japan-bbox + P17=Q17 filter. Record top
  // candidate's metadata for manual triage but mark as unresolved.
  const top = candidates[0];
  const ent = entities[top.qid];
  const coord = ent ? snakValueCoord((ent.claims?.P625 ?? [])[0]) : null;
  return {
    name_query: name,
    match_qid: null,
    match_method: "unresolved",
    name_ja: ent?.labels?.ja?.value ?? null,
    name_en: ent?.labels?.en?.value ?? null,
    name_zh: ent?.labels?.zh?.value ?? null,
    name_ko: ent?.labels?.ko?.value ?? null,
    description_en: ent?.descriptions?.en?.value ?? null,
    description_ja: ent?.descriptions?.ja?.value ?? null,
    coordinates: coord,
    types: [],
    country_qid: snakValueId((ent?.claims?.P17 ?? [])[0]),
    admin_qid: null,
    enwiki_title: ent?.sitelinks?.enwiki?.title ?? null,
    jawiki_title: ent?.sitelinks?.jawiki?.title ?? null,
    wikidata_url: top ? `https://www.wikidata.org/wiki/${top.qid}` : null,
    candidates: candidates.map((c) => ({ qid: c.qid, label: c.label, description: c.description })),
  };
}

async function readNamesList(): Promise<string[]> {
  const path = process.env.LANDMARK_NAMES;
  if (!path) return DEFAULT_NAMES;
  const raw = await readFile(resolve(REPO_ROOT, path), "utf-8");
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("#"));
}

async function main(): Promise<void> {
  await mkdir(PARTIAL_DIR, { recursive: true });
  const names = Array.from(new Set(await readNamesList()));
  console.log(`landmark name resolver: ${names.length} names → ${API_BASE}`);
  const all: LandmarkRecord[] = [];
  let resolved = 0;
  let unresolved = 0;
  for (let i = 0; i < names.length; i += 1) {
    const name = names[i];
    const slug = nameSlug(name);
    const partialPath = `${PARTIAL_DIR}/${slug}.json`;
    if (RESUME && existsSync(partialPath)) {
      const raw = await readFile(partialPath, "utf-8");
      const rec = JSON.parse(raw) as LandmarkRecord;
      all.push(rec);
      if (rec.match_qid) resolved += 1; else unresolved += 1;
      continue;
    }
    let rec: LandmarkRecord;
    try {
      rec = await resolveName(name);
    } catch (e) {
      console.error(`  ${name}: error ${(e as Error).message}`);
      rec = {
        name_query: name,
        match_qid: null,
        match_method: "unresolved",
        name_ja: null,
        name_en: null,
        name_zh: null,
        name_ko: null,
        description_en: null,
        description_ja: null,
        coordinates: null,
        types: [],
        country_qid: null,
        admin_qid: null,
        enwiki_title: null,
        jawiki_title: null,
        wikidata_url: null,
        candidates: [],
      };
    }
    await writeFile(partialPath, JSON.stringify(rec, null, 2));
    all.push(rec);
    if (rec.match_qid) {
      resolved += 1;
      console.log(`  [${i + 1}/${names.length}] ${name} → ${rec.match_qid} (${rec.name_en ?? rec.name_ja})`);
    } else {
      unresolved += 1;
      console.log(`  [${i + 1}/${names.length}] ${name} → UNRESOLVED`);
    }
  }

  // Re-merge from partial dir for crash safety.
  const partial = await readdir(PARTIAL_DIR);
  const merged: LandmarkRecord[] = [];
  const seen = new Set<string>();
  for (const f of partial) {
    if (!f.endsWith(".json")) continue;
    const raw = await readFile(`${PARTIAL_DIR}/${f}`, "utf-8");
    const rec = JSON.parse(raw) as LandmarkRecord;
    if (seen.has(rec.name_query)) continue;
    seen.add(rec.name_query);
    merged.push(rec);
  }
  await writeFile(FINAL_FILE, JSON.stringify({
    source: "wbsearchentities + wbgetentities",
    fetched_at: new Date().toISOString(),
    total: merged.length,
    resolved: merged.filter((r) => r.match_qid).length,
    unresolved: merged.filter((r) => !r.match_qid).length,
    records: merged,
  }, null, 2));
  console.log(`\nfinal: ${merged.length} (${resolved} resolved, ${unresolved} unresolved) → ${FINAL_FILE}`);
}

main().catch((e) => {
  console.error("fatal:", e);
  process.exit(1);
});
