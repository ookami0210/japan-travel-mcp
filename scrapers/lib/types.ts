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
    "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp; OSS travel data for AI agents)",
  timeoutMs: 30_000,
  retries: 2,
  maxPagesPerMunicipality: 25,
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

export interface TouristSpot {
  id: string;
  url: string;
  name: string;
  description: string | null;
  category: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  images: string[];
  source_url: string;
  language: Lang;
  last_scraped_at: string;
}

export interface MunicipalityInput {
  code: string;
  name: string;
  prefecture_code: string;
  prefecture_name: string;
  official_url: string | null;
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
}

export interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  data_as_of: string;
  source: string;
  disclaimer: string;
  municipalities: MunicipalityScrapeResult[];
}
