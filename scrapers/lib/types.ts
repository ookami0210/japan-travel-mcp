/**
 * Shared types for the scraping pipeline.
 */

export interface ScrapeOptions {
  /** Minimum interval between consecutive requests to the same domain (ms). */
  rateLimitMs: number;
  /** Concurrency cap across all domains. */
  globalConcurrency: number;
  /** User-Agent string. Identifies us per RFC 9110. */
  userAgent: string;
  /** Per-request timeout (ms). */
  timeoutMs: number;
  /** Number of retry attempts on transient errors. */
  retries: number;
  /** Maximum pages to fetch per municipality (discovery + extraction combined). */
  maxPagesPerMunicipality: number;
  /** If consecutive 5xx exceeds this number, the run aborts. */
  consecutive5xxAbort: number;
  /** If consecutive 4xx exceeds this number, the run aborts. */
  consecutive4xxAbort: number;
}

export const DEFAULT_OPTIONS: ScrapeOptions = {
  rateLimitMs: 2000,
  globalConcurrency: 8,
  userAgent:
    "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp; OSS travel data for AI agents)",
  timeoutMs: 30_000,
  retries: 2,
  // Raised from 35 to 100 in the multi-source sprint (ADR 0001). At 35 the
  // BFS only reached the first index layer of a typical tourism site and
  // never followed feature-page links into individual articles. Raised
  // again from 100 to 150 in Phase 1 (2026-05-01) — at 100 we still
  // truncate before reaching deeper feature pages on larger portals.
  maxPagesPerMunicipality: 150,
  consecutive5xxAbort: 100,
  consecutive4xxAbort: 200,
};

export interface FetchResult {
  url: string;
  finalUrl: string;
  status: number;
  contentType: string | null;
  body: string | null;
  fetched_at: string;
  error?: string;
}

export interface RobotsDecision {
  allowed: boolean;
  reason: string;
}

export type Lang = "ja" | "en" | "zh" | "ko" | "unknown";

export type CoordinatePrecision = "exact" | "address_geocoded" | "municipality_centroid";

export interface TouristSpotEvent {
  type: string;
  name: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  url: string | null;
}

export interface TouristSpotPlace {
  type: string;
  name: string | null;
  description: string | null;
  address: string | null;
  url: string | null;
  geo: { lat: number; lng: number } | null;
}

export interface TouristSpot {
  id: string;
  url: string;
  name: string;
  description: string | null;
  /**
   * First N substantive paragraphs of the article body, preserved when the
   * scrape reaches a feature/article page (added 2026-04-30, ADR 0001 / C1).
   * Empty array when the page is index/menu only.
   */
  body_paragraphs: string[];
  category: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  /** Provenance of the coordinates. "exact" = page-declared (og:geo or schema.org).
   *  "address_geocoded" = derived from address via 国土地理院.
   *  "municipality_centroid" = approximate, from municipality location. */
  coordinate_precision: CoordinatePrecision | null;
  images: string[];
  /**
   * Schema.org Event objects parsed from JSON-LD on this page (ADR 0001 / C2).
   * Useful for festivals / annual events with start/end dates.
   */
  schema_events: TouristSpotEvent[];
  /**
   * Schema.org Place / TouristAttraction / FoodEstablishment objects parsed
   * from JSON-LD on this page (ADR 0001 / C2). Useful for venue / food /
   * accommodation pages with structured address + geo.
   */
  schema_places: TouristSpotPlace[];
  source_url: string;
  language: Lang;
  last_scraped_at: string;
}

export interface MunicipalityInput {
  code: string;
  name: string;
  prefecture_code: string;
  prefecture_name: string;
  /** City-hall / primary administrative URL. Existing seed since v0.x. */
  official_url: string | null;
  /**
   * Additional crawl seeds — typically the municipality's tourism-association
   * site(s) plus the prefecture-level tourism portal it lives under.
   * Populated from data/_state/tourism_org_urls.json (ADR 0001 / workstream A).
   * Backwards-compatible: omitted = behaves as before.
   */
  tourism_org_urls?: string[];
}

/** Serialisable BFS state for one municipality's discovery crawl (see
 *  scrapers/lib/discover.ts). Persisted between runs so a crawl that ran out of
 *  window budget resumes from the frontier instead of restarting at the seed. */
export interface DiscoveryCheckpoint {
  visited: string[];
  frontier: { url: string; depth: number }[];
  pages: { url: string; title: string }[];
}

/** Full resumable state for one municipality across the discovery + extraction
 *  phases. Written to data/_state/crawl_checkpoints.json while a municipality
 *  is mid-crawl; removed once it is fully done. */
export interface MunicipalityCheckpoint {
  /** ISO timestamp when THIS crawl cycle first started (carried across resume
   *  windows). On completion the merge drops any spot whose last_scraped_at is
   *  older than this — i.e. pages that existed last cycle but were not
   *  re-found this cycle (deleted from the site) — so a finished crawl leaves a
   *  clean, current set without ever dropping coverage mid-crawl. */
  crawl_started_at: string;
  /** Discovery-phase BFS state. */
  discovery: DiscoveryCheckpoint;
  /** True once discovery drained its frontier (or hit the page cap). */
  discovery_complete: boolean;
  /** Tourism pages discovered so far (frozen once discovery_complete). */
  discovered_pages: { url: string; title: string }[];
  /** Canonical URLs already processed by extraction (whether they produced a
   *  spot or were filtered) — skipped on resume so extraction advances too. */
  extracted: string[];
  /** Discovery stopped at the page cap with a non-empty frontier (site > cap). */
  truncated_at_cap: boolean;
}

export interface MunicipalityScrapeResult {
  municipality: {
    code: string;
    name: string;
    prefecture_code: string;
    prefecture_name: string;
  };
  official_url: string | null;
  tourism_pages_found: number;
  pages_fetched: number;
  pages_failed: number;
  spots: TouristSpot[];
  multilingual: { en: number; zh: number; ko: number };
  errors: { url: string; reason: string }[];
  started_at: string;
  finished_at: string;
  data_as_of: string;
  // Resumable-crawl fields (set by scrapeOneMunicipality). Optional so other
  // constructors/tests need not provide them.
  /** True when discovery AND extraction both finished for this municipality. */
  complete?: boolean;
  /** Resume state to persist when `complete` is false; null when done. */
  checkpoint?: MunicipalityCheckpoint | null;
  /** Discovery hit the page cap with URLs still queued (site larger than cap). */
  truncated_at_cap?: boolean;
  /** Tourism pages discovered so far (for cap / progress reporting). */
  total_pages?: number;
  /** ISO start of this crawl cycle (see MunicipalityCheckpoint). Used by the
   *  daily merge to drop stale spots once the crawl completes. */
  crawl_started_at?: string;
}

export interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  data_as_of: string;
  source: string;
  disclaimer: string;
  municipalities: MunicipalityScrapeResult[];
}
