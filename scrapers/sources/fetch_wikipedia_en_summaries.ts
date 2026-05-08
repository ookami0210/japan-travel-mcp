/**
 * Fetch 1-2 sentence English Wikipedia summaries (`extract`) for every
 * QID with an enwiki sitelink (collected by fetch_enwiki_sitelinks.ts).
 *
 * Source: en.wikipedia.org/w/api.php (action=query&prop=extracts&exintro=1
 * &exsentences=2&explaintext=1, batch up to 50 titles per call).
 *
 * Why: most master attractions either have no description_en or have a
 * 5–25 char Wikidata stub like "Japanese castle complex". Wikipedia's
 * intro extract is significantly richer (typically 100–300 chars) and
 * better suited for both human surfacing and multilingual-e5 ranking.
 *
 * Output: data/_state/wikipedia_en_summaries.json (sidecar; consumed by
 * scripts/inject_wikipedia_en_summaries.py).
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikipedia_en_summaries.ts
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const SRC = resolve(REPO_ROOT, "data/_state/enwiki_sitelinks.json");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/wikipedia_en_summaries.json");
const CACHE_DIR = resolve(REPO_ROOT, "data/_state/wikipedia_en_summaries_cache");

const API_BASE = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const BATCH = 50;
const DELAY_MS = 250;

interface OutRecord {
  qid: string;
  title: string;
  extract: string | null;
}

async function getCached(url: string): Promise<string> {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const cachePath = resolve(CACHE_DIR, `${hash}.json`);
  if (existsSync(cachePath)) return await readFile(cachePath, "utf8");
  let attempt = 0;
  while (true) {
    attempt += 1;
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
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
      await new Promise((s) => setTimeout(s, DELAY_MS));
      return text;
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
    }
  }
}

async function fetchBatch(items: { qid: string; title: string }[]): Promise<OutRecord[]> {
  const titlesParam = items.map((it) => it.title).join("|");
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    exsentences: "2",
    explaintext: "1",
    titles: titlesParam,
    format: "json",
    formatversion: "2",
  });
  const url = `${API_BASE}?${params.toString()}`;
  const text = await getCached(url);
  const json = JSON.parse(text) as {
    query?: { pages?: Array<{ pageid?: number; title: string; extract?: string }> };
  };
  const pages = json.query?.pages ?? [];
  const byTitle = new Map<string, string>();
  for (const p of pages) {
    if (p.title && p.extract) byTitle.set(p.title, p.extract);
  }
  const out: OutRecord[] = [];
  for (const it of items) {
    out.push({ qid: it.qid, title: it.title, extract: byTitle.get(it.title) ?? null });
  }
  return out;
}

async function main(): Promise<void> {
  const src = JSON.parse(await readFile(SRC, "utf8")) as {
    records?: Array<{ qid: string; enwiki_title: string | null }>;
  };
  const records = src.records ?? [];
  const targets = records
    .filter((r) => r.enwiki_title)
    .map((r) => ({ qid: r.qid, title: r.enwiki_title as string }));
  process.stderr.write(`[wp_en] targets: ${targets.length}\n`);

  const startedAt = new Date().toISOString();
  const out: OutRecord[] = [];
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    try {
      const got = await fetchBatch(slice);
      out.push(...got);
    } catch (e) {
      process.stderr.write(`  batch ${i}: ${(e as Error).message}\n`);
    }
    if ((i + BATCH) % 1000 === 0 || i + BATCH >= targets.length) {
      process.stderr.write(`  ${Math.min(i + BATCH, targets.length)}/${targets.length}\n`);
    }
  }

  const withExtract = out.filter((r) => r.extract).length;
  const summary = {
    source: "en_wikipedia_summaries",
    fetched_at: new Date().toISOString(),
    started_at: startedAt,
    total_records: out.length,
    with_extract: withExtract,
    records: out,
  };
  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(summary, null, 2), "utf8");
  process.stderr.write(
    `[wp_en] wrote ${OUT_FILE} | total=${out.length} | with_extract=${withExtract}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[wp_en] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
