/**
 * Official-page text for accommodations — server-side loading and shaping.
 *
 * Data: `campgrounds/official_pages.jsonl`, written by
 * `scrapers/sources/scrape_campground_sites.ts` (DATA_SOURCES.md #45). One
 * line per campground: the operator's own page plus the handful of pages that
 * carry season, pitch prices, facilities, access and rules, stored verbatim
 * with a sha256 per page.
 *
 * WHY the server surfaces it: for a campground this text is usually the only
 * public answer to the questions a guest actually asks, and an agent that can
 * only see a name, a point on the map and a URL has to send the traveller off
 * to read the site themselves. The dataset already carries the answer.
 *
 * Two shapes, deliberately. Metadata (which pages exist, when they were read,
 * what each one's hash is) is small enough to ride along with every result, so
 * an agent can see that an answer exists and cite the page it came from. The
 * text itself is only attached when asked for, and then under a budget: eight
 * pages of a few thousand characters each, times a page of results, would bury
 * everything else in the response.
 *
 * The layer is optional. A dataset without the file is a coverage gap, not an
 * error: every accommodation simply reports no official-page text.
 */

import { readFile } from "node:fs/promises";

export interface OfficialPage {
  url: string;
  final_url: string;
  title: string;
  http_status: number;
  content_sha256: string;
  chars: number;
  charset: string | null;
  text: string;
  fetched_at: string;
}

export interface OfficialPageRecord {
  id: string;
  name: string | null;
  prefecture_code: string | null;
  homepage: string;
  pages: OfficialPage[];
  pages_attempted: number;
  pages_failed: number;
  crawled_at: string;
  pages_fetched_at: string;
  note?: string;
}

/** What rides along with every accommodation that has stored pages. */
export interface OfficialPageMeta {
  homepage: string;
  /** When the site was last visited. */
  crawled_at: string;
  /** When the stored text was fetched — older than `crawled_at` if the last visit failed. */
  pages_fetched_at: string;
  page_count: number;
  pages: { url: string; title: string; chars: number; content_sha256: string }[];
  /** Present when the last visit produced nothing usable. */
  note?: string;
  source_note: string;
}

const SOURCE_NOTE =
  "Text as published by the operator on its own site, stored as a dated snapshot with the source URL. " +
  "Rights remain with the operator; quote with attribution and treat pages_fetched_at as the as-of date. " +
  "Prices and season change — verify against the page before booking.";

/** Characters of page text one response may carry in total. */
export const RESPONSE_TEXT_BUDGET = 60_000;
/** Characters of page text one page may carry. */
export const PAGE_TEXT_LIMIT = 6_000;

let cache: Map<string, OfficialPageRecord> | null = null;
let cachedPath: string | null = null;

/**
 * Read and index the corpus by accommodation id. Parsed once per process;
 * a malformed line is skipped rather than failing the layer, because one bad
 * row must not cost every other campground its page text.
 */
export async function loadOfficialPages(
  path: string,
): Promise<Map<string, OfficialPageRecord>> {
  if (cache && cachedPath === path) return cache;
  const index = new Map<string, OfficialPageRecord>();
  try {
    const raw = await readFile(path, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed) as OfficialPageRecord;
        if (typeof rec.id === "string" && rec.id && Array.isArray(rec.pages)) {
          index.set(rec.id, rec);
        }
      } catch {
        // skip the line, keep the layer
      }
    }
  } catch {
    // absent layer is a coverage gap, not an error
  }
  cache = index;
  cachedPath = path;
  return index;
}

/** Testing seam: drop the parsed corpus so the next load re-reads it. */
export function resetOfficialPagesCache(): void {
  cache = null;
  cachedPath = null;
}

/** Page list, dates and hashes — no text. */
export function officialPageMeta(rec: OfficialPageRecord): OfficialPageMeta {
  return {
    homepage: rec.homepage,
    crawled_at: rec.crawled_at,
    pages_fetched_at: rec.pages_fetched_at ?? rec.crawled_at,
    page_count: rec.pages.length,
    pages: rec.pages.map((p) => ({
      url: p.final_url || p.url,
      title: p.title,
      chars: p.chars,
      content_sha256: p.content_sha256,
    })),
    ...(rec.note ? { note: rec.note } : {}),
    source_note: SOURCE_NOTE,
  };
}

/**
 * Spends from a shared character budget so one response cannot be swamped.
 * Pages are attached in stored order — homepage first, then the pages that
 * promised prices and facilities — and what the budget cannot cover is
 * reported as omitted rather than silently dropped.
 */
export class TextBudget {
  private left: number;

  constructor(total: number = RESPONSE_TEXT_BUDGET) {
    this.left = total;
  }

  attach(rec: OfficialPageRecord): OfficialPageMeta & {
    pages: (OfficialPageMeta["pages"][number] & {
      text?: string;
      text_truncated?: boolean;
      text_omitted?: string;
    })[];
  } {
    const meta = officialPageMeta(rec);
    const pages = meta.pages.map((p, i) => {
      const source = rec.pages[i];
      if (!source) return p;
      if (this.left <= 0) {
        return { ...p, text_omitted: "response text budget spent" };
      }
      const room = Math.min(PAGE_TEXT_LIMIT, this.left);
      const text = source.text.slice(0, room);
      this.left -= text.length;
      return {
        ...p,
        text,
        ...(text.length < source.text.length ? { text_truncated: true } : {}),
      };
    });
    return { ...meta, pages };
  }
}
