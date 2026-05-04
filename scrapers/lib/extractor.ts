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
 *   - body paragraphs — first N substantive <p> elements after layout
 *     chrome is stripped. Added 2026-04-30 (ADR 0001 / workstream C1):
 *     before this, even when the BFS reached a rich feature page (a
 *     festival write-up, a tea-garden article), we kept only the meta
 *     description — discarding the actual narrative content.
 *   - schemaOrg events / places — JSON-LD Event / TouristAttraction /
 *     Place / FoodEstablishment objects. Added 2026-04-30 (ADR 0001 /
 *     workstream C2): these capture date, location, and structured
 *     metadata that meta tags can't.
 */

import * as cheerio from "cheerio";
import type { Lang } from "./types.js";

// Phase 1 (2026-05-01): widened from 8 → 30 paragraphs and 50 → 30 chars min
// so that "失われゆく", "後継者不足", endangered-tradition phrases that live in
// short headings or sub-paragraphs survive into body_paragraphs. Max stays at
// 1200 to keep nav-list dumps out.
const MAX_BODY_PARAGRAPHS = 30;
const MIN_PARAGRAPH_CHARS = 30;
const MAX_PARAGRAPH_CHARS = 1200;

export interface SchemaOrgEvent {
  type: "Event" | string;
  name: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  url: string | null;
}

export interface SchemaOrgPlace {
  type: string; // TouristAttraction | Place | LocalBusiness | FoodEstablishment | Restaurant | etc.
  name: string | null;
  description: string | null;
  address: string | null;
  url: string | null;
  geo: { lat: number; lng: number } | null;
}

export interface ExtractedPage {
  title: string;
  description: string | null;
  body_paragraphs: string[];
  headings: string[];
  links: { href: string; text: string }[];
  images: string[];
  language: Lang;
  hreflangs: { lang: string; href: string }[];
  ogImage: string | null;
  geo: { lat: number; lng: number } | null;
  address: string | null;
  canonical: string | null;
  schema_events: SchemaOrgEvent[];
  schema_places: SchemaOrgPlace[];
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

/**
 * Extract the article's body as a sequence of paragraphs. We strip layout
 * chrome (header / footer / nav / aside / .menu / .nav / .breadcrumb) so
 * what remains is the actual story / write-up. We then take <p> nodes
 * that look like prose (>= 50 chars, dedup), capped at the first 8.
 */
function extractBodyParagraphs($: cheerio.CheerioAPI): string[] {
  const body = $.html();
  const $$ = cheerio.load(body);
  $$(
    [
      "header", "footer", "nav", "aside",
      "script", "style", "noscript",
      ".header", ".footer", ".nav", ".navigation", ".navbar",
      ".breadcrumb", ".breadcrumbs", ".pankuzu",
      ".menu", ".side", ".sidebar", ".side-menu",
      ".gnav", ".lnav", ".global-nav", ".local-nav",
      ".pagetop", ".back-to-top", ".search",
      ".banner", ".ad", ".ads", ".advertisement",
      ".social", ".share", ".sns",
      ".cookie", ".consent",
      ".pagination", ".pager",
    ].join(", "),
  ).remove();
  const paragraphs: string[] = [];
  const seen = new Set<string>();
  $$("p, .article-body, .entry-content, article div").each((_, el) => {
    if (paragraphs.length >= MAX_BODY_PARAGRAPHS) return false;
    const t = $$(el).text().replace(/\s+/g, " ").trim();
    if (t.length < MIN_PARAGRAPH_CHARS) return;
    if (t.length > MAX_PARAGRAPH_CHARS) return; // skip giant blobs (= still nav / list dump)
    if (seen.has(t)) return;
    seen.add(t);
    paragraphs.push(t);
  });
  return paragraphs;
}

/**
 * Parse JSON-LD Event objects out of <script type="application/ld+json">.
 * Walks both single objects and arrays, and the @graph wrapper Schema.org
 * sometimes uses.
 */
function* walkJsonLd($: cheerio.CheerioAPI): Generator<Record<string, unknown>> {
  const scripts: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const t = $(el).text();
    if (t) scripts.push(t);
  });
  for (const s of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(s);
    } catch {
      continue;
    }
    const queue: unknown[] = [parsed];
    while (queue.length > 0) {
      const cur = queue.shift();
      if (Array.isArray(cur)) {
        queue.push(...cur);
        continue;
      }
      if (typeof cur !== "object" || cur === null) continue;
      const obj = cur as Record<string, unknown>;
      if (Array.isArray(obj["@graph"])) {
        queue.push(...(obj["@graph"] as unknown[]));
        continue;
      }
      yield obj;
    }
  }
}

function asString(v: unknown): string | null {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    if (typeof o.name === "string") return o.name.trim();
    if (typeof o["@id"] === "string") return (o["@id"] as string).trim();
  }
  return null;
}

function asAddress(v: unknown): string | null {
  if (typeof v === "string" && v.trim().length > 5) return v.trim();
  if (typeof v === "object" && v !== null) {
    const a = v as Record<string, unknown>;
    const parts = [
      a.postalCode ? `〒${String(a.postalCode)}` : "",
      String(a.addressRegion ?? ""),
      String(a.addressLocality ?? ""),
      String(a.streetAddress ?? ""),
    ]
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length >= 2) return parts.join(" ");
  }
  return null;
}

function asGeo(v: unknown): { lat: number; lng: number } | null {
  if (typeof v !== "object" || v === null) return null;
  const g = v as Record<string, unknown>;
  const lat = parseFloat(String(g.latitude ?? ""));
  const lng = parseFloat(String(g.longitude ?? ""));
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return null;
}

function isType(obj: Record<string, unknown>, ...wanted: string[]): boolean {
  const t = obj["@type"];
  if (typeof t === "string") return wanted.includes(t);
  if (Array.isArray(t)) return t.some((x) => typeof x === "string" && wanted.includes(x));
  return false;
}

function extractSchemaOrg($: cheerio.CheerioAPI): {
  events: SchemaOrgEvent[];
  places: SchemaOrgPlace[];
} {
  const events: SchemaOrgEvent[] = [];
  const places: SchemaOrgPlace[] = [];
  for (const obj of walkJsonLd($)) {
    if (
      isType(obj, "Event", "Festival", "MusicEvent", "TheaterEvent",
        "VisualArtsEvent", "FoodEvent", "SportsEvent", "ExhibitionEvent",
        "SocialEvent")
    ) {
      events.push({
        type: String(obj["@type"] ?? "Event"),
        name: asString(obj.name),
        description: asString(obj.description),
        start_date: asString(obj.startDate),
        end_date: asString(obj.endDate),
        location: asString(obj.location),
        url: asString(obj.url),
      });
    } else if (
      isType(obj, "TouristAttraction", "Place", "LocalBusiness",
        "FoodEstablishment", "Restaurant", "LandmarksOrHistoricalBuildings",
        "Museum", "Park", "PlaceOfWorship", "BuddhistTemple", "Church",
        "HinduTemple", "Mosque", "Synagogue", "TouristDestination",
        "Accommodation", "Hotel", "LodgingBusiness")
    ) {
      places.push({
        type: String(obj["@type"] ?? "Place"),
        name: asString(obj.name),
        description: asString(obj.description),
        address: asAddress(obj.address),
        url: asString(obj.url),
        geo: asGeo(obj.geo),
      });
    }
  }
  return { events, places };
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

  const body_paragraphs = extractBodyParagraphs($);
  const schema = extractSchemaOrg($);

  return {
    title,
    description,
    body_paragraphs,
    headings,
    links,
    images: images.slice(0, 30),
    language,
    hreflangs,
    ogImage,
    geo,
    address,
    canonical,
    schema_events: schema.events,
    schema_places: schema.places,
  };
}
