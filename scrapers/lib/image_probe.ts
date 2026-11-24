/**
 * Image checks for pages we read ourselves (official sites, municipal pages).
 *
 * `pickPageImage` chooses the image a page itself names as its picture
 * (`og:image`, then `twitter:image`) and drops what is plainly not a photo
 * of the place: data URIs, SVG / GIF / ICO files, and paths that name a
 * logo, icon, banner or placeholder.
 *
 * `imageSize` reads the width and height from the first bytes of a JPEG,
 * PNG or WebP file, so an image can be measured from a ranged request
 * without downloading it.
 */

import * as cheerio from "cheerio";

/** Path words that mark site furniture rather than a photo of the place. */
export const NON_PHOTO_PATH_RE =
  /(^|[\/_.\-])(logo|logos|icon|icons|ico|favicon|banner|banners|bnr|btn|button|sns|share|spacer|blank|dummy|noimage|no[_-]image|nophoto|no[_-]photo|placeholder|loading|arrow|header|footer|gnav|nav|common)([\/_.\-\d]|$)/i;

const BAD_EXT_RE = /\.(svg|svgz|gif|ico|bmp)(\?|#|$)/i;

/** True when a URL can be a photo: http(s), not a data URI, not an icon-like file or path. */
export function isPhotoCandidate(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(u.protocol)) return false;
  if (BAD_EXT_RE.test(u.pathname)) return false;
  return !NON_PHOTO_PATH_RE.test(u.pathname);
}

const GENERIC_IMAGE_NAME_RE = /^(ogp|og|og[-_]?image|ogimage|share|default|thumbnail(-large)?|top|main|site)\.(png|jpe?g|webp)$/i;
const GOVERNMENT_HOST_RE = /(\.lg\.jp|\.go\.jp)$|^(www\.)?(city|town|vill|pref)\./i;

/**
 * True for a government site's generic share image (`/images/ogp.png` on a
 * city site): it stands for the city, not for the museum or park page that
 * names it.
 */
export function isGovernmentDefaultImage(imageUrl: string, pageUrl: string): boolean {
  try {
    const name = new URL(imageUrl).pathname.split("/").pop() ?? "";
    const host = new URL(pageUrl).hostname;
    return GENERIC_IMAGE_NAME_RE.test(name) && GOVERNMENT_HOST_RE.test(host);
  } catch {
    return false;
  }
}

/** The image a page names for itself, resolved against the page URL, or null. */
export function pickPageImage(html: string, pageUrl: string): string | null {
  const $ = cheerio.load(html);
  const candidates = [
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[property="twitter:image"]').attr("content"),
  ];
  for (const raw of candidates) {
    const v = raw?.trim();
    if (!v) continue;
    let abs: string;
    try {
      abs = new URL(v, pageUrl).toString();
    } catch {
      continue;
    }
    if (isPhotoCandidate(abs) && !isGovernmentDefaultImage(abs, pageUrl)) return abs;
  }
  return null;
}

export interface ImageSize {
  width: number;
  height: number;
  format: "jpeg" | "png" | "webp";
}

/** Width and height from the first bytes of a JPEG, PNG or WebP file; null when not readable. */
export function imageSize(buf: Uint8Array): ImageSize | null {
  if (buf.length < 24) return null;
  // PNG: signature, then the IHDR chunk with width and height.
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20), format: "png" };
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i += 1;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xff) {
        i += marker === 0xff ? 1 : 2;
        continue;
      }
      const len = (buf[i + 2] << 8) | buf[i + 3];
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) {
        const height = (buf[i + 5] << 8) | buf[i + 6];
        const width = (buf[i + 7] << 8) | buf[i + 8];
        return width > 0 && height > 0 ? { width, height, format: "jpeg" } : null;
      }
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  // WebP: RIFF container with a VP8, VP8L or VP8X chunk.
  const ascii = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP" && buf.length >= 30) {
    const chunk = ascii(12, 16);
    if (chunk === "VP8 ") {
      const width = ((buf[27] << 8) | buf[26]) & 0x3fff;
      const height = ((buf[29] << 8) | buf[28]) & 0x3fff;
      return { width, height, format: "webp" };
    }
    if (chunk === "VP8L") {
      const b = buf.subarray(21, 25);
      const width = 1 + (((b[1] & 0x3f) << 8) | b[0]);
      const height = 1 + (((b[3] & 0x0f) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
      return { width, height, format: "webp" };
    }
    if (chunk === "VP8X") {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { width, height, format: "webp" };
    }
  }
  return null;
}
