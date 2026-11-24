/**
 * Municipal page images (DATA_SOURCES.md #52): pick, for each spot the
 * municipal scrape holds, the one image of its own page that can stand for
 * the place.
 *
 * The scrape stores up to five image URLs per page: the page's `og:image`
 * first when it names one, then the first images of the page body. Most of
 * those are site furniture: the logo, navigation tiles, SNS buttons, a
 * 1x1 spacer, the site-wide share image. Three rules remove them:
 *
 *   1. `isPhotoCandidate`: no data URI, SVG / GIF / ICO / BMP, or path that
 *      names a logo, icon, banner, button, placeholder or site furniture.
 *   2. `isGovernmentDefaultImage`: no generic `ogp.png` of a city site, and
 *      `isNamedThumbnail`: no file whose name says it is a small copy.
 *   3. An image URL that appears on SHARED_IMAGE_MIN or more pages of the
 *      prefecture is the site's own furniture, not a picture of one place.
 *
 * The first image that survives, in stored order, is kept. Nothing is
 * downloaded, so width and height are unknown (null).
 */

import { MIN_IMAGE_WIDTH } from "../../src/lib/spot_images.js";
import { isGovernmentDefaultImage, isPhotoCandidate } from "./image_probe.js";

/** An image on this many pages of one prefecture is site furniture. */
export const SHARED_IMAGE_MIN = 3;

export interface MunicipalSpotInput {
  id?: string;
  url?: string;
  source_url?: string;
  images?: string[];
}

export interface MunicipalImageRecord {
  key: string;
  images: Array<{ url: string; source: "municipal_page"; page_url: string }>;
}

const THUMB_WORD_RE = /(^|[\/_.\-])(thumb|thumbs|thum|thumbnail|thumbnails)([\/_.\-\d]|$)/i;
const WP_SIZE_RE = /-(\d{2,4})x(\d{2,4})\.(jpe?g|png|webp)$/i;

/**
 * True when the file name itself says it is a small copy: a "thumb" path
 * word, or a WordPress size suffix narrower than MIN_IMAGE_WIDTH
 * (`photo-300x225.jpg`). Municipal images are not measured, so the name is
 * the only size signal.
 */
export function isNamedThumbnail(url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return true;
  }
  if (THUMB_WORD_RE.test(path)) return true;
  const m = WP_SIZE_RE.exec(path);
  return !!m && Number(m[1]) < MIN_IMAGE_WIDTH;
}

/** How many distinct pages each image URL appears on. */
export function imagePageCounts(spots: MunicipalSpotInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const s of spots) {
    for (const u of new Set(s.images ?? [])) counts.set(u, (counts.get(u) ?? 0) + 1);
  }
  return counts;
}

/** The image kept for one spot, or null. */
export function pickMunicipalImage(spot: MunicipalSpotInput, counts: Map<string, number>): string | null {
  const page = spot.source_url ?? spot.url;
  if (!page) return null;
  for (const u of spot.images ?? []) {
    if (!isPhotoCandidate(u)) continue;
    if (isNamedThumbnail(u)) continue;
    if (isGovernmentDefaultImage(u, page)) continue;
    if ((counts.get(u) ?? 0) >= SHARED_IMAGE_MIN) continue;
    return u;
  }
  return null;
}

/** Image records for every spot of one prefecture file, sorted by key. */
export function buildMunicipalImageRecords(spots: MunicipalSpotInput[]): MunicipalImageRecord[] {
  const counts = imagePageCounts(spots);
  const out = new Map<string, MunicipalImageRecord>();
  for (const s of spots) {
    if (!s.id || out.has(`spot:${s.id}`)) continue;
    const url = pickMunicipalImage(s, counts);
    if (!url) continue;
    out.set(`spot:${s.id}`, {
      key: `spot:${s.id}`,
      images: [{ url, source: "municipal_page", page_url: (s.source_url ?? s.url) as string }],
    });
  }
  return [...out.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
