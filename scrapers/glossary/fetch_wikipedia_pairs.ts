/**
 * Fetch Wikipedia sitelink pairs (ja ↔ en) for every Wikidata attraction
 * we already collected.
 *
 * Output: data/glossary/wikipedia_pairs.json
 *
 * Why: Wikipedia article titles are human-curated, peer-reviewed translations
 * of real Japanese places. Using them as the gold-standard reference for AI
 * translation produces consistent, defensible English equivalents (e.g.
 * 鶴ヶ城 → "Tsuruga Castle", not "Crane Castle").
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const ATTRACTIONS_PATH = new URL(
  "../../data/_state/wikidata_attractions.json",
  import.meta.url,
);
const OUTPUT_PATH = new URL(
  "../../data/glossary/wikipedia_pairs.json",
  import.meta.url,
);

interface SparqlValue {
  value: string;
}
interface Binding {
  item?: SparqlValue;
  jaTitle?: SparqlValue;
  enTitle?: SparqlValue;
  jaUrl?: SparqlValue;
  enUrl?: SparqlValue;
}

interface PairRecord {
  qid: string;
  ja_title: string | null;
  en_title: string | null;
  ja_url: string | null;
  en_url: string | null;
}

function buildQuery(qids: string[]): string {
  const values = qids.map((q) => `wd:${q}`).join(" ");
  return `
SELECT ?item ?jaUrl ?enUrl ?jaTitle ?enTitle WHERE {
  VALUES ?item { ${values} }
  OPTIONAL {
    ?jaUrl schema:about ?item ;
           schema:isPartOf <https://ja.wikipedia.org/> ;
           schema:name ?jaTitle .
  }
  OPTIONAL {
    ?enUrl schema:about ?item ;
           schema:isPartOf <https://en.wikipedia.org/> ;
           schema:name ?enTitle .
  }
}
`.trim();
}

async function querySparql(query: string): Promise<Binding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = (await res.json()) as { results: { bindings: Binding[] } };
  return json.results.bindings;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(ATTRACTIONS_PATH), "utf8"),
  ) as { attractions: { qid: string }[] };
  const qids = raw.attractions.map((a) => a.qid).filter(Boolean);
  console.error(`[wikipedia_pairs] querying for ${qids.length} attractions`);

  const records: PairRecord[] = [];
  const batches = chunk(qids, 200); // SPARQL VALUES practical limit

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    let attempt = 0;
    while (attempt < 3) {
      try {
        const bindings = await querySparql(buildQuery(batch));
        const byQid = new Map<string, PairRecord>();
        for (const b of bindings) {
          const qid = b.item?.value.split("/").pop() ?? "";
          if (!qid) continue;
          const existing = byQid.get(qid) ?? {
            qid,
            ja_title: null,
            en_title: null,
            ja_url: null,
            en_url: null,
          };
          if (b.jaTitle && !existing.ja_title) {
            existing.ja_title = b.jaTitle.value;
            existing.ja_url = b.jaUrl?.value ?? null;
          }
          if (b.enTitle && !existing.en_title) {
            existing.en_title = b.enTitle.value;
            existing.en_url = b.enUrl?.value ?? null;
          }
          byQid.set(qid, existing);
        }
        records.push(...byQid.values());
        console.error(
          `[wikipedia_pairs] batch ${i + 1}/${batches.length}: +${byQid.size} (running total: ${records.length})`,
        );
        break;
      } catch (err) {
        attempt += 1;
        console.error(
          `  batch ${i + 1} attempt ${attempt}: ${(err as Error).message}`,
        );
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // Dedup by QID, prefer records with both languages populated
  const byQid = new Map<string, PairRecord>();
  for (const r of records) {
    const existing = byQid.get(r.qid);
    if (!existing) {
      byQid.set(r.qid, r);
      continue;
    }
    if (!existing.ja_title && r.ja_title) existing.ja_title = r.ja_title;
    if (!existing.en_title && r.en_title) existing.en_title = r.en_title;
    if (!existing.ja_url && r.ja_url) existing.ja_url = r.ja_url;
    if (!existing.en_url && r.en_url) existing.en_url = r.en_url;
  }
  const final = Array.from(byQid.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  const stats = {
    total: final.length,
    with_ja: final.filter((r) => r.ja_title).length,
    with_en: final.filter((r) => r.en_title).length,
    with_both: final.filter((r) => r.ja_title && r.en_title).length,
  };
  console.error(`[wikipedia_pairs] TOTAL: ${stats.total}`);
  console.error(
    `  ja-only Wikipedia: ${stats.with_ja - stats.with_both}, en-only: ${stats.with_en - stats.with_both}, both: ${stats.with_both}`,
  );

  const out = {
    source: "Wikidata sitelinks → ja.wikipedia.org / en.wikipedia.org",
    license: "CC BY-SA 4.0 (Wikipedia content); CC0 (Wikidata identifiers)",
    fetched_at: new Date().toISOString(),
    stats,
    pairs: final,
  };

  const outPath = fileURLToPath(OUTPUT_PATH);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[wikipedia_pairs] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[wikipedia_pairs] FAILED:", err);
  process.exit(1);
});
