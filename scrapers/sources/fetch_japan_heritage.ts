/**
 * Fetch the official Japan Heritage (日本遺産) story list.
 *
 * Source: https://japan-heritage.bunka.go.jp/ja/stories/
 * Authority: Agency for Cultural Affairs (文化庁), Japan
 *
 * Each story page (e.g. /stories/story001/) contains:
 *   - <h2><em>title</em><i>subtitle</i><span>STORY #NNN</span></h2>
 *   - .terms_item.theme  (theme tags)
 *   - .terms_item.period (era tags)
 *   - .lead .txt         (official lead paragraph)
 *
 * The story-info subpage (/stories/storyNNN/info/) starts with a <p class="txt">
 * listing the related municipalities (e.g. "茨城県（水戸市）・栃木県（足利市）...").
 *
 * Output: data/r3/japan_heritage.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_japan_heritage.ts
 *   JH_LIMIT=3 npx tsx scrapers/sources/fetch_japan_heritage.ts
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

const BASE = "https://japan-heritage.bunka.go.jp";
const LIST_URL = `${BASE}/ja/stories/`;
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";
const RATE_LIMIT_MS = 1500;

export interface JapanHeritageRecord {
  source: "japan_heritage";
  authority: "文化庁 (Agency for Cultural Affairs)";
  story_id: string; // "001" .. "104"
  title_ja: string;
  subtitle_ja: string | null;
  themes: string[];
  periods: string[];
  related_areas_text: string | null;
  prefecture_codes: string[];
  /** Short official lead from <meta name="description">. Always present. */
  summary_ja: string | null;
  /** Concatenated long paragraphs from the story body (used as translation source). */
  body_ja: string | null;
  story_url: string;
  info_url: string;
  fetched_at: string;
}

async function fetchHtml(url: string): Promise<string | null> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function listStoryIds(): Promise<string[]> {
  const html = await fetchHtml(LIST_URL);
  if (!html) throw new Error("list page returned 404");
  const ids = new Set<string>();
  const re = /\/stories\/story(\d{3})\//g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) ids.add(m[1]);
  return [...ids].sort();
}

function extractTermsItem($: cheerio.CheerioAPI, cls: string): string[] {
  const out: string[] = [];
  $(`div.terms_item.${cls} ul.list li`).each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t) out.push(t);
  });
  return out;
}

function extractTitleAndSubtitle(
  $: cheerio.CheerioAPI,
): { title: string; subtitle: string | null } {
  // <h2><em>title</em><i>─subtitle─</i><span>STORY #001</span></h2>
  // The <h2> may live inside .main_visual or the lead block. Take the first
  // h2 that contains both <em> and <span class>STORY.
  let title = "";
  let subtitle: string | null = null;
  $("h2").each((_, el) => {
    const em = $(el).find("em").first();
    const span = $(el).find("span").first().text();
    if (em.length === 0 || !/STORY\s*#/i.test(span)) return;
    title = em.text().trim();
    const i = $(el).find("i").first().text().trim();
    if (i) subtitle = i.replace(/^[─\-—]+|[─\-—]+$/g, "").trim() || null;
    return false; // break
  });
  return { title, subtitle };
}

function extractMetaDescription($: cheerio.CheerioAPI): string | null {
  const v = $('meta[name="description"]').attr("content");
  return v ? v.replace(/\s+/g, " ").trim() : null;
}

function extractBody($: cheerio.CheerioAPI): string | null {
  // Strip layout chrome (banners, sliders, share buttons, breadcrumbs, header,
  // footer, navigation) so only narrative paragraphs remain.
  const $$ = cheerio.load($.html());
  $$(
    [
      ".con_lp_banner",
      ".con_share",
      ".con_header",
      ".con_footer",
      ".gnav",
      ".topicpath",
      ".breadcrumb",
      ".con_pnav",
      ".slide",
      ".wrp_terms",
      ".con_news",
      ".con_special",
      ".con_lp",
      "header",
      "footer",
      "nav",
      "script",
      "style",
      ".btn",
      ".con_other",
    ].join(", "),
  ).remove();

  const paragraphs: string[] = [];
  $$("p, div.txt").each((_, el) => {
    const t = $$(el).text().replace(/\s+/g, " ").trim();
    if (t.length >= 50) paragraphs.push(t);
  });
  // Dedup while keeping order.
  const seen = new Set<string>();
  const unique = paragraphs.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  if (unique.length === 0) return null;
  // Cap at first ~6 paragraphs to keep token cost bounded.
  return unique.slice(0, 6).join("\n\n");
}

async function parseStoryDetail(
  storyId: string,
  prefRows: Awaited<ReturnType<typeof loadPrefectureRows>>,
  muniRows: Awaited<ReturnType<typeof loadMunicipalityRows>>,
): Promise<JapanHeritageRecord> {
  const storyUrl = `${BASE}/ja/stories/story${storyId}/`;
  const infoUrl = `${BASE}/ja/stories/story${storyId}/info/`;
  const [storyHtml, infoHtml] = await Promise.all([
    fetchHtml(storyUrl),
    fetchHtml(infoUrl).catch(() => null),
  ]);
  if (!storyHtml) throw new Error(`story page 404: ${storyUrl}`);

  const $ = cheerio.load(storyHtml);
  const { title, subtitle } = extractTitleAndSubtitle($);
  const themes = extractTermsItem($, "theme");
  const periods = extractTermsItem($, "period");
  const summary = extractMetaDescription($);
  const body = extractBody($);

  let relatedAreasText: string | null = null;
  if (infoHtml) {
    const $$ = cheerio.load(infoHtml);
    // The first <p class="txt"> on the info page lists the prefectures.
    const t = $$("p.txt").first().text().replace(/\s+/g, " ").trim();
    if (t) relatedAreasText = t;
  }

  const prefCodes = extractPrefectureCodes(
    [relatedAreasText ?? "", body ?? "", summary ?? "", title ?? ""].join(" "),
    prefRows,
    muniRows,
  );

  return {
    source: "japan_heritage",
    authority: "文化庁 (Agency for Cultural Affairs)",
    story_id: storyId,
    title_ja: title,
    subtitle_ja: subtitle,
    themes,
    periods,
    related_areas_text: relatedAreasText,
    prefecture_codes: prefCodes,
    summary_ja: summary,
    body_ja: body,
    story_url: storyUrl,
    info_url: infoUrl,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchJapanHeritage(): Promise<JapanHeritageRecord[]> {
  const limit = parseInt(process.env.JH_LIMIT ?? "0", 10);
  let ids = await listStoryIds();
  if (limit > 0) ids = ids.slice(0, limit);
  console.error(`[japan_heritage] list: ${ids.length} stories`);
  const prefRows = await loadPrefectureRows();
  const muniRows = await loadMunicipalityRows();

  const out: JapanHeritageRecord[] = [];
  for (const id of ids) {
    try {
      const rec = await parseStoryDetail(id, prefRows, muniRows);
      out.push(rec);
      if (out.length % 10 === 0) {
        console.error(
          `[japan_heritage] processed ${out.length}/${ids.length}`,
        );
      }
    } catch (err) {
      console.error(
        `[japan_heritage] FAILED story ${id}: ${(err as Error).message}`,
      );
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
  return out;
}

async function main(): Promise<void> {
  const records = await fetchJapanHeritage();
  const out = {
    source: {
      name: "Japan Heritage (日本遺産)",
      authority: "文化庁",
      url: LIST_URL,
      license:
        "公式制度の登録名・概要。出典明記による教育・観光案内目的の引用",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/japan_heritage.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(
    `[japan_heritage] wrote ${records.length} records to ${outPath}`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[japan_heritage] FAILED:", err);
    process.exit(1);
  });
}
