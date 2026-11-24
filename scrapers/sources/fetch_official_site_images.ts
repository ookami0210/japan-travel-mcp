/**
 * Official-site images for Wikidata attractions (DATA_SOURCES.md #51).
 *
 * For each attraction whose Wikidata record names an official website
 * (P856, `official_url` in the attraction master), read that page once and
 * take the image the page names for itself (`og:image`, then
 * `twitter:image`). The image is tied to the spot by the URL the spot's own
 * record holds; nothing is searched for by name.
 *
 * Dropped:
 *   - pages on review sites, booking portals, social networks and map
 *     services, and URLs held by three or more entities (brand sites);
 *   - data URIs, SVG / GIF / ICO files, paths naming a logo, icon, banner or
 *     placeholder;
 *   - an image named by three or more entities' pages (a site-wide default);
 *   - an image that is not a JPEG / PNG / WebP, is narrower than 400 px, or
 *     is a strip (width over 4x the height, or height over 3x the width).
 *     Size is read from the first 64 KB of the file (ranged request).
 *
 * Politeness: robots.txt for the page and the image, 5 s between requests to
 * the same host (doubled on hosts the municipal crawl also reads), at most
 * CONCURRENCY hosts in flight, DEADLINE_MINUTES soft stop. An attraction
 * whose page could not be read this run keeps its previous image.
 *
 * Output: data/images/official_site_images.json ({ records: [{ qid, images }] }),
 * refused when it collapses against the file it would replace.
 *
 * Env: LIMIT=N (first N targets), CONCURRENCY=12, DEADLINE_MINUTES=240.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { buildCredit, MIN_IMAGE_WIDTH, type SpotImage } from "../../src/lib/spot_images.js";
import { sharedWithMunicipalCrawl } from "../lib/campground_pages.js";
import { ErrorCounter, rateLimitedFetch, waitForRateLimit } from "../lib/fetcher.js";
import { imageSize, pickPageImage } from "../lib/image_probe.js";
import { NOT_OFFICIAL_HOST_RE, SHARED_URL_MIN } from "../lib/official_hosts.js";
import { assertNotCollapsed, previousRecordCount } from "../lib/r3_write_guard.js";
import { shouldCrawl } from "../lib/robots.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const MASTER = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");
const OUT_FILE = resolve(REPO_ROOT, "data/images/official_site_images.json");

/** An image named by this many entities' pages is the site's default picture. */
export const SHARED_IMAGE_MIN = 3;
const PROBE_BYTES = 65_536;
const LIMIT = Number(process.env.LIMIT ?? "0");
const DEADLINE_MS = Date.now() + Number(process.env.DEADLINE_MINUTES ?? "240") * 60_000;

const OPTIONS: ScrapeOptions = {
  ...DEFAULT_OPTIONS,
  rateLimitMs: 5_000,
  globalConcurrency: Number(process.env.CONCURRENCY ?? "12") || 12,
  timeoutMs: 20_000,
  retries: 1,
  userAgent: "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; official-site images)",
};

function optionsFor(url: string): ScrapeOptions {
  return sharedWithMunicipalCrawl(url) ? { ...OPTIONS, rateLimitMs: OPTIONS.rateLimitMs * 2 } : OPTIONS;
}

export interface Target {
  qid: string;
  url: string;
}

export function normalizeOfficialUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/** One target per attraction, without non-official hosts and shared (brand) URLs. */
export function selectTargets(attractions: Array<{ qid?: string; official_url?: unknown }>): Target[] {
  const raw: Target[] = [];
  const seen = new Set<string>();
  for (const a of attractions) {
    const url = normalizeOfficialUrl(a.official_url);
    if (!a.qid || !url || seen.has(a.qid)) continue;
    seen.add(a.qid);
    raw.push({ qid: a.qid, url });
  }
  const key = (u: string) => u.replace(/\/+$/, "").toLowerCase();
  const byUrl = new Map<string, number>();
  for (const t of raw) byUrl.set(key(t.url), (byUrl.get(key(t.url)) ?? 0) + 1);
  return raw.filter((t) => {
    let host = "";
    try {
      host = new URL(t.url).hostname.replace(/^www\./, "");
    } catch {
      return false;
    }
    if (NOT_OFFICIAL_HOST_RE.test(host)) return false;
    return (byUrl.get(key(t.url)) ?? 0) < SHARED_URL_MIN;
  });
}

/** Image URLs named by SHARED_IMAGE_MIN or more entities. */
export function sharedImages(found: Array<{ image: string }>): Set<string> {
  const count = new Map<string, number>();
  for (const f of found) count.set(f.image, (count.get(f.image) ?? 0) + 1);
  return new Set([...count].filter(([, n]) => n >= SHARED_IMAGE_MIN).map(([u]) => u));
}

/** A photo-shaped size: wide enough, and not a strip. */
export function isPhotoSize(width: number, height: number): boolean {
  if (width < MIN_IMAGE_WIDTH || height <= 0) return false;
  return width <= height * 4 && height <= width * 3;
}

/** Read up to PROBE_BYTES of an image, politely, and return its size. */
async function probeImage(url: string): Promise<{ width: number; height: number } | null> {
  const opts = optionsFor(url);
  if (!(await shouldCrawl(url, opts)).allowed) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  await waitForRateLimit(host, opts.rateLimitMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": opts.userAgent, Range: `bytes=0-${PROBE_BYTES - 1}`, Accept: "image/*" },
    });
    if (!res.ok || !/^image\//i.test(res.headers.get("content-type") ?? "") || !res.body) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < PROBE_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => undefined);
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      buf.set(c, off);
      off += c.length;
    }
    const size = imageSize(buf);
    return size ? { width: size.width, height: size.height } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

type PageOutcome = { kind: "image"; image: string; page: string } | { kind: "none" } | { kind: "unread" };

async function readPage(t: Target, counter: ErrorCounter): Promise<PageOutcome> {
  if (Date.now() > DEADLINE_MS) return { kind: "unread" };
  const opts = optionsFor(t.url);
  if (!(await shouldCrawl(t.url, opts)).allowed) return { kind: "none" };
  const res = await rateLimitedFetch(t.url, opts, counter);
  if (!res.body || res.status >= 400 || res.status === 0) {
    // A 4xx page is gone; a network error or 5xx may be temporary.
    return res.status >= 400 && res.status < 500 ? { kind: "none" } : { kind: "unread" };
  }
  const page = res.finalUrl ?? t.url;
  const image = pickPageImage(res.body, page);
  return image ? { kind: "image", image, page } : { kind: "none" };
}

async function loadPrevious(): Promise<Map<string, SpotImage[]>> {
  const out = new Map<string, SpotImage[]>();
  if (!existsSync(OUT_FILE)) return out;
  try {
    const json = JSON.parse(await readFile(OUT_FILE, "utf8")) as { records?: Array<{ qid: string; images: SpotImage[] }> };
    for (const r of json.records ?? []) out.set(r.qid, r.images);
  } catch {
    // unreadable: treated as absent
  }
  return out;
}

async function main(): Promise<void> {
  const master = JSON.parse(await readFile(MASTER, "utf8")) as {
    attractions?: Array<{ qid?: string; official_url?: unknown }>;
  };
  let targets = selectTargets(master.attractions ?? []);
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  const previous = await loadPrevious();
  console.log(`[official_images] ${targets.length} official pages to read; previous file has ${previous.size}`);

  const counter = new ErrorCounter();
  const limiter = pLimit(OPTIONS.globalConcurrency);
  const found: Array<{ qid: string; image: string; page: string }> = [];
  const unread: string[] = [];
  let done = 0;
  await Promise.all(
    targets.map((t) =>
      limiter(async () => {
        try {
          const r = await readPage(t, counter);
          if (r.kind === "image") found.push({ qid: t.qid, image: r.image, page: r.page });
          else if (r.kind === "unread") unread.push(t.qid);
        } catch {
          unread.push(t.qid);
        }
        done += 1;
        if (done % 500 === 0) console.log(`  pages ${done}/${targets.length} (${found.length} name an image)`);
      }),
    ),
  );

  const shared = sharedImages(found);
  const candidates = found.filter((f) => !shared.has(f.image));
  console.log(`[official_images] ${found.length} pages name an image; ${shared.size} site-wide images dropped; probing ${candidates.length}`);

  const sizes = new Map<string, { width: number; height: number } | null>();
  const distinct = [...new Set(candidates.map((c) => c.image))];
  let probed = 0;
  await Promise.all(
    distinct.map((u) =>
      limiter(async () => {
        sizes.set(u, Date.now() > DEADLINE_MS ? null : await probeImage(u));
        probed += 1;
        if (probed % 500 === 0) console.log(`  images ${probed}/${distinct.length}`);
      }),
    ),
  );

  const records = new Map<string, SpotImage[]>();
  for (const c of candidates) {
    const size = sizes.get(c.image);
    if (!size || !isPhotoSize(size.width, size.height)) continue;
    const img: SpotImage = {
      url: c.image,
      width: size.width,
      height: size.height,
      source: "official_site",
      page_url: c.page,
      license: null,
      license_url: null,
      author: null,
      attribution_required: null,
      credit: "",
    };
    img.credit = buildCredit(img);
    records.set(c.qid, [img]);
  }
  // A page we could not read this run keeps what it had.
  let carried = 0;
  for (const qid of unread) {
    const prev = previous.get(qid);
    if (prev && !records.has(qid)) {
      records.set(qid, prev);
      carried += 1;
    }
  }
  console.log(
    `[official_images] ${records.size} attractions with an official-site image` +
      ` (${carried} carried over from unread pages; ${unread.length} pages unread)`,
  );

  if (LIMIT === 0) {
    const prevCount = await previousRecordCount("official_site_images", OUT_FILE);
    assertNotCollapsed("official_site_images", prevCount, records.size);
  }
  const out = {
    source: "og:image / twitter:image of each attraction's official website (Wikidata P856)",
    fetched_at: new Date().toISOString(),
    fetcher_version: "v1",
    pages_targeted: targets.length,
    pages_unread: unread.length,
    records: [...records].sort(([a], [b]) => a.localeCompare(b)).map(([qid, images]) => ({ qid, images })),
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const tmp = `${OUT_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(out));
  await rename(tmp, OUT_FILE);
  console.log(`[official_images] wrote ${OUT_FILE}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
