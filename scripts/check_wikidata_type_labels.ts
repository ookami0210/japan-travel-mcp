/**
 * Compare the attraction type list against live Wikidata labels.
 *
 * Fails (exit 1) when any QID in scrapers/lib/wikidata_attraction_types.ts
 * has a different English label on Wikidata than the one recorded, or no
 * label at all. Run it before merging any change to that list.
 *
 *   npx tsx scripts/check_wikidata_type_labels.ts
 */
import { ATTRACTION_TYPES } from "../scrapers/lib/wikidata_attraction_types.js";

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

async function main(): Promise<number> {
  const values = ATTRACTION_TYPES.map((t) => `wd:${t.qid}`).join(" ");
  const query = `
SELECT ?t ?label WHERE {
  VALUES ?t { ${values} }
  OPTIONAL { ?t rdfs:label ?label . FILTER(LANG(?label) = "en") }
}`.trim();
  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}&format=json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/sparql-results+json" },
  });
  if (!res.ok) {
    console.error(`Wikidata SPARQL HTTP ${res.status}`);
    return 2;
  }
  const json = (await res.json()) as {
    results: { bindings: Array<{ t: { value: string }; label?: { value: string } }> };
  };
  const live = new Map<string, string | null>();
  for (const b of json.results.bindings) {
    live.set(b.t.value.split("/").pop() ?? "", b.label?.value ?? null);
  }
  let bad = 0;
  for (const t of ATTRACTION_TYPES) {
    const got = live.get(t.qid) ?? null;
    const ok = got !== null && got.toLowerCase() === t.label.toLowerCase();
    if (!ok) bad += 1;
    console.log(`${ok ? "ok  " : "FAIL"} ${t.qid.padEnd(10)} expected "${t.label}" got ${got === null ? "(no label)" : `"${got}"`}`);
  }
  console.log(bad === 0 ? `all ${ATTRACTION_TYPES.length} labels match` : `${bad} mismatch(es)`);
  return bad === 0 ? 0 : 1;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(2);
});
