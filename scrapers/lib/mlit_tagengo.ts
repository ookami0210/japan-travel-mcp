/**
 * Page parsers for the Japan Tourism Agency's multilingual explanatory-text
 * database (DATA_SOURCES.md #53).
 *
 * The search listing (`cgi-bin/search.cgi`, 100 entries a page) names every
 * entry id; each entry page (`/tagengo-db/<id>.html`) holds the title,
 * prefectures, genres, media, fiscal year, council, location and the text in
 * each language between `<!-- commentary_<lang> -->` markers.
 */

import * as cheerio from "cheerio";
import type { MlitTagengoRecord, OfficialTextBody, OfficialTextLang } from "../../src/lib/official_texts.js";
import { PREFECTURE_NAMES_JA } from "./prefectures.js";

export const TAGENGO_BASE = "https://www.mlit.go.jp/tagengo-db/";
export const LISTING_PAGE_SIZE = 100;

export function listingUrl(page: number): string {
  return `${TAGENGO_BASE}cgi-bin/search.cgi?area=&keyword=&page_size=${LISTING_PAGE_SIZE}&page_order=&page=${page}`;
}

export function entryUrl(entryId: string): string {
  return `${TAGENGO_BASE}${entryId}.html`;
}

const ENTRY_HREF_RE = /\/tagengo-db\/((?:H|R)\d{1,2}-\d{5})\.html/;

const CODE_BY_PREF_NAME = new Map(Object.entries(PREFECTURE_NAMES_JA).map(([code, name]) => [name, code]));

export function prefectureCodes(names: string[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    const c = CODE_BY_PREF_NAME.get(n.trim());
    if (c) out.add(c);
  }
  return [...out].sort();
}

/** Total entry count the listing reports ("9369 件"), or null. */
export function listingTotal(html: string): number | null {
  const text = cheerio.load(html)("body").text().replace(/\s+/g, " ");
  const m = /(\d[\d,]*)\s*件\s*\d+\s*～\s*\d+\s*件を表示/.exec(text);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** Entry ids on one listing page, in page order. */
export function listingEntryIds(html: string): string[] {
  const $ = cheerio.load(html);
  const out: string[] = [];
  $("article.result__article h2 a").each((_, a) => {
    const m = ENTRY_HREF_RE.exec($(a).attr("href") ?? "");
    if (m && !out.includes(m[1])) out.push(m[1]);
  });
  return out;
}

const LANG_MARKERS: Record<string, OfficialTextLang> = {
  en: "en",
  ja: "ja",
  zhcn: "zh-Hans",
  zhtw: "zh-Hant",
  ko: "ko",
  kr: "ko",
};

/** The title and paragraphs of one commentary block. */
export function commentaryText(fragment: string): OfficialTextBody | null {
  const $ = cheerio.load(`<div id="root">${fragment}</div>`);
  const paras: string[] = [];
  $("#root p").each((_, p) => {
    const t = $(p).text().replace(/\s+/g, " ").trim();
    if (t) paras.push(t);
  });
  if (paras.length === 0) {
    const t = $("#root").text().replace(/\s+/g, " ").trim();
    if (t) paras.push(t);
  }
  if (paras.length === 0) return null;
  // The first paragraph is the title when the page sets it in bold on its own.
  const first = $("#root p").first();
  // Older entries set it as a plain short line with no sentence ending.
  const bold = first.children().length === 1 && first.children("b, strong").length === 1
    && first.text().trim() === first.children("b, strong").text().trim();
  const headingLine = paras[0].length <= 80 && !/[.。!?！？]$/.test(paras[0]);
  const isTitle = paras.length > 1 && (bold || headingLine);
  const title = isTitle ? paras.shift() ?? null : null;
  return { title, body: paras.join("\n\n") };
}

function dlValue($: cheerio.CheerioAPI, label: string): string | null {
  let out: string | null = null;
  $("dl.list__information div.group").each((_, g) => {
    if (out !== null) return;
    if ($(g).find("dt").text().replace(/\s+/g, "").startsWith(label)) {
      const v = $(g).find("dd").text().replace(/\s+/g, " ").trim();
      out = v || null;
    }
  });
  return out;
}

/** One entry page as a record; null when the page holds no text. */
export function parseEntryPage(html: string, entryId: string, fetchedAt: string): MlitTagengoRecord | null {
  const $ = cheerio.load(html);
  const detail = $(".search__detail");
  const titleJa = detail.find("h2.title strong").first().text().replace(/\s+/g, " ").trim() || null;
  const prefectures: string[] = [];
  detail.find("ul.list__region li").each((_, li) => {
    const t = $(li).text().trim();
    if (t && !prefectures.includes(t)) prefectures.push(t);
  });
  const spans = (cls: string): string[] => {
    const out: string[] = [];
    detail.find(`dl.list__division dd.${cls} span`).each((_, s) => {
      const t = $(s).text().trim();
      if (t && !out.includes(t)) out.push(t);
    });
    return out;
  };
  const year = dlValue($, "作成年度");
  const fiscalYear = year && /(\d{4})/.exec(year) ? Number(/(\d{4})/.exec(year)![1]) : null;

  const texts: MlitTagengoRecord["texts"] = {};
  for (const m of html.matchAll(/<!--\s*commentary_([a-z]+)\s*-->([\s\S]*?)<!--\s*\/commentary_\1\s*-->/gi)) {
    const lang = LANG_MARKERS[m[1].toLowerCase()];
    if (!lang || texts[lang]) continue;
    const t = commentaryText(m[2]);
    if (t) texts[lang] = t;
  }
  if (!texts.en && !texts.ja) return null;
  return {
    entry_id: entryId,
    url: entryUrl(entryId),
    title_ja: titleJa,
    prefectures,
    prefecture_codes: prefectureCodes(prefectures),
    genres: spans("genre"),
    media: spans("media"),
    fiscal_year: fiscalYear,
    council: dlValue($, "地域協議会名"),
    address: dlValue($, "位置情報"),
    texts,
    fetched_at: fetchedAt,
  };
}
