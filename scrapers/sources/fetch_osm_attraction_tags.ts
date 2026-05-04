/**
 * Fetch structured tags (opening_hours / wheelchair / phone / website /
 * cuisine / fee / ...) for Japanese attractions from OpenStreetMap, joined
 * to Wikidata QIDs via the OSM `wikidata=Q*****` tag.
 *
 * Endpoint: https://overpass-api.de/api/interpreter
 *
 * Strategy:
 *   - One Overpass query per 1° latitude band (Japan ranges roughly 20-46N).
 *   - Filter on `wikidata` tag presence (= OSM editors have linked the
 *     element to a Wikidata Q-id explicitly). Keeps the join exact, no
 *     fuzzy name match.
 *   - Aggregate across bands → `data/_state/osm_attraction_tags.json`,
 *     keyed by QID. When multiple OSM elements share a QID (way + node
 *     pair etc.), prefer the most-tagged record and merge tag values
 *     non-destructively.
 *
 * Output shape:
 *   {
 *     "Q188754": {
 *       "qid": "Q188754",
 *       "osm_ids": ["way/12345", "node/67890"],
 *       "opening_hours": "Mo-Su 09:00-17:00",
 *       "wheelchair": "yes",
 *       "phone": "+81-...",
 *       "website": "https://...",
 *       "cuisine": null,
 *       "fee": "yes",
 *       "fee:adult": "1000",
 *       "tactile_paving": "yes",
 *       "internet_access": "wlan",
 *       "raw_tags": { ... full OSM tags ... }
 *     },
 *     ...
 *   }
 *
 * Used by Phase A constraint-encodable structured fields work (iter58).
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT =
  "JapanTravelMCP/0.0.1 (+https://github.com/ookami0210/japan-travel-mcp)";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const OUT_FILE = resolve(REPO_ROOT, "data/_state/osm_attraction_tags.json");
const STATE_DIR = resolve(REPO_ROOT, "data/_state/osm_attraction_tags.partial");

// Latitude bands. Japan main islands + Okinawa + Ogasawara span 20-46°N.
// One band = 2° lat × full Japan lon. Each band runs as one Overpass query.
function latBands(): { south: number; north: number; label: string }[] {
  const out: { south: number; north: number; label: string }[] = [];
  for (let s = 20; s < 46; s += 2) {
    out.push({ south: s, north: s + 2, label: `${s}-${s + 2}` });
  }
  return out;
}

// Lon bounds: Ogasawara reaches 142.3, Okinotori is 136.05/20.42, but for
// the wikidata-tag join we only care about populated land. Cover 122-154.
const LON_W = 122;
const LON_E = 154;

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

interface MergedRecord {
  qid: string;
  osm_ids: string[];
  opening_hours?: string;
  wheelchair?: string;
  tactile_paving?: string;
  phone?: string;
  website?: string;
  email?: string;
  cuisine?: string;
  fee?: string;
  // Many sites use fee:adult / fee:child colon-tags. Keep them as raw.
  internet_access?: string;
  smoking?: string;
  /** Full last-merged OSM tags for downstream extractors. */
  raw_tags: Record<string, string>;
}

const PICK_FIELDS = [
  "opening_hours",
  "wheelchair",
  "tactile_paving",
  "phone",
  "contact:phone",
  "website",
  "contact:website",
  "email",
  "contact:email",
  "cuisine",
  "fee",
  "internet_access",
  "smoking",
] as const;

function buildQuery(south: number, north: number): string {
  // Only fetch elements that ARE wikidata-tagged. Drastically cuts the
  // result size vs. tourism=*/historic=* unfiltered scan, and gives us
  // the exact join key.
  return `
[out:json][timeout:600];
(
  node["wikidata"](${south},${LON_W},${north},${LON_E});
  way["wikidata"](${south},${LON_W},${north},${LON_E});
  relation["wikidata"](${south},${LON_W},${north},${LON_E});
);
out tags center;
`;
}

async function fetchBand(south: number, north: number, label: string): Promise<OverpassElement[]> {
  const partialPath = resolve(STATE_DIR, `band_${label}.json`);
  if (existsSync(partialPath)) {
    const raw = await readFile(partialPath, "utf8");
    const parsed = JSON.parse(raw) as OverpassResponse;
    return parsed.elements;
  }
  const body = `data=${encodeURIComponent(buildQuery(south, north))}`;
  let attempt = 0;
  while (true) {
    attempt += 1;
    process.stderr.write(`[band ${label}] attempt ${attempt}\n`);
    const t0 = Date.now();
    try {
      const r = await fetch(OVERPASS_ENDPOINT, {
        method: "POST",
        headers: {
          "User-Agent": USER_AGENT,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: AbortSignal.timeout(700_000),
      });
      if (!r.ok) {
        if (r.status === 429 || r.status === 504 || r.status === 502) {
          const backoff = Math.min(60_000, 5000 * 2 ** Math.min(attempt, 5));
          process.stderr.write(`  ${r.status} → sleep ${backoff}ms\n`);
          await new Promise((res) => setTimeout(res, backoff));
          continue;
        }
        throw new Error(`overpass returned ${r.status}: ${await r.text().catch(() => "?")}`);
      }
      const json = (await r.json()) as OverpassResponse;
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      process.stderr.write(`  band ${label} ok: ${json.elements.length} elements in ${dt}s\n`);
      await mkdir(STATE_DIR, { recursive: true });
      await writeFile(partialPath, JSON.stringify(json), "utf8");
      return json.elements;
    } catch (e) {
      if (attempt >= 6) throw e;
      const backoff = Math.min(60_000, 5000 * 2 ** Math.min(attempt, 5));
      process.stderr.write(`  error ${(e as Error).message} → sleep ${backoff}ms\n`);
      await new Promise((res) => setTimeout(res, backoff));
    }
  }
}

function elementId(el: OverpassElement): string {
  return `${el.type}/${el.id}`;
}

function tagScore(tags: Record<string, string> | undefined): number {
  if (!tags) return 0;
  // More tags = more useful. Slight extra weight for our PICK fields.
  let s = Object.keys(tags).length;
  for (const k of PICK_FIELDS) if (tags[k]) s += 5;
  return s;
}

async function main(): Promise<void> {
  const bands = latBands();
  const merged = new Map<string, MergedRecord>();
  for (const b of bands) {
    let elements: OverpassElement[];
    try {
      elements = await fetchBand(b.south, b.north, b.label);
    } catch (e) {
      process.stderr.write(`band ${b.label} permanently failed: ${(e as Error).message}. continuing.\n`);
      continue;
    }
    let countWithQid = 0;
    for (const el of elements) {
      const qid = el.tags?.["wikidata"];
      if (!qid || !/^Q\d+$/.test(qid)) continue;
      countWithQid += 1;
      const existing = merged.get(qid);
      const ourScore = tagScore(el.tags);
      const ourTags = el.tags ?? {};
      if (!existing) {
        const rec: MergedRecord = {
          qid,
          osm_ids: [elementId(el)],
          raw_tags: { ...ourTags },
        };
        for (const k of PICK_FIELDS) if (ourTags[k]) (rec as Record<string, unknown>)[k.replace(/^contact:/, "")] = ourTags[k];
        merged.set(qid, rec);
      } else {
        existing.osm_ids.push(elementId(el));
        // Merge non-destructively: prefer existing values, fill gaps from
        // new element when richer.
        const existingScore = tagScore(existing.raw_tags);
        if (ourScore > existingScore) {
          existing.raw_tags = { ...existing.raw_tags, ...ourTags };
        } else {
          existing.raw_tags = { ...ourTags, ...existing.raw_tags };
        }
        for (const k of PICK_FIELDS) {
          const slot = k.replace(/^contact:/, "");
          if (!(slot in existing) && ourTags[k]) {
            (existing as Record<string, unknown>)[slot] = ourTags[k];
          }
        }
      }
    }
    process.stderr.write(`  band ${b.label}: ${countWithQid} wikidata-tagged elements\n`);
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  const out: Record<string, MergedRecord> = {};
  for (const [qid, rec] of merged) out[qid] = rec;
  await writeFile(OUT_FILE, JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    `\nDone: ${Object.keys(out).length} unique QIDs with OSM tags written to ${OUT_FILE}\n`,
  );
}

await main();
