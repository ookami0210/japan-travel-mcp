/**
 * Decisions the campground official-page crawl makes without the network.
 *
 * The orchestrator in `scrapers/sources/scrape_campground_sites.ts` owns the
 * fetching, the politeness and the corpus file. What lives here is everything
 * it decides from data alone — which pages are worth asking for, when a site
 * is due again, whose domain is shared with the municipal crawl, and how a
 * page's text is fingerprinted — so those rules can be tested directly
 * instead of inferred from a crawl.
 */

import { createHash } from "node:crypto";

/** Re-read a site a month after the last read; prices move seasonally. */
export const RECHECK_DAYS = 30;

export interface CrawledPage {
  url: string;
  final_url: string;
  title: string;
  http_status: number;
  /** sha256 of the stored text — a consumer re-reads only what changed. */
  content_sha256: string;
  chars: number;
  charset: string | null;
  text: string;
  fetched_at: string;
}

export interface CrawledSite {
  id: string;
  name: string | null;
  prefecture_code: string | null;
  homepage: string;
  pages: CrawledPage[];
  pages_attempted: number;
  pages_failed: number;
  /** When the site was last visited — what the monthly cycle is measured on. */
  crawled_at: string;
  /**
   * When the stored pages were fetched. Equal to `crawled_at` on a successful
   * visit, and older when a visit found the site down and the previous text
   * was kept: a reader must be able to tell the age of the text itself from
   * the age of the last attempt.
   */
  pages_fetched_at: string;
  /** Set when the last visit produced nothing usable, so the reason is on record. */
  note?: string;
}

/**
 * Fold a fresh visit into what we already had for that campground.
 *
 * A site that did not answer this month must not erase the text we hold: a
 * holiday-season outage, a certificate that lapsed for a week, a host that
 * rate-limited us — none of those mean the campground's prices are unknown
 * again. So an empty visit advances the attempt clock and records why, while
 * the last real pages stay, with their own fetch date. A visit that did
 * return pages replaces them outright: the operator's current page is the
 * truth, including when it now says less than it used to.
 */
export function mergeVisit(previous: CrawledSite | undefined, visit: CrawledSite): CrawledSite {
  if (visit.pages.length > 0) return visit;
  if (!previous || previous.pages.length === 0) return visit;
  return {
    ...previous,
    // The homepage on record may have changed even when the visit failed.
    homepage: visit.homepage,
    name: visit.name,
    prefecture_code: visit.prefecture_code,
    crawled_at: visit.crawled_at,
    pages_attempted: visit.pages_attempted,
    pages_failed: visit.pages_failed,
    note: visit.note,
  };
}

/**
 * Link text or path that promises the facts a guest books on.
 *
 * Matched against the link text and against the path, never the host: a
 * campground's domain almost always contains "camp", and a pattern tested on
 * the whole URL would call every link on the site a promising one and destroy
 * the ordering this list exists to produce.
 *
 * Romanised paths are included because half of this population writes them —
 * /ryokin/, /annai/, /yoyaku/ are as common as the kanji equivalents.
 */
const INFO_LINK_RE =
  /料金|価格|費用|利用案内|ご利用|案内|施設|設備|サイト紹介|区画|アクセス|交通|予約|空き|よくある|質問|q\s*&\s*a|faq|規約|ルール|注意|営業|開設|シーズン|期間|キャンプ|オートキャンプ|宿泊|price|charge|fee|facilit|equip|access|reserv|book|guide|rule|season|stay|camp(site|ground|_?site)|ryokin|kingaku|riyou|annai|shisetsu|setsubi|yoyaku|kukaku|kiyaku|eigyou/i;

/** The part of a URL a keyword may be read from: path and query, not the host. */
function rankablePart(url: string): string {
  try {
    const u = new URL(url);
    const raw = `${u.pathname}${u.search}`;
    try {
      return decodeURI(raw);
    } catch {
      // A malformed percent-escape is not a reason to drop a real page; rank
      // it on the raw form instead.
      return raw;
    }
  } catch {
    return url;
  }
}

/** Things that are not a page of text. */
const SKIP_HREF_RE =
  /\.(jpe?g|png|gif|webp|svg|bmp|ico|pdf|docx?|xlsx?|pptx?|zip|rar|mp3|mp4|mov|avi|css|js|xml|rss|ics)(\?|#|$)/i;

/** Links that leave the site in spirit even when they stay on the host. */
const SKIP_PATH_RE = /\/(wp-admin|wp-login|cart|mypage|login|signup|search|tag|category\/page)\b/i;

/**
 * Pages that exist on every site and never carry a bookable fact. Worth
 * naming explicitly: with a budget of eight pages, a privacy policy that got
 * in costs a page that a price list could have had.
 */
const BOILERPLATE_RE =
  /privacy|policy|プライバシー|個人情報|sitemap|サイトマップ|copyright|著作権|利用環境|推奨環境|法人概要|会社概要|company|recruit|採用|mail-?form\/thanks|thanks|完了/i;

/**
 * The part of a site a recorded URL speaks for.
 *
 * A campground's URL on record is sometimes the site root (`https://camp.jp/`)
 * and sometimes one page inside a much larger site — a spot page on a tourism
 * association's portal, say. Those are not the same crawl. From a root, every
 * page on the host is plausibly about this campground. From one page inside a
 * portal, the site's other sections are about other things entirely: following
 * them fills the budget with 泊まる / 見る / 遊ぶ / お問い合わせ and never
 * reaches a price.
 *
 * So the scope is the directory the recorded URL sits in, and links are
 * followed only inside it. A root URL yields "/" and nothing is restricted.
 */
export function scopePrefix(url: string): string {
  try {
    const path = new URL(url).pathname;
    if (path.endsWith("/")) return path;
    const cut = path.lastIndexOf("/");
    return cut <= 0 ? "/" : path.slice(0, cut + 1);
  } catch {
    return "/";
  }
}

/** Scheme-insensitive identity: `http://x/a` and `https://x/a` are one page. */
function pageIdentity(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase().replace(/^www\./, "")}${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}

/**
 * Government hosts, where a town runs the campground and its page lives on
 * the town's own site. A fifth of the campgrounds with a page are here, and
 * these are the rural ones most worth keeping, so they are crawled — but the
 * municipal crawl visits the same hosts on its own schedule, and the two
 * workflows can overlap. Two processes each keeping 5 s per domain would put
 * 2.5 s on a shared host, under the published floor, so the crawl waits twice
 * as long on exactly those domains and the combined rate stays polite.
 */
const SHARED_WITH_MUNICIPAL_RE = /(\.(lg|go)\.jp|^(town|city|vill|pref)\.)/;

/** sha256 of the page text, so a consumer can skip unchanged pages. */
export function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** A site is due when it has never been read, or was read a window ago. */
export function isStale(
  crawledAt: string | undefined,
  now: number,
  days = RECHECK_DAYS,
): boolean {
  if (!crawledAt) return true;
  const t = Date.parse(crawledAt);
  if (Number.isNaN(t)) return true;
  return t < now - days * 86_400_000;
}

/** Host without the `www.` prefix, lowercased; null when the URL is unusable. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** True when the municipal crawl also visits this host. */
export function sharedWithMunicipalCrawl(url: string): boolean {
  const host = hostOf(url);
  return host ? SHARED_WITH_MUNICIPAL_RE.test(host) : false;
}

/** Drop the fragment; it is the same page. Keep the query, it selects content. */
export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Pick the pages worth fetching after the homepage.
 *
 * Same host only, assets and account paths out, and the ones whose link text
 * or path promises prices, facilities, access, booking or season come first —
 * eight pages is not enough to walk a site, so the order is what matters.
 * Links that promise nothing in particular keep their place behind those, so a
 * site whose navigation is images-only still contributes its real pages.
 */
export function selectInfoLinks(
  links: { href: string; text: string }[],
  homepage: string,
  max: number,
): string[] {
  const homeHost = hostOf(homepage);
  const scope = scopePrefix(homepage);
  const seen = new Set<string>([pageIdentity(homepage)]);
  const preferred: string[] = [];
  const rest: string[] = [];

  for (const link of links) {
    const url = normalizeUrl(link.href, homepage);
    if (!url) continue;
    if (hostOf(url) !== homeHost) continue;
    if (!new URL(url).pathname.startsWith(scope)) continue;
    if (SKIP_HREF_RE.test(url) || SKIP_PATH_RE.test(url)) continue;
    const rankable = rankablePart(url);
    if (BOILERPLATE_RE.test(link.text) || BOILERPLATE_RE.test(rankable)) continue;
    const identity = pageIdentity(url);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const promises = INFO_LINK_RE.test(link.text) || INFO_LINK_RE.test(rankable);
    (promises ? preferred : rest).push(url);
  }
  return [...preferred, ...rest].slice(0, max);
}
