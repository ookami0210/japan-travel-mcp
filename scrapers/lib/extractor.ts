/**
 * HTML → structured page data.
 *
 * Best-effort extraction of:
 *   - title, meta description
 *   - h1 / h2 headings
 *   - links (filtered later by caller)
 *   - images
 *   - language (html[lang], hreflang alternates)
 *   - geo (og:latitude, schema.org JSON-LD GeoCoordinates)
 *   - postal address (heuristic: 〒XXX-XXXX prefix)
 */

import * as cheerio from "cheerio";
import type { Lang } from "./types.js";

export interface ExtractedPage {
  title: string;
  description: string | null;
  headings: string[];
  links: { href: string; text: string }[];
  images: string[];
  language: Lang;
  hreflangs: { lang: string; href: string }[];
  ogImage: string | null;
  geo: { lat: number; lng: number } | null;
  address: string | null;
  canonical: string | null;
}

function detectLang(htmlLang: string | undefined): Lang {
  if (!htmlLang) return "unknown";
  const v = htmlLang.toLowerCase();
  if (v.startsWith("ja")) return "ja";
  if (v.startsWith("en")) return "en";
  if (v.startsWith("zh")) return "zh";
  if (v.startsWith("ko")) return "ko";
  return "unknown";
}

function safeUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function parseGeoFromJsonLd(scriptText: string): { lat: number; lng: number } | null {
  try {
    const data = JSON.parse(scriptText);
    const items: unknown[] = Array.isArray(data) ? data : [data];
    for (const raw of items) {
      if (typeof raw !== "object" || raw === null) continue;
      const item = raw as Record<string, unknown>;
      const geo = item.geo as Record<string, unknown> | undefined;
      if (geo && (geo.latitude || geo["@type"] === "GeoCoordinates")) {
        const lat = parseFloat(String(geo.latitude ?? ""));
        const lng = parseFloat(String(geo.longitude ?? ""));
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          return { lat, lng };
        }
      }
    }
  } catch {
    // ignore malformed JSON-LD
  }
  return null;
}

export function extract(html: string, baseUrl: string): ExtractedPage {
  const $ = cheerio.load(html);

  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    null;

  const headings: string[] = [];
  $("h1, h2").each((_, el) => {
    const t = $(el).text().trim();
    if (t) headings.push(t);
  });

  const links: { href: string; text: string }[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = safeUrl(href, baseUrl);
    if (!abs) return;
    if (!/^https?:/i.test(abs)) return;
    links.push({ href: abs, text: $(el).text().trim() });
  });

  const images: string[] = [];
  $("img[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const abs = safeUrl(src, baseUrl);
    if (abs) images.push(abs);
  });

  const language = detectLang($("html").attr("lang"));

  const hreflangs: { lang: string; href: string }[] = [];
  $('link[rel="alternate"][hreflang]').each((_, el) => {
    const lang = $(el).attr("hreflang");
    const href = $(el).attr("href");
    if (lang && href) {
      const abs = safeUrl(href, baseUrl);
      if (abs) hreflangs.push({ lang, href: abs });
    }
  });

  const ogImageRaw = $('meta[property="og:image"]').attr("content")?.trim();
  const ogImage = ogImageRaw ? safeUrl(ogImageRaw, baseUrl) : null;

  const canonicalRaw =
    $('link[rel="canonical"]').attr("href")?.trim() ||
    $('meta[property="og:url"]').attr("content")?.trim() ||
    null;
  const canonical = canonicalRaw ? safeUrl(canonicalRaw, baseUrl) : null;

  let geo: { lat: number; lng: number } | null = null;
  const ogLat = $(
    'meta[property="og:latitude"], meta[property="place:location:latitude"]',
  )
    .attr("content")
    ?.trim();
  const ogLng = $(
    'meta[property="og:longitude"], meta[property="place:location:longitude"]',
  )
    .attr("content")
    ?.trim();
  if (ogLat && ogLng) {
    const lat = parseFloat(ogLat);
    const lng = parseFloat(ogLng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      geo = { lat, lng };
    }
  }
  if (!geo) {
    $('script[type="application/ld+json"]').each((_, el) => {
      if (geo) return;
      const txt = $(el).text();
      const found = parseGeoFromJsonLd(txt);
      if (found) geo = found;
    });
  }

  const text = $("body").text();

  // Address extraction priority chain:
  //   1. schema.org JSON-LD PostalAddress (highest confidence)
  //   2. 〒XXX-XXXX postal-code prefix (strong signal)
  //   3. Labelled patterns: 住所:, 所在地:, Address: (heuristic)
  let address: string | null = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (address) return;
    try {
      const data = JSON.parse($(el).text());
      const items: unknown[] = Array.isArray(data) ? data : [data];
      for (const raw of items) {
        if (typeof raw !== "object" || raw === null) continue;
        const item = raw as Record<string, unknown>;
        const addr = item.address;
        if (typeof addr === "string" && addr.length > 5) {
          address = addr.trim();
          return;
        }
        if (typeof addr === "object" && addr !== null) {
          const a = addr as Record<string, unknown>;
          const parts = [
            a.postalCode ? `〒${String(a.postalCode)}` : "",
            String(a.addressRegion ?? ""),
            String(a.addressLocality ?? ""),
            String(a.streetAddress ?? ""),
          ]
            .filter((s) => s && s.length > 0)
            .map((s) => s.trim());
          if (parts.length >= 2) {
            address = parts.join(" ").trim();
            return;
          }
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
  });

  if (!address) {
    const addrMatch = text.match(/〒\s*\d{3}[-‐ー]?\d{4}[\s\S]{1,80}?(?=\s|$)/);
    if (addrMatch) address = addrMatch[0].replace(/\s+/g, " ").trim();
  }

  if (!address) {
    const labelRe =
      /(?:住所|所在地|アドレス|Address|ADDRESS)[\s::]+([^\n\r。]{5,80})/;
    const m = text.match(labelRe);
    if (m) {
      address = m[1].replace(/\s+/g, " ").trim();
    }
  }

  return {
    title,
    description,
    headings,
    links,
    images: images.slice(0, 30),
    language,
    hreflangs,
    ogImage,
    geo,
    address,
    canonical,
  };
}
