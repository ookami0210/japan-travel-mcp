/**
 * Fetch Japan's UNESCO Intangible Cultural Heritage entries via Wikidata.
 *
 * UNESCO ICH list filtered to country = Japan (Q17). Wikidata mirrors the
 * official UNESCO ICH list under CC0 with multilingual labels and the canonical
 * UNESCO inventory ID (P1264).
 *
 * Output: data/r3/unesco_japan.json
 *
 * Run:
 *   npx tsx scrapers/sources/fetch_unesco_japan.ts
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp)";

// Heritage designation values used with P3259 (national heritage status).
// QIDs verified live against Wikidata 2026-04-27.
//   Q110319947 — Representative List of the Intangible Cultural Heritage of Humanity (current list)
//   Q877988    — Masterpieces of the Oral and Intangible Heritage of Humanity (legacy list, merged into RL in 2008)
const UNESCO_DESIGNATIONS = ["Q110319947", "Q877988"];

export interface UnescoJapanRecord {
  source: "unesco_japan";
  authority: "UNESCO (mirrored via Wikidata)";
  qid: string;
  wikidata_url: string;
  designation_qid: string;
  name_ja: string | null;
  name_en: string | null;
  description_ja: string | null;
  description_en: string | null;
  inscription_year: number | null;
  unesco_id: string | null; // P10221 — UNESCO ICH inventory ID (e.g. RL/00012)
  fetched_at: string;
}

interface SparqlBinding {
  item?: { value: string };
  designation?: { value: string };
  itemLabel_ja?: { value: string };
  itemLabel_en?: { value: string };
  itemDesc_ja?: { value: string };
  itemDesc_en?: { value: string };
  inceptionYear?: { value: string };
  unescoId?: { value: string };
}

function buildQuery(designationsValues: string): string {
  return `
SELECT DISTINCT ?item ?designation ?itemLabel_ja ?itemLabel_en
       ?itemDesc_ja ?itemDesc_en ?inceptionYear ?unescoId
WHERE {
  VALUES ?designation { ${designationsValues} }
  ?item wdt:P3259 ?designation .
  ?item wdt:P17 wd:Q17 .
  OPTIONAL { ?item rdfs:label ?itemLabel_ja . FILTER(LANG(?itemLabel_ja) = "ja") }
  OPTIONAL { ?item rdfs:label ?itemLabel_en . FILTER(LANG(?itemLabel_en) = "en") }
  OPTIONAL { ?item schema:description ?itemDesc_ja . FILTER(LANG(?itemDesc_ja) = "ja") }
  OPTIONAL { ?item schema:description ?itemDesc_en . FILTER(LANG(?itemDesc_en) = "en") }
  OPTIONAL {
    ?item p:P3259 ?stmt .
    ?stmt ps:P3259 ?designation .
    OPTIONAL {
      ?stmt pq:P580 ?startDate .
      BIND(YEAR(?startDate) AS ?inceptionYear)
    }
  }
  OPTIONAL { ?item wdt:P10221 ?unescoId . }
}
LIMIT 500
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

export async function fetchUnescoJapan(): Promise<UnescoJapanRecord[]> {
  const designationsValues = UNESCO_DESIGNATIONS.map((q) => `wd:${q}`).join(" ");
  let attempt = 0;
  let bindings: SparqlBinding[] = [];
  while (attempt < 3) {
    try {
      bindings = await querySparql(buildQuery(designationsValues));
      console.error(`[unesco_japan] fetched ${bindings.length} bindings`);
      break;
    } catch (err) {
      attempt += 1;
      console.error(
        `  attempt ${attempt} failed: ${(err as Error).message}`,
      );
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  const byQid = new Map<string, UnescoJapanRecord>();
  for (const b of bindings) {
    const qid = qidFromUri(b.item?.value ?? "");
    if (!qid) continue;
    const dQid = qidFromUri(b.designation?.value ?? "");
    const existing = byQid.get(qid);
    const inceptionYear = b.inceptionYear?.value
      ? parseInt(b.inceptionYear.value, 10)
      : null;
    if (!existing) {
      byQid.set(qid, {
        source: "unesco_japan",
        authority: "UNESCO (mirrored via Wikidata)",
        qid,
        wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
        designation_qid: dQid,
        name_ja: b.itemLabel_ja?.value ?? null,
        name_en: b.itemLabel_en?.value ?? null,
        description_ja: b.itemDesc_ja?.value ?? null,
        description_en: b.itemDesc_en?.value ?? null,
        inscription_year: inceptionYear,
        unesco_id: b.unescoId?.value ?? null,
        fetched_at: new Date().toISOString(),
      });
    } else {
      if (!existing.name_ja && b.itemLabel_ja) existing.name_ja = b.itemLabel_ja.value;
      if (!existing.name_en && b.itemLabel_en) existing.name_en = b.itemLabel_en.value;
      if (!existing.description_ja && b.itemDesc_ja) {
        existing.description_ja = b.itemDesc_ja.value;
      }
      if (!existing.description_en && b.itemDesc_en) {
        existing.description_en = b.itemDesc_en.value;
      }
      if (existing.inscription_year === null && inceptionYear !== null) {
        existing.inscription_year = inceptionYear;
      }
      if (!existing.unesco_id && b.unescoId) existing.unesco_id = b.unescoId.value;
    }
  }
  return [...byQid.values()].sort(
    (a, b) =>
      (a.inscription_year ?? 0) - (b.inscription_year ?? 0) ||
      a.qid.localeCompare(b.qid),
  );
}

async function main(): Promise<void> {
  const records = await fetchUnescoJapan();
  const out = {
    source: {
      name: "UNESCO Intangible Cultural Heritage of Japan",
      authority: "UNESCO",
      origin: "Wikidata SPARQL (mirrors official UNESCO inventory; CC0)",
      endpoint: SPARQL_ENDPOINT,
      designations: UNESCO_DESIGNATIONS,
      filter: "wdt:P17 = wd:Q17 (Japan)",
      license: "CC0",
    },
    fetched_at: new Date().toISOString(),
    total: records.length,
    records,
  };
  const outPath = fileURLToPath(
    new URL("../../data/r3/unesco_japan.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[unesco_japan] wrote ${records.length} records to ${outPath}`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[unesco_japan] FAILED:", err);
    process.exit(1);
  });
}
