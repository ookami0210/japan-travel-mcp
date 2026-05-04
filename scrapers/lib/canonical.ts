/**
 * URL canonicalisation.
 *
 * Multiple URL spellings can point to the same content:
 *   /site/kanko/  vs  /site/kanko  vs  /site/kanko/index1/
 *   ?utm_source=...  vs  no params
 *   HTTPS://Host  vs  https://host
 *
 * We normalise so the dedup layer can compare URLs reliably.
 *
 * If the page itself declares a canonical URL via <link rel="canonical"> or
 * <meta property="og:url">, that wins over heuristic normalisation.
 */

const TRACKING_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "utm_id",
  "fbclid",
  "gclid",
  "msclkid",
  "ref",
  "ref_src",
  "from",
]);

const INDEX_FILES = ["index.html", "index.htm", "index.php", "default.html"];

export function canonicalize(rawUrl: string): string {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return rawUrl;
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  if (
    (u.protocol === "https:" && u.port === "443") ||
    (u.protocol === "http:" && u.port === "80")
  ) {
    u.port = "";
  }

  // Strip index files
  for (const idx of INDEX_FILES) {
    if (u.pathname.toLowerCase().endsWith("/" + idx)) {
      u.pathname = u.pathname.slice(0, -idx.length);
      break;
    }
  }
  // Trim trailing slash for non-root paths
  if (u.pathname.length > 1) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }

  // Remove tracking parameters
  const keys = Array.from(u.searchParams.keys());
  for (const k of keys) {
    if (TRACKING_PARAMS.has(k.toLowerCase())) {
      u.searchParams.delete(k);
    }
  }
  // Sort remaining query parameters for stability
  u.searchParams.sort();

  return u.href;
}

/**
 * Choose the canonical URL given:
 *   - the URL we actually fetched
 *   - the page's declared canonical (from <link rel="canonical"> or og:url)
 *   - a base URL for resolving relative declarations
 *
 * Page-declared wins. Otherwise we canonicalise the fetched URL.
 */
export function pickCanonical(
  fetchedUrl: string,
  pageCanonical: string | null,
  baseUrl: string,
): string {
  if (pageCanonical) {
    try {
      const abs = new URL(pageCanonical, baseUrl).href;
      return canonicalize(abs);
    } catch {
      // ignore — fall through to fetchedUrl
    }
  }
  return canonicalize(fetchedUrl);
}
