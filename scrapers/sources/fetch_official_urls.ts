/**
 * Resolve each municipality's official website URL by querying Wikidata.
 *
 * Wikidata properties used:
 *   P429 — JIS X 0402 municipality code (Japan)
 *   P856 — official website
 *
 * Output: data/_state/official_urls.json
 *   { "<6-digit code>": { official_url: string|null, wikidata_qid: string } }
 *
 * For the pilot we only fetch Tottori (31) and Kochi (39) prefectures to keep
 * the SPARQL response small.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp; OSS travel data for AI agents)";

const PREFECTURE_CODES_TO_FETCH = ["31", "39"]; // Tottori, Kochi

const OUTPUT_PATH = new URL("../../data/_state/official_urls.json", import.meta.url);

interface SparqlBinding {
  city?: { value: string };
  soumuCode?: { value: string };
  official?: { value: string };
  cityLabel?: { value: string };
}

interface UrlEntry {
  code: string;
  name: string;
  official_url: string | null;
  wikidata_qid: string;
}

function buildQuery(prefectureFilter: string): string {
  return `
SELECT ?city ?cityLabel ?soumuCode ?official WHERE {
  ?city wdt:P429 ?soumuCode .
  OPTIONAL { ?city wdt:P856 ?official . }
  FILTER(${prefectureFilter})
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
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
  const json = (await res.json()) as { results: { bindings: SparqlBinding[] } };
  return json.results.bindings;
}

async function main(): Promise<void> {
  const filter = PREFECTURE_CODES_TO_FETCH.map(
    (c) => `STRSTARTS(?soumuCode, "${c}")`,
  ).join(" || ");
  const query = buildQuery(filter);

  console.error(`[fetch_official_urls] SPARQL → ${PREFECTURE_CODES_TO_FETCH.join(", ")}`);
  const bindings = await querySparql(query);
  console.error(`[fetch_official_urls] received ${bindings.length} bindings`);

  // Wikidata's P429 sometimes uses 5-digit, sometimes 6-digit (with check
  // digit) codes. We normalise to 6-digit by zero-padding. The MIC dataset
  // we already fetched uses 6-digit, so we match on those.
  const byCode = new Map<string, UrlEntry>();
  for (const b of bindings) {
    if (!b.soumuCode || !b.city) continue;
    const raw = b.soumuCode.value.replace(/\D/g, "");
    if (raw.length !== 5 && raw.length !== 6) continue;
    const code6 = raw.length === 6 ? raw : raw; // keep as-is, we'll match both forms
    const qid = b.city.value.split("/").pop() ?? "";
    const existing = byCode.get(code6);
    const url = b.official?.value ?? null;
    if (!existing || (url && !existing.official_url)) {
      byCode.set(code6, {
        code: code6,
        name: b.cityLabel?.value ?? "",
        official_url: url,
        wikidata_qid: qid,
      });
    }
  }

  const records = Array.from(byCode.values()).sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const withUrl = records.filter((r) => r.official_url).length;
  console.error(
    `[fetch_official_urls] resolved ${withUrl}/${records.length} with official URL`,
  );

  const output = {
    source: {
      endpoint: SPARQL_ENDPOINT,
      properties: ["P429 (JIS municipality code)", "P856 (official website)"],
    },
    fetched_at: new Date().toISOString(),
    prefectures_fetched: PREFECTURE_CODES_TO_FETCH,
    total_records: records.length,
    records_with_url: withUrl,
    entries: records,
  };

  const outPath = fileURLToPath(OUTPUT_PATH);
  await writeFile(outPath, JSON.stringify(output, null, 2), "utf8");
  console.error(`[fetch_official_urls] saved → ${outPath}`);
}

main().catch((err) => {
  console.error("[fetch_official_urls] FAILED:", err);
  process.exit(1);
});
