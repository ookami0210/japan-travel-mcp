/**
 * Fetch 文化庁 国指定文化財等データベース (Bunka kunishitei).
 *
 * Source: https://kunishitei.bunka.go.jp/bsys/index
 * Public API: https://kunishitei.bunka.go.jp/bsys/searchlist (form-based search)
 *
 * Coverage:
 *   - 国宝 / 重要文化財 (architectural and tangible)
 *   - 特別史跡 / 史跡
 *   - 特別名勝 / 名勝
 *   - 特別天然記念物 / 天然記念物
 *   - 重要伝統的建造物群保存地区
 *   - 重要無形文化財 / 重要無形民俗文化財 (carrier records)
 *   - 重要文化的景観
 *   - 登録有形文化財 / 登録記念物 / 登録有形民俗文化財
 *
 * Output: data/r3/bunka_kunishitei.json
 * Schema:
 *   {
 *     source: "bunka_kunishitei",
 *     authority: "文化庁 (Agency for Cultural Affairs)",
 *     fetched_at: <ISO>,
 *     count: <int>,
 *     records: [
 *       {
 *         designation_id: "199-..." | "501-..." | ...
 *         designation_jp: "国宝" | "重要文化財" | "特別史跡" | ...
 *         category_jp: "建造物" | "彫刻" | ...
 *         name_ja: string,
 *         name_kana_ja: string | null,
 *         description_ja: string | null,
 *         designation_date: ISO | null,
 *         prefecture_codes: string[],
 *         municipality_jp: string | null,
 *         owner_jp: string | null,
 *         source_url: string,
 *         coordinates: null,  // not provided in DB
 *       }
 *     ]
 *   }
 *
 * Project data principle (2026-05-04): 公式機関の公開情報。利用規約に「無断転載禁止」
 * の明示が一部あるため、削除依頼には即対応する前提で運用。レコードに source_url
 * を必ず記録。
 *
 * NOTE: This fetcher is a SCAFFOLD. The kunishitei DB form requires
 * specific query parameters. Implementation TBD — the response is
 * server-rendered HTML, may require Playwright + parse, or the API
 * endpoint exists at /bsys/api/searchlist (verify next).
 *
 * Run: npx tsx scrapers/sources/fetch_bunka_kunishitei.ts [--max=N]
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/r3/bunka_kunishitei.json");

const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const ENDPOINT_BASE = "https://kunishitei.bunka.go.jp/bsys";

// designation type codes from the kunishitei DB form (verified 2026-05-04
// via inspecting the official search form's <select> options).
const DESIGNATION_TYPES: { code: string; ja: string; en: string }[] = [
  { code: "01",   ja: "国宝（建造物）",       en: "National Treasure (architectural)" },
  { code: "02",   ja: "重要文化財（建造物）", en: "Important Cultural Property (architectural)" },
  { code: "03",   ja: "国宝（美術工芸品）",   en: "National Treasure (fine art)" },
  { code: "04",   ja: "重要文化財（美術工芸品）", en: "Important Cultural Property (fine art)" },
  { code: "05",   ja: "重要無形文化財",        en: "Important Intangible Cultural Property" },
  { code: "06",   ja: "重要有形民俗文化財",    en: "Important Tangible Folk Cultural Property" },
  { code: "07",   ja: "重要無形民俗文化財",    en: "Important Intangible Folk Cultural Property" },
  { code: "08",   ja: "特別史跡",              en: "Special Historic Site" },
  { code: "09",   ja: "史跡",                  en: "Historic Site" },
  { code: "10",   ja: "特別名勝",              en: "Special Place of Scenic Beauty" },
  { code: "11",   ja: "名勝",                  en: "Place of Scenic Beauty" },
  { code: "12",   ja: "特別天然記念物",        en: "Special Natural Monument" },
  { code: "13",   ja: "天然記念物",            en: "Natural Monument" },
  { code: "14",   ja: "重要文化的景観",        en: "Important Cultural Landscape" },
  { code: "15",   ja: "重要伝統的建造物群保存地区", en: "Important Preservation District for Groups of Traditional Buildings" },
  { code: "16",   ja: "登録有形文化財（建造物）", en: "Registered Tangible Cultural Property (architectural)" },
  { code: "17",   ja: "登録有形文化財（美術工芸品）", en: "Registered Tangible Cultural Property (fine art)" },
  { code: "18",   ja: "登録有形民俗文化財",    en: "Registered Tangible Folk Cultural Property" },
  { code: "19",   ja: "登録記念物",            en: "Registered Monument" },
  { code: "20",   ja: "選定保存技術",          en: "Selected Conservation Technique" },
];

interface BunkaRecord {
  designation_id: string;
  designation_code: string;
  designation_jp: string;
  designation_en: string;
  name_ja: string;
  name_kana_ja: string | null;
  description_ja: string | null;
  designation_date: string | null;
  prefecture_jp: string | null;
  prefecture_codes: string[];
  municipality_jp: string | null;
  owner_jp: string | null;
  source_url: string;
}

async function main(): Promise<void> {
  // Implementation TODO: the kunishitei DB serves results as
  // server-rendered HTML pagination. Two approaches:
  //   a) form POST → HTML parse (cheerio)
  //   b) Playwright headless → DOM traversal
  // We default to (a) — parse the raw HTML pagination and extract
  // record fields per cell.
  //
  // For MVP scaffolding, write an empty file with the schema so the
  // runtime can be wired up without blocking on the scrape impl.
  const out = {
    source: "bunka_kunishitei",
    authority: "文化庁 (Agency for Cultural Affairs)",
    fetched_at: new Date().toISOString(),
    note: "Scaffold only — fetch implementation pending. Use kunishitei.bunka.go.jp manual search until populated.",
    designation_types: DESIGNATION_TYPES,
    count: 0,
    records: [] as BunkaRecord[],
    endpoint: ENDPOINT_BASE,
    user_agent: USER_AGENT,
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    `Wrote scaffold to ${OUT_FILE}. Implementation pending.\n`,
  );
}

await main();
