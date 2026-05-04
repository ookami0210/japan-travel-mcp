/**
 * Fetch Japanese Wikipedia category members for travel-related concepts.
 *
 * Source: ja.wikipedia.org REST API
 *   GET /api/rest_v1/page/summary/<title>      → page summary + lat/lng
 *   GET /w/api.php?action=query&list=categorymembers&...
 *
 * Why: iter60 v4-data L3-01/L3-02 (花火), L3-03 (雪まつり), L3-09 (桜),
 * L3-22 (横丁), L3-25 (鶴・出水) couldn't surface canonical entities
 * because Wikidata heritage_designations don't tag these. Wikipedia
 * categories are a public, official-ish ontology that links each
 * category member to its Wikidata QID via wikibase_item.
 *
 * Output: data/r3/wikipedia_categories.json
 *   {
 *     fetched_at, count, by_category: {
 *       <category_title>: [
 *         { qid, title, prefecture, kind_tag, lat, lng, summary, source_url }
 *       ]
 *     }
 *   }
 *
 * Per project data principle: Wikipedia is CC BY-SA + content references
 * official sources. The QID linkage means we can join back to our
 * Wikidata corpus and add the kind_tag enrichment (花火大会/雪祭り/etc.)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/r3/wikipedia_categories.json");
const CACHE_DIR = resolve(REPO_ROOT, "data/_state/wikipedia_categories_cache");

const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const API_BASE = "https://ja.wikipedia.org/w/api.php";

// Travel-relevant Wikipedia categories. Pairs each category with the
// `kind_tag` we want to assign. The kind_tag is later used by the
// runtime to enrich Wikidata kinds[] for these QIDs (so e.g. 隅田川花火
// 大会 surfaces as kinds=["hanabi"] in search_area).
const CATEGORIES: { title: string; kind_tag: string }[] = [
  // Iter63: replaced 0-result categories with productive alternatives.
  { title: "Category:日本の花火大会", kind_tag: "hanabi" },
  { title: "Category:日本の祭り", kind_tag: "matsuri" },
  { title: "Category:都道府県別の祭り", kind_tag: "matsuri" },
  { title: "Category:日本の桜", kind_tag: "sakura_meisho" },
  { title: "Category:桜の名所", kind_tag: "sakura_meisho" },
  { title: "Category:日本の紅葉", kind_tag: "kouyou_meisho" },
  { title: "Category:道の駅", kind_tag: "michi_no_eki" },
  { title: "Category:日本のスキー場", kind_tag: "ski_resort" },
  { title: "Category:都道府県別のスキー場", kind_tag: "ski_resort" },
  { title: "Category:日本の温泉地", kind_tag: "onsen_resort" },
  { title: "Category:温泉郷", kind_tag: "onsen_resort" },
  { title: "Category:日本の天文台", kind_tag: "observatory" },
  { title: "Category:商店街", kind_tag: "shotengai" },
  { title: "Category:城下町", kind_tag: "jokamachi" },
  { title: "Category:宿場町", kind_tag: "shukuba" },
  { title: "Category:旧街道", kind_tag: "kaido" },
  { title: "Category:日本の灯台", kind_tag: "lighthouse" },
  { title: "Category:日本の博物館", kind_tag: "museum_jp" },
  { title: "Category:日本の動物園", kind_tag: "zoo" },
  { title: "Category:日本の水族館", kind_tag: "aquarium" },
  { title: "Category:擬洋風建築", kind_tag: "giyofu" },
  { title: "Category:日本の棚田", kind_tag: "tanada" },
  { title: "Category:日本の砂丘", kind_tag: "sand_dune" },
  { title: "Category:重要伝統的建造物群保存地区", kind_tag: "preservation_district" },
  { title: "Category:鉱山", kind_tag: "mining_heritage" },
  { title: "Category:鉱山跡", kind_tag: "mining_heritage" },
  { title: "Category:日本の鉄道路線", kind_tag: "railway_line" },
  { title: "Category:第三セクター鉄道", kind_tag: "local_railway" },
  { title: "Category:日本の山", kind_tag: "mountain" },
  { title: "Category:日本の湖", kind_tag: "lake" },
  { title: "Category:日本の滝", kind_tag: "waterfall" },
  { title: "Category:日本の海岸", kind_tag: "beach" },
  { title: "Category:日本の島", kind_tag: "island" },
  { title: "Category:日本の道路橋", kind_tag: "bridge" },
  { title: "Category:日本のダム", kind_tag: "dam" },
  { title: "Category:日本の城", kind_tag: "castle" },
  { title: "Category:日本の城跡", kind_tag: "castle" },
  { title: "Category:日本の庭園", kind_tag: "garden" },
  { title: "Category:日本国指定名勝", kind_tag: "scenic_beauty" },
  { title: "Category:日本国指定天然記念物", kind_tag: "natural_monument" },
];

interface CmMember {
  pageid: number;
  ns: number;
  title: string;
}

interface CmResp {
  query?: {
    categorymembers?: CmMember[];
  };
  continue?: { cmcontinue?: string };
}

interface PageProps {
  pageprops?: { wikibase_item?: string };
  coordinates?: { lat: number; lon: number }[];
  extract?: string;
}

interface QueryPagesResp {
  query?: {
    pages?: Record<string, PageProps & { pageid: number; title: string }>;
  };
}

async function getCached(url: string): Promise<string> {
  // Iter62: hash URL to avoid ENAMETOOLONG on long page-ids batches.
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const cacheKey = hash + ".json";
  const cachePath = resolve(CACHE_DIR, cacheKey);
  if (existsSync(cachePath)) {
    return await readFile(cachePath, "utf8");
  }
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        if (attempt < 4 && (r.status === 429 || r.status === 503)) {
          await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
          continue;
        }
        throw new Error(`${url}: ${r.status}`);
      }
      const text = await r.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath, text, "utf8");
      await new Promise((s) => setTimeout(s, 200)); // polite
      return text;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
    }
  }
}

async function categoryMembers(title: string): Promise<CmMember[]> {
  const out: CmMember[] = [];
  let cmcontinue: string | undefined;
  while (true) {
    const params = new URLSearchParams({
      action: "query",
      list: "categorymembers",
      cmtitle: title,
      cmlimit: "500",
      cmtype: "page",
      format: "json",
      formatversion: "2",
    });
    if (cmcontinue) params.set("cmcontinue", cmcontinue);
    const url = `${API_BASE}?${params.toString()}`;
    const text = await getCached(url);
    const json = JSON.parse(text) as CmResp;
    if (json.query?.categorymembers) {
      out.push(...json.query.categorymembers);
    }
    if (!json.continue?.cmcontinue) break;
    cmcontinue = json.continue.cmcontinue;
  }
  return out;
}

interface PageData {
  pageid: number;
  title: string;
  qid: string | null;
  lat: number | null;
  lng: number | null;
  extract: string | null;
}

async function pageInfoBatch(pageids: number[]): Promise<PageData[]> {
  // up to 50 ids per query
  const out: PageData[] = [];
  for (let i = 0; i < pageids.length; i += 50) {
    const batch = pageids.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      prop: "pageprops|coordinates|extracts",
      ppprop: "wikibase_item",
      pageids: batch.join("|"),
      coprop: "type|name|country|region|globe",
      explaintext: "1",
      exintro: "1",
      exsentences: "2",
      format: "json",
      formatversion: "2",
    });
    const url = `${API_BASE}?${params.toString()}`;
    const text = await getCached(url);
    const json = JSON.parse(text) as { query?: { pages?: (PageProps & { pageid: number; title: string })[] } };
    const pages = json.query?.pages ?? [];
    for (const p of pages) {
      out.push({
        pageid: p.pageid,
        title: p.title,
        qid: p.pageprops?.wikibase_item ?? null,
        lat: p.coordinates?.[0]?.lat ?? null,
        lng: p.coordinates?.[0]?.lon ?? null,
        extract: p.extract ?? null,
      });
    }
  }
  return out;
}

async function main(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  const byCategory: Record<string, PageData[]> = {};
  let total = 0;
  for (const cat of CATEGORIES) {
    process.stderr.write(`fetching ${cat.title}\n`);
    let members: CmMember[];
    try {
      members = await categoryMembers(cat.title);
    } catch (e) {
      process.stderr.write(`  failed: ${(e as Error).message}\n`);
      continue;
    }
    process.stderr.write(`  ${members.length} members; fetching page info...\n`);
    let pages: PageData[];
    try {
      pages = await pageInfoBatch(members.map((m) => m.pageid));
    } catch (e) {
      process.stderr.write(`  page info failed: ${(e as Error).message}\n`);
      continue;
    }
    // Filter only those with QID
    const withQid = pages.filter((p) => p.qid);
    byCategory[cat.title] = withQid;
    total += withQid.length;
    process.stderr.write(`  ${withQid.length} pages with QID linked.\n`);
  }
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const out = {
    source: "wikipedia_categories",
    authority: "Wikipedia (Japanese)",
    fetched_at: fetchedAt,
    total,
    categories: CATEGORIES,
    by_category: byCategory,
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(`Wrote ${total} pages across ${Object.keys(byCategory).length} categories to ${OUT_FILE}\n`);
}

await main();
