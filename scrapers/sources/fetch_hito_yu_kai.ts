/**
 * Fetch 日本秘湯を守る会 (Nihon Hitou wo Mamoru Kai) member ryokan list.
 *
 * Source: https://www.hitou.or.jp/
 * Authority: 日本秘湯を守る会 (industry association founded 1975, ~185 ryokans)
 *
 * Why: iter59 v4-data L2-01 case missed 乳頭温泉 / 鶴の湯 etc. — these
 * famous "hisoyu" (hidden onsen) ryokans are not consistently tagged in
 * Wikidata or OSM. The 守る会 publishes the official member list on its
 * site, and that list is the authoritative source for "公式 hisoyu
 * ryokan" status.
 *
 * Output: data/r3/hito_yu_kai.json
 *   {
 *     source: "hito_yu_kai",
 *     authority: "日本秘湯を守る会",
 *     fetched_at: ISO,
 *     count: N,
 *     records: [
 *       { name_ja, prefecture_jp, address_jp, source_url, ... }
 *     ]
 *   }
 *
 * Per project data principle (2026-05-04): public information from an official
 * industry association. Records carry source / source_url / authority for
 * traceability. Delete-on-request honoured.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/r3/hito_yu_kai.json");
const CACHE_DIR = resolve(REPO_ROOT, "data/_state/hito_yu_kai_cache");

const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const BASE = "https://www.hitou.or.jp";
const LIST_URL = `${BASE}/provider/list`;

interface Record_ {
  source: "hito_yu_kai";
  authority: string;
  ryokan_id: string;
  name_ja: string;
  name_kana_ja: string | null;
  prefecture_jp: string | null;
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
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept": "text/html" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) {
        if (attempt < 4 && (r.status === 429 || r.status === 503)) {
          await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
          continue;
        }
        throw new Error(`${url}: ${r.status}`);
      }
      const text = await r.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(cachePath, text, "utf8");
      // polite throttle
      await new Promise((s) => setTimeout(s, 800));
      return text;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
    }
  }
}

// Parse the list page → array of (name, detail_url) pairs.
// The list page uses prefecture-grouped <li><a href="/onsen/<id>/">name</a></li>
// items. We pull every link with /onsen/<digits-or-slug>/ pattern.
function parseList(html: string): { id: string; url: string; name_text: string }[] {
  const out: { id: string; url: string; name_text: string }[] = [];
  // 2026 site: detail links are /provider/detail?providerId=NNN
  const re = /<a[^>]+href="(\/provider\/detail\?providerId=(\d+))"[^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(html))) {
    const path = m[1];
    const id = m[2];
    if (seen.has(id)) continue;
    seen.add(id);
    let name_text = m[3].replace(/<[^>]+>/g, "").trim();
    if (!name_text) name_text = `provider_${id}`;
    out.push({ id, url: BASE + path, name_text });
  }
  return out;
}

function parseDetail(html: string, fallbackName: string): {
  name_ja: string;
  prefecture_jp: string | null;
  address_jp: string | null;
  phone: string | null;
  description_ja: string | null;
} {
  // 2026 hito-yu-kai detail layout uses <h2 id="providerName">name</h2>
  // and table01 for facility metadata. og:title is also reliable: "name -
  // 日本秘湯を守る会 公式Webサイト".
  let name_ja = fallbackName;
  const ogTitle = /<meta\s+property="og:title"\s+content="([^"]+)"/i.exec(html);
  if (ogTitle) {
    name_ja = ogTitle[1].split(/\s*-\s*日本秘湯/)[0].trim();
  }
  const provName = /<h2[^>]+id="providerName"[^>]*>([\s\S]*?)<\/h2>/i.exec(html);
  if (provName) {
    const txt = provName[1].replace(/<[^>]+>/g, "").trim();
    if (txt && txt.length > 1) name_ja = txt;
  }
  const findCell = (label: string): string | null => {
    const re = new RegExp(`<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, "i");
    const m = re.exec(html);
    return m ? m[1].replace(/<[^>]+>/g, "").replace(/\[?→MAP\]?/g, "").trim() : null;
  };
  const phone = findCell("TEL") ?? findCell("電話") ?? findCell("お電話");
  // Address: 〒XXX-XXXX cell or "所在地" / "住所" cell
  let address_jp: string | null = findCell("所在地") ?? findCell("住所");
  if (!address_jp) {
    const addrRe = /(〒\s*\d{3}-?\d{4}[^\n<]+)/u;
    const addrM = addrRe.exec(html);
    if (addrM) address_jp = addrM[0].replace(/\s+/g, " ").trim();
  }
  // Prefecture from address
  let prefecture_jp: string | null = null;
  if (address_jp) {
    const prefM = /(北海道|[一-龥]+(都|府|県))/u.exec(address_jp);
    if (prefM) prefecture_jp = prefM[0];
  }
  // Description: og:description preferred
  let description_ja: string | null = null;
  const ogDesc = /<meta\s+property="og:description"\s+content="([^"]+)"/i.exec(html);
  if (ogDesc) description_ja = ogDesc[1].trim();
  return { name_ja, prefecture_jp, address_jp, phone, description_ja };
}

const PREF_TO_CODE: Record<string, string> = {
  北海道: "01", 青森県: "02", 岩手県: "03", 宮城県: "04", 秋田県: "05",
  山形県: "06", 福島県: "07", 茨城県: "08", 栃木県: "09", 群馬県: "10",
  埼玉県: "11", 千葉県: "12", 東京都: "13", 神奈川県: "14", 新潟県: "15",
  富山県: "16", 石川県: "17", 福井県: "18", 山梨県: "19", 長野県: "20",
  岐阜県: "21", 静岡県: "22", 愛知県: "23", 三重県: "24", 滋賀県: "25",
  京都府: "26", 大阪府: "27", 兵庫県: "28", 奈良県: "29", 和歌山県: "30",
  鳥取県: "31", 島根県: "32", 岡山県: "33", 広島県: "34", 山口県: "35",
  徳島県: "36", 香川県: "37", 愛媛県: "38", 高知県: "39", 福岡県: "40",
  佐賀県: "41", 長崎県: "42", 熊本県: "43", 大分県: "44", 宮崎県: "45",
  鹿児島県: "46", 沖縄県: "47",
};

function inferPrefCode(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [name, code] of Object.entries(PREF_TO_CODE)) {
    if (text.includes(name)) return code;
    const bare = name.replace(/[都道府県]$/u, "");
    if (text.includes(bare)) return code;
  }
  return null;
}

async function main(): Promise<void> {
  const fetchedAt = new Date().toISOString();
  process.stderr.write(`fetching list: ${LIST_URL}\n`);
  const listHtml = await fetchHtml(LIST_URL);
  const items = parseList(listHtml);
  process.stderr.write(`found ${items.length} member entries on list page\n`);

  const records: (Record_ & { prefecture_codes: string[] })[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    process.stderr.write(`[${i + 1}/${items.length}] ${it.name_text}\n`);
    let detail;
    try {
      const html = await fetchHtml(it.url);
      detail = parseDetail(html, it.name_text);
    } catch (e) {
      process.stderr.write(`  fetch failed: ${(e as Error).message}\n`);
      continue;
    }
    const prefCode = inferPrefCode(detail.prefecture_jp ?? detail.address_jp ?? "");
    const prefecture_codes = prefCode ? [prefCode] : [];
    records.push({
      source: "hito_yu_kai",
      authority: "日本秘湯を守る会",
      ryokan_id: it.id,
      name_ja: detail.name_ja,
      name_kana_ja: null,
      prefecture_jp: detail.prefecture_jp,
      prefecture_codes,
      address_jp: detail.address_jp,
      phone: detail.phone,
      description_ja: detail.description_ja,
      source_url: it.url,
      fetched_at: fetchedAt,
    });
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  const out = {
    source: "hito_yu_kai",
    authority: "日本秘湯を守る会",
    fetched_at: fetchedAt,
    count: records.length,
    records,
  };
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(`Wrote ${records.length} records to ${OUT_FILE}\n`);
}

await main();
