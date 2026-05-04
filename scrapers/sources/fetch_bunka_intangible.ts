/**
 * Fetch Japan's Important Intangible Cultural Properties (重要無形文化財) and
 * Important Intangible Folk Cultural Properties (重要無形民俗文化財) via Wikidata.
 *
 * Why Wikidata (not the bunka.go.jp database directly):
 *   - The official 国指定文化財等データベース has no CSV/API export, only HTML search.
 *   - Wikidata mirrors the official designation property and carries multilingual
 *     labels under CC0. Each record links back to the authoritative bunka.go.jp
 *     entry via P3469 (BunCa ID) so provenance is verifiable.
 *
 * Heritage status QIDs we accept:
 *   Q11314985 — Important Intangible Cultural Property of Japan (重要無形文化財)
 *   Q11329936 — Important Intangible Folk Cultural Property (重要無形民俗文化財)
 *
 * Output: data/r3/bunka_intangible.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_bunka_intangible.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";

// Heritage designation values for P3259 (national heritage status).
// QIDs verified live against Wikidata 2026-04-27.
const HERITAGE_QIDS: { qid: string; label: string }[] = [
  { qid: "Q11644860", label: "重要無形文化財 (Important Intangible Cultural Property)" },
  { qid: "Q6573893", label: "重要無形民俗文化財 (Important Intangible Folk Cultural Property)" },
];

export interface BunkaIntangibleRecord {
  source: "bunka_intangible";
  authority: "文化庁 (via Wikidata)";
  qid: string;
  wikidata_url: string;
  designation: string; // human-readable heritage label
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inception: string | null; // ISO datetime if available
  bunca_id: string | null; // P3469 — official bunka.go.jp database ID
  fetched_at: string;
}

interface SparqlBinding {
  item?: { value: string };
  itemLabel_ja?: { value: string };
  itemLabel_en?: { value: string };
  itemDesc_ja?: { value: string };
  itemDesc_en?: { value: string };
  inception?: { value: string };
  buncaId?: { value: string };
}

function buildQuery(designationQid: string): string {
  return `
SELECT DISTINCT ?item ?itemLabel_ja ?itemLabel_en ?itemDesc_ja ?itemDesc_en ?inception ?buncaId
WHERE {
  ?item wdt:P3259 wd:${designationQid} .
  OPTIONAL { ?item rdfs:label ?itemLabel_ja . FILTER(LANG(?itemLabel_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }
  OPTIONAL { ?item schema:description ?itemDesc_ja . FILTER(LANG(?itemDesc_ja) = "ja") }
  OPTIONAL { ?item schema:description ?itemDesc_en . FILTER(LANG(?itemDesc_en) = "en") }
  OPTIONAL { ?item wdt:P571 ?inception . }
  OPTIONAL { ?item wdt:P3469 ?buncaId . }
}
LIMIT 5000
`.trim();
}

async function querySparql(query: string): Promise<SparqlBinding[]> {
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/sparql-results+json",
    },
  });
  if (!res.ok) {
    throw new Error(`Wikidata SPARQL HTTP ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    results: { bindings: SparqlBinding[] };
  };
  return json.results.bindings;
}

function qidFromUri(uri: string): string {
  return uri.split("/").pop() ?? "";
}

export async function fetchBunkaIntangible(): Promise<BunkaIntangibleRecord[]> {
  const out: BunkaIntangibleRecord[] = [];
  const seen = new Set<string>();
  for (const { qid: dQid, label } of HERITAGE_QIDS) {
    let attempt = 0;
    while (attempt < 3) {
      try {
        const bindings = await querySparql(buildQuery(dQid));
        console.error(
          `[bunka_intangible] designation ${dQid} (${label}): ${bindings.length} bindings`,
        );
        for (const b of bindings) {
          const qid = qidFromUri(b.item?.value ?? "");
          if (!qid || seen.has(qid)) continue;
          seen.add(qid);
          out.push({
            source: "bunka_intangible",
            authority: "文化庁 (via Wikidata)",
            qid,
            wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
            designation: label,
            designation_qid: dQid,
            name_ja: b.itemLabel_ja?.value ?? null,
            name_en: b.itemLabel_en?.value ?? null,
            description_ja: b.itemDesc_ja?.value ?? null,
            description_en: b.itemDesc_en?.value ?? null,
            inception: b.inception?.value ?? null,
            bunca_id: b.buncaId?.value ?? null,
            fetched_at: new Date().toISOString(),
          });
        }
        break;
      } catch (err) {
        attempt += 1;
        console.error(
          `  designation ${dQid} attempt ${attempt} failed: ${(err as Error).message}`,
        );
        if (attempt >= 3) break;
        await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return out.sort((a, b) => a.qid.localeCompare(b.qid));
}

async function main(): Promise<void> {
  const records = await fetchBunkaIntangible();
  const out = {
    source: {
      name: "Japan Important Intangible Cultural Properties (重要無形文化財・重要無形民俗文化財)",
      authority: "文化庁",
      origin: "Wikidata SPARQL (mirrors the official designation; CC0)",
      endpoint: SPARQL_ENDPOINT,
      property: "P3259 (national heritage status)",
      designations: HERITAGE_QIDS,
      license: "CC0",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/bunka_intangible.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(
    `[bunka_intangible] wrote ${records.length} records to ${outPath}`,
  );
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[bunka_intangible] FAILED:", err);
    process.exit(1);
  });
}
