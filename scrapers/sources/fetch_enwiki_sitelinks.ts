/**
 * Fetch English Wikipedia sitelink titles for every master attraction.
 *
 * Source: Wikidata wbgetentities (props=sitelinks&sitefilter=enwiki),
 * batched at 50 QIDs / call.
 *
 * Why: the prior wbgetentities backfill (#33) only targeted entries
 * lacking description_en. To upgrade description_en across the full
 * master with richer Wikipedia intros, we need enwiki titles for ALL
 * QIDs — including those that already have a Wikidata short
 * description_en (the typical 5–25 char "type of X" stub).
 *
 * Output: data/_state/enwiki_sitelinks.json (sidecar; consumed by
 * scripts/inject_enwiki_titles.py and scrapers/sources/
 * fetch_wikipedia_en_summaries.ts).
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_enwiki_sitelinks.ts
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const MASTER = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/enwiki_sitelinks.json");

const API_BASE = "https://www.wikidata.org/w/api.php";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";
const BATCH = 50;
const DELAY_MS = 350;
const RESUME = process.env.RESUME === "1";

interface OutRecord {
  qid: string;
  enwiki_title: string | null;
}

async function fetchBatch(qids: string[]): Promise<OutRecord[]> {
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: qids.join("|"),
    props: "sitelinks",
    sitefilter: "enwiki",
    format: "json",
  });
  const url = `${API_BASE}?${params.toString()}`;
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
        throw new Error(`HTTP ${r.status}`);
      }
      const json = (await r.json()) as {
        entities?: Record<string, { sitelinks?: Record<string, { title: string }> }>;
      };
      return qids.map((qid) => ({
        qid,
        enwiki_title: json.entities?.[qid]?.sitelinks?.enwiki?.title ?? null,
      }));
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((s) => setTimeout(s, 2000 * 2 ** attempt));
    }
  }
}

async function main(): Promise<void> {
  const master = JSON.parse(await readFile(MASTER, "utf8")) as {
    attractions: Array<{ qid?: string }>;
  };
  const qids = master.attractions.map((a) => a.qid).filter((q): q is string => !!q);

  const cached: OutRecord[] = [];
  const cachedQids = new Set<string>();
  if (RESUME && existsSync(OUT_FILE)) {
    try {
      const c = JSON.parse(await readFile(OUT_FILE, "utf8")) as { records?: OutRecord[] };
      cached.push(...(c.records ?? []));
      for (const r of cached) cachedQids.add(r.qid);
      process.stderr.write(`[enwiki] resume: ${cachedQids.size} cached\n`);
    } catch {
      // fresh start
    }
  }
  const queue = qids.filter((q) => !cachedQids.has(q));
  process.stderr.write(`[enwiki] total ${qids.length} | queue ${queue.length}\n`);

  const startedAt = new Date().toISOString();
  const records: OutRecord[] = [...cached];
  for (let i = 0; i < queue.length; i += BATCH) {
    const batch = queue.slice(i, i + BATCH);
    try {
      const got = await fetchBatch(batch);
      records.push(...got);
    } catch (e) {
      process.stderr.write(`  batch ${i}: ${(e as Error).message}\n`);
    }
    if ((i + BATCH) % 2000 === 0 || i + BATCH >= queue.length) {
      process.stderr.write(`  ${Math.min(i + BATCH, queue.length)}/${queue.length} processed\n`);
      // Periodic checkpoint
      await writeFile(
        OUT_FILE,
        JSON.stringify(
          {
            source: "wikidata_enwiki_sitelinks",
            fetched_at: new Date().toISOString(),
            started_at: startedAt,
            total_records: records.length,
            with_title: records.filter((r) => r.enwiki_title).length,
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
  const withTitle = records.filter((r) => r.enwiki_title).length;
  await writeFile(
    OUT_FILE,
    JSON.stringify(
      {
        source: "wikidata_enwiki_sitelinks",
        fetched_at: new Date().toISOString(),
        started_at: startedAt,
        total_records: records.length,
        with_title: withTitle,
        records,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(
    `[enwiki] wrote ${OUT_FILE} | total=${records.length} | with_title=${withTitle}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[enwiki] FATAL: ${(err as Error).stack}\n`);
  process.exit(1);
});
