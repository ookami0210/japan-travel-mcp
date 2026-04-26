/**
 * Fetch the official MAFF Geographical Indication (GI) registered products list.
 *
 * Source: https://www.maff.go.jp/j/shokusan/gi_act/register/
 * Authority: Ministry of Agriculture, Forestry and Fisheries (MAFF), Japan
 *
 * Each registered product page (e.g. ./0001/index.html) contains:
 *   - 登録年月日 (registration date, Japanese era)
 *   - 生産地    (production area, free text — usually contains prefecture names)
 *   - 登録生産者団体 (registered producer group)
 *   - 特性      (characteristics — the official short description we translate)
 *
 * Output: data/r3/maff_gi.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_maff_gi.ts
 *   MAFF_LIMIT=5 npx tsx scrapers/sources/fetch_maff_gi.ts   (test mode)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import {
  extractPrefectureCodes,
  loadMunicipalityRows,
  loadPrefectureRows,
} from "../lib/prefecture_match.js";

const LIST_URL = "https://www.maff.go.jp/j/shokusan/gi_act/register/";
const DETAIL_URL = (n: string) =>
  `https://www.maff.go.jp/j/shokusan/gi_act/register/${n}/index.html`;
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";
const RATE_LIMIT_MS = 1500;

export interface MaffGiRecord {
  source: "maff_gi";
  authority: "農林水産省 (MAFF)";
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

interface ListEntry {
  number: number;
  name: string;
  detail_path: string;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.text();
}

function parseListPage(html: string): ListEntry[] {
  const $ = cheerio.load(html);
  const entries: ListEntry[] = [];
  const seen = new Set<number>();
  $("a.click_button").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    // Detail anchors look like ./0001/index.html, ./0176/index.html
    const m = href.match(/\.\/(\d{4})\/index\.html/);
    if (!m) return;
    const num = parseInt(m[1], 10);
    if (seen.has(num)) return;
    seen.add(num);

    // Name is in a sibling <div> within the same row. The table rows on this
    // site are flattened divs in document order: button, 登録番号, 名称, 登録年月日.
    // Walk up to the row container then take the third child div.
    let name = "";
    const row = $(el).closest("div").parent();
    const cells = row.children("div");
    if (cells.length >= 3) {
      name = cells.eq(2).text().trim();
    }
    entries.push({
      number: num,
      name,
      detail_path: m[1],
    });
  });
  entries.sort((a, b) => a.number - b.number);
  return entries;
}

function pickValueForLabel(
  $: cheerio.CheerioAPI,
  label: string,
): string | null {
  let value: string | null = null;
  $("div.column_left").each((_, el) => {
    const txt = $(el).text().trim();
    if (txt === label) {
      const sib = $(el).next("div.column_right");
      if (sib.length > 0) {
        value = sib.text().replace(/\s+/g, " ").trim();
        return false; // break
      }
    }
  });
  return value;
}

async function parseDetailPage(
  num: number,
  fallbackName: string,
  prefRows: Awaited<ReturnType<typeof loadPrefectureRows>>,
  muniRows: Awaited<ReturnType<typeof loadMunicipalityRows>>,
): Promise<MaffGiRecord> {
  const path = String(num).padStart(4, "0");
  const url = DETAIL_URL(path);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  // Title is "第N号：<name>：農林水産省"
  let name = fallbackName;
  const titleMatch = ($("title").text() || "").match(/第\d+号：(.+?)：/);
  if (titleMatch) name = titleMatch[1].trim();

  const productionArea = pickValueForLabel($, "生産地");
  const prefCodes = productionArea
    ? extractPrefectureCodes(productionArea, prefRows, muniRows)
    : [];

  return {
    source: "maff_gi",
    authority: "農林水産省 (MAFF)",
    registration_number: num,
    name_ja: name,
    registration_date: pickValueForLabel($, "登録年月日"),
    production_area_text: productionArea,
    prefecture_codes: prefCodes,
    producer_group: pickValueForLabel($, "登録生産者団体"),
    characteristics_ja: pickValueForLabel($, "特性"),
    detail_url: url,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchMaffGi(): Promise<MaffGiRecord[]> {
  const limit = parseInt(process.env.MAFF_LIMIT ?? "0", 10);
  const listHtml = await fetchHtml(LIST_URL);
  let entries = parseListPage(listHtml);
  if (limit > 0) entries = entries.slice(0, limit);
  console.error(`[maff_gi] list: ${entries.length} registered products`);

  const prefRows = await loadPrefectureRows();
  const muniRows = await loadMunicipalityRows();
  const out: MaffGiRecord[] = [];
  for (const e of entries) {
    try {
      const rec = await parseDetailPage(e.number, e.name, prefRows, muniRows);
      out.push(rec);
      if (out.length % 20 === 0) {
        console.error(`[maff_gi] processed ${out.length}/${entries.length}`);
      }
    } catch (err) {
      console.error(
        `[maff_gi] FAILED #${e.number} (${e.name}): ${(err as Error).message}`,
      );
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return out;
}

async function main(): Promise<void> {
  const records = await fetchMaffGi();
  const out = {
    source: {
      name: "MAFF Geographical Indication (GI) registered products",
      authority: "農林水産省",
      url: LIST_URL,
      license: "出典明記による二次利用可 (政府標準利用規約 2.0 / CC BY 4.0 互換)",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/maff_gi.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[maff_gi] wrote ${records.length} records to ${outPath}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[maff_gi] FAILED:", err);
    process.exit(1);
  });
}
