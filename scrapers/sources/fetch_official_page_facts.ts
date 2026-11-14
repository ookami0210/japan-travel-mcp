/**
 * Read each entity's own official page once and write the facts it states:
 * opening hours, closed days, admission or room price, check-in and
 * check-out. Deterministic readers only (Schema.org JSON-LD, then Japanese
 * text rules); pages neither reader can parse are queued, with a bounded
 * snippet, for a separate local-model pass.
 *
 * Targets, one page per entity, from the URL the entity's own record holds:
 *   attraction  data/prefectures/<slug>.json  wikidata_attractions[].official_url
 *   hotel       data/hotels/master.json       website
 *   food        data/food/<slug>.json         entries[].official_url
 *
 * Politeness: robots.txt per URL, 5 s between requests to the same domain
 * (doubled on hosts the municipal crawl also reads), a small global
 * concurrency, one page per entity, no link following.
 *
 * Output:
 *   data/facts/official_page_facts.jsonl           one line per entity, keyed by id
 *   data/_state/official_page_facts_llm_queue.jsonl  snippets for the model pass (local only)
 *   data/_logs/official_page_facts_<ts>.json        run summary
 *
 * Env:
 *   LAYERS=attraction,hotel,food   layers to read (default all)
 *   SAMPLE=200                     seeded random sample across layers (canary)
 *   SEED=1                         sample seed
 *   LIMIT=N                        stop after N targets (after sampling)
 *   ONLY=<id>                      one entity
 *   FORCE=1                        re-read entities already in the output
 *   RECHECK_DAYS=30                refresh window for entities already read
 *   DEADLINE_MINUTES=N             stop launching new fetches after N minutes
 *   CONCURRENCY=12                 distinct domains in flight
 *
 * Run:
 *   SAMPLE=200 npx tsx scrapers/sources/fetch_official_page_facts.ts
 *   npx tsx scrapers/sources/fetch_official_page_facts.ts
 */

import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";
import { sharedWithMunicipalCrawl } from "../lib/campground_pages.js";
import { ErrorCounter, rateLimitedFetch } from "../lib/fetcher.js";
import { readOfficialPage, type FactsLayer, type OfficialPageFacts } from "../lib/official_page_facts.js";
import { pageText } from "../lib/page_text.js";
import { shouldCrawl } from "../lib/robots.js";
import { notify } from "../lib/slack.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../lib/types.js";

const ROOT = new URL("../../", import.meta.url);
const PREF_DIR = new URL("data/prefectures/", ROOT);
const FOOD_DIR = new URL("data/food/", ROOT);
const HOTELS_URL = new URL("data/hotels/master.json", ROOT);
const OUT_URL = new URL("data/facts/official_page_facts.jsonl", ROOT);
const QUEUE_URL = new URL("data/_state/official_page_facts_llm_queue.jsonl", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

const MAX_TEXT_CHARS = 60_000;
const CHECKPOINT_EVERY = 100;
/** A URL held by this many entities or more is a brand site, not a venue page. */
const SHARED_URL_MIN = 3;
/** Info pages followed from the official URL when it states no facts. */
const MAX_FOLLOW = 2;

/**
 * Hosts that are not the venue's own page: review sites, booking portals,
 * social networks, map services. The data policy keeps them out even when
 * a record's website tag points there.
 */
const NOT_OFFICIAL_HOST_RE =
  /(^|\.)(tabelog\.com|retty\.me|gnavi\.co\.jp|hotpepper\.jp|ikyu\.com|jalan\.net|rakuten\.co\.jp|rakuten\.com|booking\.com|expedia\.(com|co\.jp)|agoda\.com|hotels\.com|tripadvisor\.(com|jp)|trip\.com|airbnb\.(com|jp)|google\.(com|co\.jp)|goo\.gl|instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|yelp\.(com|co\.jp)|foursquare\.com|hitosara\.com|ozmall\.co\.jp|tablecheck\.com|toreta\.in|ebica\.jp|omakase\.in|autoreserve\.com|ameblo\.jp|note\.com|wikipedia\.org|wikidata\.org|yahoo\.co\.jp|line\.me|lin\.ee)$/i;

/** Anchor text of the one or two pages that carry hours and prices. */
const INFO_LINK_RE =
  /営業時間|営業案内|営業日|店舗情報|店舗案内|店舗詳細|ご利用案内|利用案内|施設案内|施設情報|ご案内|基本情報|拝観案内|拝観時間|開館時間|開園時間|入館料|入場料|拝観料|料金|アクセス|ACCESS|Access|INFORMATION|Information|About|ABOUT|概要|会社概要|SHOP|Shop|店舗一覧|館内案内/;

const OPTIONS: ScrapeOptions = {
  ...DEFAULT_OPTIONS,
  rateLimitMs: 5_000,
  globalConcurrency: Number(process.env.CONCURRENCY ?? "12") || 12,
  timeoutMs: 20_000,
  retries: 1,
  userAgent:
    "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; official-page facts)",
};

interface Target {
  id: string;
  layer: FactsLayer;
  url: string;
}

function normalizeUrl(raw: unknown): string | null {
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

async function loadTargets(layers: Set<FactsLayer>): Promise<Target[]> {
  const out: Target[] = [];
  if (layers.has("attraction")) {
    const names = (await readdir(fileURLToPath(PREF_DIR))).filter((n) => n.endsWith(".json")).sort();
    for (const n of names) {
      const pref = JSON.parse(await readFile(fileURLToPath(new URL(n, PREF_DIR)), "utf8")) as {
        wikidata_attractions?: Array<{ qid?: string; official_url?: unknown }>;
      };
      for (const a of pref.wikidata_attractions ?? []) {
        const url = normalizeUrl(a.official_url);
        if (a.qid && url) out.push({ id: `wd:${a.qid}`, layer: "attraction", url });
      }
    }
  }
  if (layers.has("hotel")) {
    const master = JSON.parse(await readFile(fileURLToPath(HOTELS_URL), "utf8")) as
      | Array<{ id: string; website?: unknown }>
      | { hotels?: Array<{ id: string; website?: unknown }> };
    const recs = Array.isArray(master) ? master : (master.hotels ?? []);
    for (const h of recs) {
      const url = normalizeUrl(h.website);
      if (h.id && url) out.push({ id: `hotel:${h.id}`, layer: "hotel", url });
    }
  }
  if (layers.has("food")) {
    const names = (await readdir(fileURLToPath(FOOD_DIR))).filter((n) => n.endsWith(".json")).sort();
    for (const n of names) {
      const file = JSON.parse(await readFile(fileURLToPath(new URL(n, FOOD_DIR)), "utf8")) as {
        entries?: Array<{ id: string; official_url?: unknown }>;
      };
      for (const e of file.entries ?? []) {
        const url = normalizeUrl(e.official_url);
        if (e.id && url) out.push({ id: e.id, layer: "food", url });
      }
    }
  }
  // One entity per id; the first occurrence wins.
  const seen = new Set<string>();
  return out.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

type SkipReason = "not_official_host" | "shared_url";

/** Targets the pass should not read, with the reason, keyed by id. */
function skipReasons(targets: Target[]): Map<string, SkipReason> {
  const byUrl = new Map<string, number>();
  for (const t of targets) {
    const key = t.url.replace(/\/+$/, "").toLowerCase();
    byUrl.set(key, (byUrl.get(key) ?? 0) + 1);
  }
  const out = new Map<string, SkipReason>();
  for (const t of targets) {
    let host = "";
    try {
      host = new URL(t.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (NOT_OFFICIAL_HOST_RE.test(host)) out.set(t.id, "not_official_host");
    else if ((byUrl.get(t.url.replace(/\/+$/, "").toLowerCase()) ?? 0) >= SHARED_URL_MIN) out.set(t.id, "shared_url");
  }
  return out;
}

/** Same-host links whose anchor text promises hours or prices, in page order. */
function infoLinks(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return out;
  }
  const re = /<a\s[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < 8) {
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    let hrefText = m[1];
    try {
      hrefText = decodeURIComponent(m[1]);
    } catch {
      // a malformed percent-escape is still a usable href
    }
    if (!INFO_LINK_RE.test(text) && !/(access|info|guide|shop|about|hours|price|annai|ryokin|eigyo)/i.test(hrefText)) continue;
    let u: URL;
    try {
      u = new URL(m[1], base);
    } catch {
      continue;
    }
    if (u.hostname !== base.hostname) continue;
    if (!/^https?:$/.test(u.protocol)) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|zip|doc|xls)$/i.test(u.pathname)) continue;
    u.hash = "";
    const key = u.toString();
    if (key === base.toString() || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Deterministic shuffle so a canary sample can be re-run. */
function seededSample<T>(xs: T[], n: number, seed: number): T[] {
  let s = seed >>> 0 || 1;
  const rnd = (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  const arr = xs.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, n);
}

async function loadExisting(): Promise<Map<string, OfficialPageFacts>> {
  const map = new Map<string, OfficialPageFacts>();
  const path = fileURLToPath(OUT_URL);
  if (!existsSync(path)) return map;
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as OfficialPageFacts;
      if (rec.id) map.set(rec.id, rec);
    } catch {
      // A torn line from an interrupted write is dropped, not propagated.
    }
  }
  return map;
}

async function writeJsonl(url: URL, lines: string[]): Promise<void> {
  const path = fileURLToPath(url);
  await mkdir(fileURLToPath(new URL("./", url)), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
  await rename(tmp, path);
}

function optionsFor(url: string): ScrapeOptions {
  return sharedWithMunicipalCrawl(url) ? { ...OPTIONS, rateLimitMs: OPTIONS.rateLimitMs * 2 } : OPTIONS;
}

async function main(): Promise<void> {
  const layers = new Set<FactsLayer>(
    (process.env.LAYERS ?? "attraction,hotel,food")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is FactsLayer => s === "attraction" || s === "hotel" || s === "food"),
  );
  const sample = process.env.SAMPLE ? Number(process.env.SAMPLE) : 0;
  const seed = Number(process.env.SEED ?? "1") || 1;
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
  const only = process.env.ONLY ?? null;
  const force = process.env.FORCE === "1";
  const recheckDays = Number(process.env.RECHECK_DAYS ?? "30") || 30;
  const deadlineMs = process.env.DEADLINE_MINUTES
    ? Date.now() + Number(process.env.DEADLINE_MINUTES) * 60_000
    : Infinity;

  const all = await loadTargets(layers);
  const existing = await loadExisting();
  const byLayer = (xs: Target[]): string =>
    (["attraction", "hotel", "food"] as FactsLayer[])
      .map((l) => `${l}=${xs.filter((t) => t.layer === l).length}`)
      .join(" ");
  console.error(`[facts] targets with a URL: ${all.length} (${byLayer(all)}); already read: ${existing.size}`);

  const skips = skipReasons(all);
  console.error(
    `[facts] skipped by policy: not_official_host=${[...skips.values()].filter((r) => r === "not_official_host").length} shared_url=${[...skips.values()].filter((r) => r === "shared_url").length}`,
  );
  let targets = all.filter((t) => !skips.has(t.id));
  if (only) targets = all.filter((t) => t.id === only);
  if (sample > 0) targets = seededSample(targets, sample, seed);
  if (!force) {
    const cutoff = Date.now() - recheckDays * 86_400_000;
    targets = targets.filter((t) => {
      const prev = existing.get(t.id);
      return !prev || Date.parse(prev.fetched_at) < cutoff;
    });
  }
  if (Number.isFinite(limit)) targets = targets.slice(0, limit);
  console.error(`[facts] to read now: ${targets.length} (${byLayer(targets)})`);

  const counter = new ErrorCounter(OPTIONS);
  const limiter = pLimit(OPTIONS.globalConcurrency);
  const queue: string[] = [];
  let done = 0;
  let skippedRobots = 0;
  let skippedDeadline = 0;
  let fetchFailed = 0;
  let writing: Promise<void> = Promise.resolve();

  // A checkpoint merges with what is on disk, newest fetch per id, so two
  // passes over different layers (or a canary beside a full run) never
  // overwrite each other's records.
  const checkpoint = (): Promise<void> => {
    writing = writing.then(async () => {
      const onDisk = await loadExisting();
      for (const [id, rec] of onDisk) {
        const mine = existing.get(id);
        if (!mine || Date.parse(rec.fetched_at) > Date.parse(mine.fetched_at)) existing.set(id, rec);
      }
      await writeJsonl(
        OUT_URL,
        [...existing.values()].map((r) => JSON.stringify(r)),
      );
    });
    return writing;
  };

  let entityErrors = 0;
  const one = async (t: Target): Promise<void> => {
    try {
      await oneUnsafe(t);
    } catch (err) {
      // One entity's page must not stop the pass; the id stays unread and
      // is picked up by the next run.
      entityErrors += 1;
      if (entityErrors <= 20) console.error(`[facts] ${t.id} failed: ${(err as Error).message}`);
    }
  };

  const oneUnsafe = async (t: Target): Promise<void> => {
    if (Date.now() > deadlineMs) {
      skippedDeadline += 1;
      return;
    }
    const opts = optionsFor(t.url);
    const allowed = await shouldCrawl(t.url, opts);
    if (!allowed.allowed) {
      skippedRobots += 1;
      return;
    }
    const res = await rateLimitedFetch(t.url, opts, counter);
    const ok = !!res.body && res.status < 400 && (!res.contentType || /html|xml|text/i.test(res.contentType));
    if (!ok) fetchFailed += 1;
    const html = ok ? res.body : null;
    const text = html ? pageText(html).slice(0, MAX_TEXT_CHARS) : null;
    const pagesRead = [t.url];
    let { record, snippet } = readOfficialPage({
      id: t.id,
      layer: t.layer,
      url: t.url,
      final_url: res.finalUrl ?? null,
      fetched_at: res.fetched_at,
      http_status: res.status,
      html,
      text,
      pages_read: pagesRead,
    });
    // The official URL is often a homepage; the hours sit one click away on
    // 店舗情報 / ご利用案内 / アクセス. Follow at most two such links, same
    // host only, and stop as soon as a page states the facts.
    if (html && record.needs_llm && !record.hours_ambiguous) {
      for (const link of infoLinks(html, res.finalUrl ?? t.url).slice(0, MAX_FOLLOW)) {
        if (Date.now() > deadlineMs) break;
        const linkAllowed = await shouldCrawl(link, opts);
        if (!linkAllowed.allowed) continue;
        const sub = await rateLimitedFetch(link, opts, counter);
        const subOk = !!sub.body && sub.status < 400 && (!sub.contentType || /html|xml|text/i.test(sub.contentType));
        if (!subOk) continue;
        pagesRead.push(link);
        const subText = pageText(sub.body as string).slice(0, MAX_TEXT_CHARS);
        const next = readOfficialPage({
          id: t.id,
          layer: t.layer,
          url: t.url,
          final_url: sub.finalUrl ?? link,
          fetched_at: sub.fetched_at,
          http_status: sub.status,
          html: sub.body,
          text: subText,
          pages_read: pagesRead,
        });
        const better =
          (next.record.opening_hours && !record.opening_hours) ||
          (next.record.lodging && !record.lodging) ||
          (next.record.price && !record.price) ||
          (next.record.hours_ambiguous && !record.hours_ambiguous);
        if (better) {
          // Keep what the homepage already stated where the info page is silent.
          next.record.price = next.record.price ?? record.price;
          next.record.price_evidence = next.record.price ? next.record.price_evidence : record.price_evidence;
          next.record.lodging = next.record.lodging ?? record.lodging;
          next.record.closure_notice = next.record.closure_notice ?? record.closure_notice;
          next.record.http_status = res.status;
          next.record.text_chars = (text?.length ?? 0) + subText.length;
          record = next.record;
          snippet = next.snippet;
        }
        if (!record.needs_llm || record.hours_ambiguous) break;
      }
    }
    existing.set(t.id, record);
    if (snippet) {
      queue.push(JSON.stringify({ id: t.id, layer: t.layer, url: t.url, snippet }));
    }
    done += 1;
    if (done % CHECKPOINT_EVERY === 0) {
      await checkpoint();
      console.error(`[facts] ${done}/${targets.length} read, checkpointed`);
    }
  };

  await Promise.all(targets.map((t) => limiter(() => one(t))));
  await checkpoint();

  // The queue is additive across runs; an id read again replaces its snippet.
  const prevQueue = existsSync(fileURLToPath(QUEUE_URL))
    ? (await readFile(fileURLToPath(QUEUE_URL), "utf8")).split("\n").filter((l) => l.trim())
    : [];
  const readNow = new Set(targets.map((t) => t.id));
  const keptQueue = prevQueue.filter((l) => {
    try {
      return !readNow.has((JSON.parse(l) as { id: string }).id);
    } catch {
      return false;
    }
  });
  await writeJsonl(QUEUE_URL, [...keptQueue, ...queue]);

  const read = targets.filter((t) => existing.has(t.id)).map((t) => existing.get(t.id)!);
  const summary = {
    finished_at: new Date().toISOString(),
    targets_with_url: all.length,
    read_now: done,
    skipped_robots: skippedRobots,
    skipped_deadline: skippedDeadline,
    fetch_failed: fetchFailed,
    entity_errors: entityErrors,
    by_method: {
      jsonld: read.filter((r) => r.method === "jsonld").length,
      rule: read.filter((r) => r.method === "rule").length,
      none: read.filter((r) => r.method === "none").length,
    },
    hours_found: read.filter((r) => r.opening_hours).length,
    hours_ambiguous: read.filter((r) => r.hours_ambiguous).length,
    closure_notices: read.filter((r) => r.closure_notice).length,
    followed_info_pages: read.filter((r) => r.pages_read.length > 1).length,
    skipped_policy: { not_official_host: [...skips.values()].filter((r) => r === "not_official_host").length, shared_url: [...skips.values()].filter((r) => r === "shared_url").length },
    price_found: read.filter((r) => r.price || r.price_range_raw).length,
    lodging_times_found: read.filter((r) => r.lodging).length,
    queued_for_llm: queue.length,
    total_in_output: existing.size,
    errors: counter.summary(),
  };
  await mkdir(fileURLToPath(LOG_DIR), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await writeFile(
    fileURLToPath(new URL(`official_page_facts_${stamp}.json`, LOG_DIR)),
    JSON.stringify(summary, null, 2),
    "utf8",
  );
  console.error(`[facts] ${JSON.stringify(summary)}`);
  await notify(
    `official-page facts: read ${done}, hours ${summary.hours_found}, price ${summary.price_found}, queued for model ${queue.length}`,
  );
}

main().catch((err) => {
  console.error("[facts] FAILED:", err);
  process.exit(1);
});
