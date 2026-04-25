/**
 * Fetch coordinates (P625) for each municipality from Wikidata.
 *
 * Used as the final fallback in the coordinate chain so that every
 * scraped tourist spot ends up with at least an approximate location
 * (the municipality's centroid), even when the page itself has no
 * geo metadata and the address can't be geocoded.
 *
 * Output: data/_state/municipality_centroids.json
 *   { "<6-digit code>": { lat, lng } }
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const PREFECTURE_PREFIXES = Array.from({ length: 47 }, (_, i) =>
  String(i + 1).padStart(2, "0"),
);

interface SparqlValue {
  value: string;
}
interface Binding {
  item?: SparqlValue;
  code?: SparqlValue;
  coord?: SparqlValue;
}

function buildQuery(prefix: string): string {
  return `
SELECT ?item ?code ?coord WHERE {
  ?item wdt:P429 ?code .
  FILTER(STRSTARTS(?code, "${prefix}"))
  ?item wdt:P625 ?coord .
}
LIMIT 5000
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

function parseWktPoint(v: string): { lat: number; lng: number } | null {
  const m = v.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  const lng = parseFloat(m[1]);
  const lat = parseFloat(m[2]);
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    lat < 20 ||
    lat > 50 ||
    lng < 120 ||
    lng > 150
  ) {
    return null;
  }
  return { lat, lng };
}

async function main(): Promise<void> {
  const centroids: Record<string, { lat: number; lng: number }> = {};

  for (const prefix of PREFECTURE_PREFIXES) {
    let attempt = 0;
    while (attempt < 3) {
      try {
        const bindings = await querySparql(buildQuery(prefix));
        let added = 0;
        for (const b of bindings) {
          const code = b.code?.value;
          const coordStr = b.coord?.value;
          if (!code || !coordStr) continue;
          const coord = parseWktPoint(coordStr);
          if (!coord) continue;
          if (!centroids[code]) {
            centroids[code] = coord;
            added += 1;
          }
        }
        console.error(
          `[centroids] pref ${prefix}: +${added} (running total: ${Object.keys(centroids).length})`,
        );
        break;
      } catch (err) {
        attempt += 1;
        console.error(
          `  pref ${prefix} attempt ${attempt} failed: ${(err as Error).message}`,
        );
        if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
      }
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const out = {
    source: SPARQL_ENDPOINT,
    fetched_at: new Date().toISOString(),
    total: Object.keys(centroids).length,
    centroids,
  };

  const outPath = fileURLToPath(
    new URL("../../data/_state/municipality_centroids.json", import.meta.url),
  );
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), "utf8");
  console.error(`[centroids] saved → ${outPath}`);
  console.error(`[centroids] TOTAL: ${Object.keys(centroids).length} centroids`);
}

main().catch((err) => {
  console.error("[centroids] FAILED:", err);
  process.exit(1);
});
