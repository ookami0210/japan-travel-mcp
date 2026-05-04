/**
 * Fetch 高野山宿坊組合 (Koyasan Shukubo Association) member temple list.
 *
 * Source: https://www.shukubo.net/contents/stay/
 * Authority: 高野山宿坊協会 (official Koyasan shukubo association)
 *
 * Why: iter59 v4-data L2-15/L2-02 cases couldn't surface specific Koyasan
 * shukubo (恵光院/福智院/西禅院/赤松院/etc.). Wikidata coverage is
 * patchy. The official 宿坊組合 site lists all member shukubo.
 *
 * Output: data/r3/koyasan_shukubo.json
 *
 * Per project data principle: official organization public information.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/r3/koyasan_shukubo.json");
const CACHE_DIR = resolve(REPO_ROOT, "data/_state/koyasan_shukubo_cache");

const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const BASE = "https://www.shukubo.net";
const LIST_URL = `${BASE}/contents/stay/`;

interface ShukuboRecord {
  source: "koyasan_shukubo";
  authority: string;
  shukubo_id: string;
  name_ja: string;
  name_en: string | null;
  prefecture_jp: string;
  prefecture_codes: string[];
  municipality_jp: string;
  address_jp: string | null;
  phone: string | null;
  description_ja: string | null;
  source_url: string;
  fetched_at: string;
}

async function fetchHtml(url: string): Promise<string> {
  const cacheKey = url.replace(/[^a-z0-9]/gi, "_") + ".html";
  const cachePath = resolve(CACHE_DIR, cacheKey);
  if (existsSync(cachePath)) {
    return await readFile(cachePath, "utf8");
  }
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const text = await r.text();
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, text, "utf8");
  await new Promise((s) => setTimeout(s, 600));
  return text;
}

function parseListPage(html: string): { id: string; url: string }[] {
  const out: { id: string; url: string }[] = [];
  // Detail link pattern: <a href="ekoin.html?modal=1">
  const re = /href="([a-z][a-z0-9_]+)\.html(?:\?[^"]*)?"/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  // Block list — these are non-shukubo nav/contact pages
  const SKIP = new Set([
    "index", "topics", "service", "guide", "contact", "access", "search",
    "list", "info", "about", "terms", "tokusho", "topnav",
    "nakanohashi", "rurubu", "walk_guide", "buddhism",
  ]);
  while ((m = re.exec(html))) {
    const id = m[1];
    if (SKIP.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, url: `${BASE}/contents/stay/${id}.html` });
  }
  return out;
}

function parseDetail(html: string, id: string): {
  name_ja: string;
  name_en: string | null;
  address_jp: string | null;
  phone: string | null;
  description_ja: string | null;
} {
  // Extract <title> or <h1> for name
  const titleM = /<title>([^<]+)<\/title>/.exec(html);
  let name_ja = id;
  if (titleM) {
    name_ja = titleM[1].split(/[|｜｜：:]/)[0].trim();
  }
  const h1M = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
  if (h1M) {
    const txt = h1M[1].replace(/<[^>]+>/g, "").trim();
    if (txt && txt.length < 60) name_ja = txt;
  }
  // Try to extract roman name
  const romanM = /<(?:span|h[1-3])[^>]*class="[^"]*(?:eng|en|roman)[^"]*"[^>]*>([\s\S]*?)<\/(?:span|h[1-3])>/i.exec(html);
  let name_en: string | null = null;
  if (romanM) {
    const txt = romanM[1].replace(/<[^>]+>/g, "").trim();
    if (txt && /^[A-Za-z][A-Za-z\s\-']+/.test(txt)) name_en = txt;
  }
  // Address: 〒xxx-xxxx 高野町...
  const addrM = /(〒\s*\d{3}-?\d{4}[^\n<]+)/u.exec(html);
  const address_jp = addrM ? addrM[1].trim() : null;
  // Phone: 0xxx-xx-xxxx pattern
  const phoneM = /(0\d{1,4}-?\d{1,4}-?\d{3,4})/.exec(html);
  const phone = phoneM ? phoneM[1] : null;
  // Description: first long <p>
  const descM = /<p[^>]*>([\s\S]{60,800}?)<\/p>/i.exec(html);
  const description_ja = descM ? descM[1].replace(/<[^>]+>/g, "").trim() : null;
  return { name_ja, name_en, address_jp, phone, description_ja };
}

async function main(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  process.stderr.write(`fetching list: ${LIST_URL}\n`);
  const listHtml = await fetchHtml(LIST_URL);
  const items = parseListPage(listHtml);
  process.stderr.write(`found ${items.length} candidate shukubo entries\n`);

  const records: ShukuboRecord[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    process.stderr.write(`[${i + 1}/${items.length}] ${it.id}\n`);
    let detail;
    try {
      const html = await fetchHtml(it.url);
      detail = parseDetail(html, it.id);
    } catch (e) {
      process.stderr.write(`  fetch failed: ${(e as Error).message}\n`);
      continue;
    }
    if (!detail.name_ja || detail.name_ja === it.id) {
      // Likely a 404 redirected to nav-chrome page; skip
      process.stderr.write(`  skip (no name)\n`);
      continue;
    }
    records.push({
      source: "koyasan_shukubo",
      authority: "高野山宿坊協会",
      shukubo_id: it.id,
      name_ja: detail.name_ja,
      name_en: detail.name_en,
      prefecture_jp: "和歌山県",
      prefecture_codes: ["30"],
      municipality_jp: "高野町",
      address_jp: detail.address_jp,
      phone: detail.phone,
      description_ja: detail.description_ja,
      source_url: it.url,
      fetched_at: fetchedAt,
    });
  }
  await mkdir(dirname(OUT_FILE), { recursive: true });
  const out = {
    source: "koyasan_shukubo",
    authority: "高野山宿坊協会",
    fetched_at: fetchedAt,
    count: records.length,
    records,
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(`Wrote ${records.length} records to ${OUT_FILE}\n`);
}

await main();
