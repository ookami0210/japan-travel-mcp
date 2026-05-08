/**
 * Backfill Wikidata short descriptions (en + ja) and English Wikipedia
 * sitelink titles for master attractions that currently lack them.
 *
 * Source: Wikidata wbgetentities API — up to 50 QIDs per call,
 * returning labels / descriptions / sitelinks at low cost.
 *
 * Why: 36,795 of 74,008 master attractions lack any description in
 * either language. Many of these have a perfectly good Wikidata short
 * description (often Japanese) that the v1/v2/p1435/heritage fetchers
 * didn't pull. Backfilling the descriptions immediately improves:
 *   - get_spots / search_area human readability
 *   - search_semantic (multilingual-e5 ranks better with descriptions)
 *   - Solver / get_entity_full output completeness
 *
 * Output: data/_state/wikidata_descriptions.json (sidecar; consumed by
 * scripts/inject_wikidata_descriptions.py).
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_wikidata_descriptions.ts
 *   RESUME=1 npx tsx scrapers/sources/fetch_wikidata_descriptions.ts
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const MASTER = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/wikidata_descriptions.json");

const API_BASE = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const BATCH = 50;
const DELAY_MS = 250;
const RESUME = process.env.RESUME === "1";

interface OutRecord {
  qid: string;
  description_en: string | null;
  description_ja: string | null;
  enwiki_title: string | null;
  jawiki_title: string | null;
}

async function fetchBatch(qids: string[]): Promise<OutRecord[]> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qids.join("|"),
    props: "descriptions|sitelinks",
    sitefilter: "enwiki|jawiki",
    languages: "en|ja",
    format: "json",
  });
  const url = `${API_BASE}?${params.toString()}`;
  const r = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const json = (await r.json()) as {
    entities?: Record<string, {
      descriptions?: Record<string, { value: string }>;
      sitelinks?: Record<string, { title: string }>;
    }>;
  };
  const out: OutRecord[] = [];
  for (const qid of qids) {
    const e = json.entities?.[qid];
    if (!e) {
      out.push({ qid, description_en: null, description_ja: null, enwiki_title: null, jawiki_title: null });
      continue;
    }
    out.push({
      qid,
      description_en: e.descriptions?.en?.value ?? null,
      description_ja: e.descriptions?.ja?.value ?? null,
      enwiki_title: e.sitelinks?.enwiki?.title ?? null,
      jawiki_title: e.sitelinks?.jawiki?.title ?? null,
    });
  }
  return out;
}

async function main(): Promise<void> {
  const master = JSON.parse(await readFile(MASTER, "utf8")) as {
    attractions: Array<{ qid?: string; description_en?: string | null; description_ja?: string | null }>;
  };

  let existing: OutRecord[] = [];
  let cachedQids = new Set<string>();
  if (RESUME && existsSync(OUT_FILE)) {
    try {
      const cached = JSON.parse(await readFile(OUT_FILE, "utf8")) as { records?: OutRecord[] };
      existing = cached.records ?? [];
      cachedQids = new Set(existing.map((r) => r.qid));
      process.stderr.write(`[wd_desc] resume: ${cachedQids.size} cached\n`);
    } catch {
      existing = [];
    }
  }

  // Targets: master entries lacking description_en AND not in cache
  const targets = master.attractions
    .map((a) => a.qid)
    .filter((q): q is string => !!q)
    .filter((q) => !cachedQids.has(q));

  // Filter to those that lack description_en in master (the immediate gap)
  const noDescQids = new Set(
    master.attractions
      .filter((a) => a.qid && !a.description_en)
      .map((a) => a.qid as string),
  );
  const queue = targets.filter((q) => noDescQids.has(q));
  process.stderr.write(`[wd_desc] queue: ${queue.length} QIDs (master lacking description_en, not cached)\n`);

  const startedAt = new Date().toISOString();
  const records: OutRecord[] = [...existing];
  let processed = 0;
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    try {
      const got = await fetchBatch(batch);
      records.push(...got);
    } catch (e) {
      process.stderr.write(`  batch ${i}: ${(e as Error).message}\n`);
    }
    processed += batch.length;
    if (processed % 1000 === 0 || i + BATCH >= queue.length) {
      process.stderr.write(`  ${processed}/${queue.length} processed\n`);
      // Periodic checkpoint
      await writeFile(
        OUT_FILE,
        JSON.stringify(
          {
            source: "wikidata_descriptions_backfill",
            fetched_at: new Date().toISOString(),
            started_at: startedAt,
            total_records: records.length,
            records,
          },
          null,
          2,
        ),
        "utf8",
      );
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        source: "wikidata_descriptions_backfill",
        fetched_at: new Date().toISOString(),
        started_at: startedAt,
        total_records: records.length,
        records,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(`[wd_desc] wrote ${records.length} records to ${OUT_FILE}\n`);
}

main().catch((err) => {
  process.stderr.write(`[wd_desc] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
