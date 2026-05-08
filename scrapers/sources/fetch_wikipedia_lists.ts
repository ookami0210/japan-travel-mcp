/**
 * Fetch Wikipedia LIST-article members (e.g. 日本の花火大会一覧) via the
 * action=parse API. Complementary to fetch_wikipedia_categories.ts:
 * categories index by topic, list articles enumerate canonical entries.
 *
 * Why: Wikipedia category 日本の花火大会 returned only 4 entries, but the
 * list article 日本の花火大会一覧 has 250+ canonical fireworks events.
 *
 * Output: appends to data/r3/wikipedia_lists.json (separate from categories
 * to keep provenance distinct).
 *
 * Per project data principle: Wikipedia CC BY-SA, QID linkage automatic.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/r3/wikipedia_lists.json");
const CACHE_DIR = resolve(REPO_ROOT, "data/_state/wikipedia_lists_cache");

const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const API_BASE = "https://ja.wikipedia.org/w/api.php";

const LIST_ARTICLES: { title: string; kind_tag: string; filter?: RegExp }[] = [
  { title: "日本の花火大会一覧", kind_tag: "hanabi" },
  { title: "日本三大祭", kind_tag: "matsuri_top" },
  { title: "日本三大火祭り", kind_tag: "fire_festival" },
  { title: "日本三大盆踊り", kind_tag: "bon_odori" },
  { title: "日本三名瀑", kind_tag: "famous_waterfall" },
  { title: "日本三景", kind_tag: "nihon_sankei" },
  { title: "日本三名園", kind_tag: "nihon_sanmeien" },
  { title: "日本三大温泉", kind_tag: "nihon_sandai_onsen" },
  { title: "日本三古湯", kind_tag: "nihon_sanko_yu" },
  { title: "日本三名城", kind_tag: "nihon_sanmeijo" },
  { title: "日本100名城", kind_tag: "nihon_100_meijo" },
  { title: "続日本100名城", kind_tag: "zoku_nihon_100_meijo" },
  { title: "日本さくら名所100選", kind_tag: "sakura_meisho_100" },
  { title: "日本の道100選", kind_tag: "michi_100" },
  { title: "新日本三大夜景", kind_tag: "yakei_top3" },
  { title: "日本三大夜景", kind_tag: "yakei_top3" },
  { title: "美しい日本の歩きたくなるみち500選", kind_tag: "walking_road_500" },
  { title: "日本の渚百選", kind_tag: "nagisa_100" },
  { title: "日本の棚田百選", kind_tag: "tanada_100" },
  { title: "重要文化的景観", kind_tag: "important_cultural_landscape" },
  { title: "重要伝統的建造物群保存地区", kind_tag: "preservation_district" },
  { title: "日本秘湯を守る会", kind_tag: "hito_yu_member" },
  { title: "観光圏整備法", kind_tag: "tourism_zone" },
  { title: "森林浴の森100選", kind_tag: "forest_bathing_100" },
  { title: "日本の音風景100選", kind_tag: "soundscape_100" },
  { title: "日本100名橋", kind_tag: "nihon_100_meihashi" },
  { title: "新日本旅行地100選", kind_tag: "shin_ryoko_100" },
  // 2026-05-08 additions: pilgrimage routes + nature 100s + extra
  // canonical lists missing from the original LIST_ARTICLES set.
  { title: "西国三十三所", kind_tag: "saigoku_33" },
  { title: "坂東三十三観音", kind_tag: "bando_33" },
  { title: "名水百選", kind_tag: "meisui_100" },
  { title: "平成の名水百選", kind_tag: "heisei_meisui_100" },
  { title: "日本の白砂青松100選", kind_tag: "hakusha_seishou_100" },
  { title: "日本の歴史公園100選", kind_tag: "rekishi_park_100" },
  { title: "日本の地質百選", kind_tag: "chishitsu_100" },
  { title: "日本三大花火大会", kind_tag: "hanabi_top3" },
  { title: "日本五大桜", kind_tag: "sakura_top5" },
  { title: "新日本観光地100選", kind_tag: "shin_kanko_100" },
  { title: "新・日本街路樹100景", kind_tag: "gairoju_100" },
  // 2026-05-08 second wave: pilgrimage / kiln / mountain / station 100s
  { title: "西国薬師四十九霊場", kind_tag: "saigoku_yakushi_49" },
  { title: "関東三十六不動尊霊場", kind_tag: "kanto_fudo_36" },
  { title: "中国三十三観音霊場", kind_tag: "chugoku_kannon_33" },
  { title: "六古窯", kind_tag: "rokkoyo" },
  { title: "日本三百名山", kind_tag: "nihon_300_meizan" },
  { title: "日本二百名山", kind_tag: "nihon_200_meizan" },
  { title: "新日本百名山", kind_tag: "shin_nihon_100_meizan" },
  { title: "東北の駅百選", kind_tag: "tohoku_eki_100" },
  { title: "関東の駅百選", kind_tag: "kanto_eki_100" },
  { title: "近畿の駅百選", kind_tag: "kinki_eki_100" },
  { title: "中部の駅百選", kind_tag: "chubu_eki_100" },
];

async function getCached(url: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const cachePath = resolve(CACHE_DIR, hash + ".json");
  if (existsSync(cachePath)) return await readFile(cachePath, "utf8");
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
      await new Promise((s) => setTimeout(s, 200));
      return text;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
    }
  }
}

interface ParseLink {
  ns: number;
  exists?: string;
  "*": string;
}

async function pageLinks(title: string): Promise<string[]> {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    format: "json",
    prop: "links",
  });
  const url = `${API_BASE}?${params.toString()}`;
  const text = await getCached(url);
  const json = JSON.parse(text) as { parse?: { links?: ParseLink[] } };
  const links = json.parse?.links ?? [];
  // Only article-namespace (ns=0), existing pages
  return links.filter((l) => l.ns === 0).map((l) => l["*"]);
}

interface PageData {
  pageid: number;
  title: string;
  qid: string | null;
  lat: number | null;
  lng: number | null;
  extract: string | null;
}

async function pageInfoBatch(titles: string[]): Promise<PageData[]> {
  const out: PageData[] = [];
  for (let i = 0; i < titles.length; i += 50) {
    const batch = titles.slice(i, i + 50);
    const params = new URLSearchParams({
      action: "query",
      prop: "pageprops|coordinates|extracts",
      ppprop: "wikibase_item",
      titles: batch.join("|"),
      coprop: "type|name|country|region|globe",
      explaintext: "1",
      exintro: "1",
      exsentences: "2",
      format: "json",
      formatversion: "2",
    });
    const url = `${API_BASE}?${params.toString()}`;
    const text = await getCached(url);
    const json = JSON.parse(text) as { query?: { pages?: { pageid: number; title: string; pageprops?: { wikibase_item?: string }; coordinates?: { lat: number; lon: number }[]; extract?: string }[] } };
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
  const byList: Record<string, PageData[]> = {};
  let total = 0;
  for (const list of LIST_ARTICLES) {
    process.stderr.write(`fetching ${list.title}\n`);
    let titles: string[];
    try {
      titles = await pageLinks(list.title);
    } catch (e) {
      process.stderr.write(`  failed to load: ${(e as Error).message}\n`);
      continue;
    }
    if (list.filter) {
      titles = titles.filter((t) => list.filter!.test(t));
    }
    process.stderr.write(`  ${titles.length} titles; fetching pages...\n`);
    let pages: PageData[];
    try {
      pages = await pageInfoBatch(titles);
    } catch (e) {
      process.stderr.write(`  page info failed: ${(e as Error).message}\n`);
      continue;
    }
    const withQid = pages.filter((p) => p.qid);
    byList[list.title] = withQid;
    total += withQid.length;
    process.stderr.write(`  ${withQid.length} pages with QID linked.\n`);
  }
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        source: "wikipedia_lists",
        authority: "Wikipedia (Japanese)",
        fetched_at: fetchedAt,
        total,
        lists: LIST_ARTICLES,
        by_list: byList,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(
    `Wrote ${total} pages across ${Object.keys(byList).length} lists to ${OUT_FILE}\n`,
  );
}

await main();
