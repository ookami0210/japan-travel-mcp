/**
 * Where to look for a campground that has no readable page of its own.
 *
 * WHY: 1,877 of the 2,163 campgrounds in the lodging layer carry no website at
 * all, and a few hundred more carry one that no longer answers. For those, the
 * honest answer to "tell me about this campground" is not an empty record — it
 * is the place a traveller can actually look. Most of them are listed on a
 * booking directory, and the directory's own sitemap publishes a page per
 * prefecture.
 *
 * What this does NOT do, deliberately: it does not crawl the directory, store
 * its text, or claim that a given campground is listed there. Those pages carry
 * the directory's own pricing, availability and user reviews, which
 * DATA_POLICY.md keeps out of this dataset, and their terms — not ours — govern
 * that content. So the pointer is computed from facts we already hold (the
 * prefecture and the facility name) plus a URL shape the directory publishes
 * for crawlers, and it is labelled unverified, because we have not looked.
 *
 * The result is a hint, in the same spirit as the curated `resources` blocks
 * get_hotels already returns — a signpost, not a record.
 */

import { PREFECTURE_SLUGS } from "./hf_data.js";

/**
 * Directories whose prefecture pages we are willing to point at. Keyed by
 * host so a record whose own `website` is already one of these can be
 * recognised as "listed, not official" rather than treated as a dead end.
 */
const DIRECTORY = {
  host: "nap-camp.com",
  name_ja: "なっぷ",
  name_en: "Nap-Camp (campsite booking directory)",
  /** Published in their sitemap as one page per prefecture slug. */
  prefecturePath: (slug: string) => `https://www.nap-camp.com/${slug}/list`,
} as const;

export interface ListingPointer {
  /** The directory being pointed at, by host — never a deep link we have not seen. */
  directory_host: string;
  directory_name_ja: string;
  directory_name_en: string;
  /** The directory's own page for this prefecture. */
  directory_prefecture_url: string;
  /** The name to look for on that page; what we hold, not what they call it. */
  search_for: string | null;
  /**
   * False, always, and stated rather than implied: we do not read the
   * directory, so we do not know whether this campground is listed.
   */
  listing_verified: false;
  note: string;
}

const NOTE =
  "No official page of this campground's own could be read, so this points at a booking directory's " +
  "prefecture page where it may be listed. We do not crawl that directory and hold none of its content: " +
  "whether this campground appears there, and anything it says about prices, availability or reviews, " +
  "is for the reader to check on the page.";

/** The directory's prefecture page for a 2-digit JIS code, if we can name it. */
export function directoryUrlForPrefecture(prefectureCode: string | null): string | null {
  if (!prefectureCode) return null;
  const index = Number(prefectureCode) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= PREFECTURE_SLUGS.length) return null;
  return DIRECTORY.prefecturePath(PREFECTURE_SLUGS[index]);
}

/**
 * Build the pointer for one accommodation, or null when we cannot say anything
 * useful — no prefecture to point at, or nothing to search for.
 */
export function listingPointer(input: {
  prefecture_code: string | null;
  name: string | null;
  name_en: string | null;
}): ListingPointer | null {
  const url = directoryUrlForPrefecture(input.prefecture_code);
  if (!url) return null;
  const searchFor = input.name ?? input.name_en ?? null;
  if (!searchFor) return null;
  return {
    directory_host: DIRECTORY.host,
    directory_name_ja: DIRECTORY.name_ja,
    directory_name_en: DIRECTORY.name_en,
    directory_prefecture_url: url,
    search_for: searchFor,
    listing_verified: false,
    note: NOTE,
  };
}

/** True when this URL is the directory itself rather than an operator's site. */
export function isDirectoryUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host === DIRECTORY.host || host.endsWith(`.${DIRECTORY.host}`);
  } catch {
    return false;
  }
}
