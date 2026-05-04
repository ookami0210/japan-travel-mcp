/**
 * Fetch the official METI traditional crafts (伝統的工芸品) list.
 *
 * Source: https://kougeihin.jp/  (operated by 一般財団法人 伝統的工芸品産業振興協会
 *         under METI's "伝統的工芸品" designation system)
 * Authority: Ministry of Economy, Trade and Industry (METI), Japan
 *
 * Strategy:
 *   1. List 15 industry-category landing pages (orimono, toujiki, shikki, …).
 *   2. Each landing page links to /craft/<id>/ detail pages with a 4-digit id
 *      where the first 2 digits encode the industry category. Total ~240.
 *   3. Each detail page exposes 名称 / 主要製造地域 / 指定年月日 / 特徴 (the
 *      official short description we translate).
 *
 * Output: data/r3/meti_densan.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_meti_densan.ts
 *   METI_LIMIT=10 npx tsx scrapers/sources/fetch_meti_densan.ts   (test mode)
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  extractPrefectureCodes,
  loadMunicipalityRows,
  loadPrefectureRows,
} from "../lib/prefecture_match.js";

const BASE = "https://kougeihin.jp";
const TOP_URL = `${BASE}/crafts/`;
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";
const RATE_LIMIT_MS = 1500;

// industry category slug → Japanese label (for output metadata)
const INDUSTRY_LABELS: Record<string, string> = {
  orimono: "織物",
  sensyoku: "染色品",
  senni: "その他繊維製品",
  toujiki: "陶磁器",
  shikki: "漆器",
  mokkoutake: "木工品・竹工品",
  kane: "金工品",
  butsudan: "仏壇・仏具",
  washi: "和紙",
  bungu: "文具",
  ishi: "石工品",
  kiseki: "貴石細工",
  ningyou: "人形・こけし",
  other: "その他の工芸品",
  tool: "工芸材料・工芸用具",
};

export interface MetiDensanRecord {
  source: "meti_densan";
  authority: "経済産業省 (METI) — 伝統的工芸品指定制度";
  craft_id: string; // e.g. "0101"
  industry_category: string; // ja label
  industry_slug: string; // category slug
  name_ja: string;
  designation_date: string | null;
  production_area_text: string | null;
  prefecture_codes: string[];
  features_ja: string | null;
  detail_url: string;
  fetched_at: string;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function fetchCategoryCraftIds(slug: string): Promise<string[]> {
  const url = `${BASE}/craft_industry/${slug}/`;
  const html = await fetchHtml(url);
  const ids = new Set<string>();
  const re = /\/craft\/(\d{4})\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids].sort();
}

function pickValueForLabelTh(
  $: cheerio.CheerioAPI,
  label: string,
): string | null {
  let value: string | null = null;
  $("th").each((_, el) => {
    if ($(el).text().trim() === label) {
      const td = $(el).next("td");
      if (td.length > 0) {
        value = td.text().replace(/\s+/g, " ").trim();
        return false; // break
      }
    }
  });
  return value;
}

function pickFeature($: cheerio.CheerioAPI): string | null {
  // <div class="box_type1 feature"><p class="ja_view">...</p>
  const p = $("div.feature p.ja_view").first();
  if (p.length === 0) return null;
  const html = p.html() ?? "";
  // <br> → newline so callers can compress; strip notes after horizontal rule
  return html
    .replace(/<br\s*\/?>(\s*)/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

async function parseDetailPage(
  craftId: string,
  industrySlug: string,
  prefRows: Awaited<ReturnType<typeof loadPrefectureRows>>,
  muniRows: Awaited<ReturnType<typeof loadMunicipalityRows>>,
): Promise<MetiDensanRecord> {
  const url = `${BASE}/craft/${craftId}/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const name = ($("h1.detail_title").first().text() || "").trim();
  const productionArea = pickValueForLabelTh($, "主要製造地域");
  const designationDate = pickValueForLabelTh($, "指定年月日");
  const features = pickFeature($);
  const prefCodes = productionArea
    ? extractPrefectureCodes(productionArea, prefRows, muniRows)
    : [];
  return {
    source: "meti_densan",
    authority: "経済産業省 (METI) — 伝統的工芸品指定制度",
    craft_id: craftId,
    industry_category: INDUSTRY_LABELS[industrySlug] ?? industrySlug,
    industry_slug: industrySlug,
    name_ja: name,
    designation_date: designationDate,
    production_area_text: productionArea,
    prefecture_codes: prefCodes,
    features_ja: features,
    detail_url: url,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchMetiDensan(): Promise<MetiDensanRecord[]> {
  const limit = parseInt(process.env.METI_LIMIT ?? "0", 10);
  const allEntries: { craftId: string; industrySlug: string }[] = [];
  for (const slug of Object.keys(INDUSTRY_LABELS)) {
    try {
      const ids = await fetchCategoryCraftIds(slug);
      for (const id of ids) {
        if (!allEntries.find((e) => e.craftId === id)) {
          allEntries.push({ craftId: id, industrySlug: slug });
        }
      }
      console.error(`[meti_densan] category ${slug}: ${ids.length} crafts`);
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    } catch (err) {
      console.error(
        `[meti_densan] FAILED category ${slug}: ${(err as Error).message}`,
      );
    }
  }
  console.error(`[meti_densan] total unique crafts: ${allEntries.length}`);

  const target = limit > 0 ? allEntries.slice(0, limit) : allEntries;
  const prefRows = await loadPrefectureRows();
  const muniRows = await loadMunicipalityRows();
  const out: MetiDensanRecord[] = [];
  for (const e of target) {
    try {
      const rec = await parseDetailPage(e.craftId, e.industrySlug, prefRows, muniRows);
      out.push(rec);
      if (out.length % 25 === 0) {
        console.error(`[meti_densan] processed ${out.length}/${target.length}`);
      }
    } catch (err) {
      console.error(
        `[meti_densan] FAILED craft ${e.craftId}: ${(err as Error).message}`,
      );
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return out;
}

async function main(): Promise<void> {
  const records = await fetchMetiDensan();
  const out = {
    source: {
      name: "METI Traditional Crafts (伝統的工芸品)",
      authority: "経済産業省",
      url: TOP_URL,
      operator: "一般財団法人 伝統的工芸品産業振興協会",
      license:
        "公式制度の登録名・指定情報。出典明記による教育・観光案内目的の引用",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/meti_densan.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[meti_densan] wrote ${records.length} records to ${outPath}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[meti_densan] FAILED:", err);
    process.exit(1);
  });
}
