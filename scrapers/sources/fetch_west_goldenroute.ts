/**
 * Fetch the official "GOLDEN ROUTE to WEST JAPAN" content set.
 *
 * Source: https://japan-west-goldenroute.com/ (official English site)
 * Authority: 西日本・九州ゴールデンルートアライアンス
 *   (Golden Route to West Japan Alliance — 300+ municipalities and partner
 *   organizations; secretariat: Fukuoka City. The Japanese portal
 *   https://west-goldenroute.jp/ is operated by Fukuoka City and links to
 *   this .com site as its official English edition.)
 *
 * The site is a WordPress build with server-side HTML and four content
 * sitemaps we harvest:
 *   - destinations-sitemap.xml    → per-city destination guides (~19)
 *   - itineraries-sitemap.xml     → model courses (~11)
 *   - post-sitemap.xml            → special features / articles (~15)
 *   - browse-contents-sitemap.xml → per-spot / per-experience pages (~300)
 *
 * robots.txt explicitly allows AI crawlers (GPTBot / ClaudeBot / CCBot
 * `Allow: /`); only /wp-admin/ is disallowed and we never touch it.
 *
 * Output: data/r3/west_goldenroute.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_west_goldenroute.ts
 *   WGR_LIMIT=5 npx tsx scrapers/sources/fetch_west_goldenroute.ts   # per-type cap
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const BASE = "https://japan-west-goldenroute.com";
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";
const RATE_LIMIT_MS = 2000;

/** Site-wide fallback meta description — treated as "no description". */
const GENERIC_META =
  "Your guide to Western Japan — destinations, model itineraries, and travel tips beyond Tokyo and Kyoto.";

const SEASONS = new Set(["Spring", "Summer", "Autumn", "Winter"]);

export type WestGoldenrouteRecordType =
  | "destination"
  | "itinerary"
  | "feature"
  | "content";

export interface WestGoldenrouteRecord {
  source: "west_goldenroute";
  authority: string;
  record_id: string; // "<type>:<slug>"
  record_type: WestGoldenrouteRecordType;
  name_en: string;
  /** Official Japanese name for member destinations (fixed alliance list). */
  name_ja: string | null;
  description_en: string | null;
  body_en: string | null;
  categories: string[];
  seasons: string[];
  /** Destination labels tagged on the page (e.g. "Iki City"). */
  destinations: string[];
  prefecture_codes: string[];
  /** External official-guide links found on destination pages. */
  official_links: string[];
  url: string;
  fetched_at: string;
}

const AUTHORITY =
  "西日本・九州ゴールデンルートアライアンス (Golden Route to West Japan Alliance; secretariat: Fukuoka City)";

/**
 * Fixed member-destination table (the alliance's published destination set).
 * Maps the site's destination slug to the official Japanese name and the
 * JIS prefecture code. City → prefecture membership is deterministic
 * public-registry data, not curation.
 */
const DESTINATIONS: Record<
  string,
  { name_en: string; name_ja: string; pref: string }
> = {
  "fukuoka-city": { name_en: "Fukuoka City", name_ja: "福岡市", pref: "40" },
  "kitakyushu-city": { name_en: "Kitakyushu City", name_ja: "北九州市", pref: "40" },
  "takeo-city": { name_en: "Takeo City", name_ja: "武雄市", pref: "41" },
  "nagasaki-city": { name_en: "Nagasaki City", name_ja: "長崎市", pref: "42" },
  "iki-city": { name_en: "Iki City", name_ja: "壱岐市", pref: "42" },
  "kumamoto-city": { name_en: "Kumamoto City", name_ja: "熊本市", pref: "43" },
  "beppu-city": { name_en: "Beppu City", name_ja: "別府市", pref: "44" },
  "yufu-city": { name_en: "Yufu City", name_ja: "由布市", pref: "44" },
  "miyazaki-city": { name_en: "Miyazaki City", name_ja: "宮崎市", pref: "45" },
  "kagoshima-city": { name_en: "Kagoshima City", name_ja: "鹿児島市", pref: "46" },
  "shimonoseki-city": { name_en: "Shimonoseki City", name_ja: "下関市", pref: "35" },
  "matsuyama-city": { name_en: "Matsuyama City", name_ja: "松山市", pref: "38" },
  "takamatsu-city": { name_en: "Takamatsu City", name_ja: "高松市", pref: "37" },
  "hiroshima-prefecture": { name_en: "Hiroshima Prefecture", name_ja: "広島県", pref: "34" },
  "okayama-city": { name_en: "Okayama City", name_ja: "岡山市", pref: "33" },
  "okayama-prefecture": { name_en: "Okayama Prefecture", name_ja: "岡山県", pref: "33" },
  "tottori-prefecture": { name_en: "Tottori Prefecture", name_ja: "鳥取県", pref: "31" },
  "himeji-city": { name_en: "Himeji City", name_ja: "姫路市", pref: "28" },
  "kobe-city": { name_en: "Kobe City", name_ja: "神戸市", pref: "28" },
};

/** English destination label → prefecture code (for page-tag resolution). */
const LABEL_TO_PREF: Record<string, string> = Object.fromEntries(
  Object.values(DESTINATIONS).map((d) => [d.name_en.toLowerCase(), d.pref]),
);

const SITEMAPS: { file: string; type: WestGoldenrouteRecordType; pathPrefix: string }[] = [
  { file: "destinations-sitemap.xml", type: "destination", pathPrefix: "/destinations/" },
  { file: "itineraries-sitemap.xml", type: "itinerary", pathPrefix: "/itineraries/" },
  { file: "post-sitemap.xml", type: "feature", pathPrefix: "/special-features/" },
  { file: "browse-contents-sitemap.xml", type: "content", pathPrefix: "/browse-content/" },
];

async function fetchText(url: string): Promise<string | null> {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en" },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parseSitemapLocs(xml: string, pathPrefix: string): string[] {
  const out: string[] = [];
  // AIOSEO wraps every <loc> value in CDATA.
  const re = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const url = m[1].trim();
    if (!url.includes(pathPrefix)) continue;
    const slug = slugOf(url, pathPrefix);
    if (!slug) continue; // section index page
    if (/\.(jpe?g|png|gif|webp|pdf|svg)\/?$/i.test(slug)) continue; // media noise in the sitemap
    out.push(url);
  }
  return [...new Set(out)];
}

function slugOf(url: string, pathPrefix: string): string | null {
  const idx = url.indexOf(pathPrefix);
  if (idx < 0) return null;
  const rest = url.slice(idx + pathPrefix.length).replace(/\/+$/, "");
  return rest || null;
}

function cleanText(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function extractBody($: cheerio.CheerioAPI): string | null {
  const $$ = cheerio.load($("main").html() ?? $.html());
  $$("header, footer, nav, script, style, .o-breadcrumb, .cmplz-cookiebanner").remove();
  const paragraphs: string[] = [];
  $$("p, li").each((_, el) => {
    const t = cleanText($$(el).text());
    if (t.length >= 60) paragraphs.push(t);
  });
  const seen = new Set<string>();
  const unique = paragraphs.filter((p) => {
    if (seen.has(p)) return false;
    seen.add(p);
    return true;
  });
  if (unique.length === 0) return null;
  // Cap to keep record size and embedding cost bounded.
  return unique.slice(0, 8).join("\n\n");
}

function parsePage(
  html: string,
  url: string,
  type: WestGoldenrouteRecordType,
  slug: string,
): WestGoldenrouteRecord | null {
  const $ = cheerio.load(html);

  // Feature pages carry "title<br>subtitle" inside one <h1>.
  $("h1 br").replaceWith(" — ");
  const h1 = cleanText($("h1").first().text());
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const name =
    h1 ||
    (ogTitle ? cleanText(ogTitle.split("|")[0]) : "") ||
    cleanText($("title").text().split("|")[0]);
  if (!name) return null;

  const metaDesc = $('meta[name="description"]').attr("content");
  const description =
    metaDesc && cleanText(metaDesc) !== GENERIC_META
      ? cleanText(metaDesc)
      : null;

  // Tag chips: `.c-tag` mixes thematic categories and season labels;
  // `.c-government-tag` carries the destination ("#Iki City").
  const categories: string[] = [];
  const seasons: string[] = [];
  $(".p-article__tags .c-tag, .c-tag").each((_, el) => {
    // Destination pages prefix tag chips with "#"; content pages don't.
    const t = cleanText($(el).text()).replace(/^#/, "");
    if (!t) return;
    if (SEASONS.has(t)) {
      if (!seasons.includes(t)) seasons.push(t);
    } else if (!categories.includes(t)) {
      categories.push(t);
    }
  });

  const destinations: string[] = [];
  $(".c-government-tag").each((_, el) => {
    const t = cleanText($(el).text()).replace(/^#/, "").trim();
    if (t && !destinations.includes(t)) destinations.push(t);
  });

  const prefCodes = new Set<string>();
  if (type === "destination" && DESTINATIONS[slug]) {
    prefCodes.add(DESTINATIONS[slug].pref);
  }
  for (const d of destinations) {
    const code = LABEL_TO_PREF[d.toLowerCase()];
    if (code) prefCodes.add(code);
  }
  // Itineraries / features: derive prefectures from destination links in
  // the page body (each stop links to its /destinations/<slug>/ page).
  $('a[href*="/destinations/"]').each((_, el) => {
    const s = slugOf($(el).attr("href") ?? "", "/destinations/");
    if (s && DESTINATIONS[s]) prefCodes.add(DESTINATIONS[s].pref);
  });

  // Restrict to the page's "Official Tourist Information" section — the
  // rest of a destination page links experience cards straight to OTA
  // booking products, which are out of scope per DATA_POLICY.
  const officialLinks: string[] = [];
  if (type === "destination") {
    $(".l-official-tourist-information a[href^='http']").each((_, el) => {
      const href = ($(el).attr("href") ?? "").trim();
      if (!href || href.includes("japan-west-goldenroute.com")) return;
      if (!officialLinks.includes(href)) officialLinks.push(href);
    });
  }

  const body = extractBody($);

  return {
    source: "west_goldenroute",
    authority: AUTHORITY,
    record_id: `${type}:${slug}`,
    record_type: type,
    name_en: name,
    name_ja: type === "destination" ? (DESTINATIONS[slug]?.name_ja ?? null) : null,
    description_en: description,
    body_en: body,
    categories,
    seasons,
    destinations,
    prefecture_codes: [...prefCodes].sort(),
    official_links: officialLinks.slice(0, 8),
    url,
    fetched_at: new Date().toISOString(),
  };
}

export async function fetchWestGoldenroute(): Promise<WestGoldenrouteRecord[]> {
  const limit = parseInt(process.env.WGR_LIMIT ?? "0", 10);
  const out: WestGoldenrouteRecord[] = [];

  for (const sm of SITEMAPS) {
    const xml = await fetchText(`${BASE}/${sm.file}`);
    if (!xml) {
      console.error(`[west_goldenroute] WARN sitemap missing: ${sm.file}`);
      continue;
    }
    let urls = parseSitemapLocs(xml, sm.pathPrefix);
    if (limit > 0) urls = urls.slice(0, limit);
    console.error(
      `[west_goldenroute] ${sm.type}: ${urls.length} pages from ${sm.file}`,
    );

    for (const url of urls) {
      const slug = slugOf(url, sm.pathPrefix);
      if (!slug) continue;
      try {
        const html = await fetchText(url);
        if (!html) {
          console.error(`[west_goldenroute] 404: ${url}`);
          continue;
        }
        const rec = parsePage(html, url, sm.type, slug);
        if (rec) out.push(rec);
        if (out.length % 25 === 0) {
          console.error(`[west_goldenroute] processed ${out.length} records`);
        }
      } catch (err) {
        console.error(
          `[west_goldenroute] FAILED ${url}: ${(err as Error).message}`,
        );
      }
      await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    }
  }
  return out;
}

async function main(): Promise<void> {
  const records = await fetchWestGoldenroute();
  if (records.length === 0) {
    throw new Error("no records fetched — refusing to overwrite output");
  }
  const out = {
    source: {
      name: "GOLDEN ROUTE to WEST JAPAN (西のゴールデンルート)",
      authority: AUTHORITY,
      url: `${BASE}/`,
      license:
        "公式アライアンスの公開情報 (robots.txt が AI クローラーを明示許可; 削除依頼即対応)",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/west_goldenroute.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(
    `[west_goldenroute] wrote ${records.length} records to ${outPath}`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[west_goldenroute] FAILED:", err);
    process.exit(1);
  });
}
