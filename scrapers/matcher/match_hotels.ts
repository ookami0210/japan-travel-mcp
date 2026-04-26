/**
 * Hotel entity matcher.
 *
 * Inputs:  data/hotels/raw/wikidata.json
 *          data/hotels/raw/osm.json
 *
 * Algorithm:
 *   1st pass: group records within ~100m by coordinates (grid bucketing)
 *   2nd pass: name similarity within each group
 *   Confirmed match: phone match OR very-high name similarity (≥0.90)
 *   Likely match:    name similarity 0.65–0.90
 *   Unmatched:       singletons, written as standalone entries
 *
 * Postal codes are intentionally NOT used for confirmation — multiple
 * distinct properties commonly share a postal code (or the same building),
 * which produces false positives.
 *
 * Outputs: data/hotels/master.json   (confirmed-or-singleton entries)
 *          data/hotels/review/<id>.json  (likely matches needing human review)
 */

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = new URL("../../", import.meta.url);
const WIKIDATA_PATH = new URL("data/hotels/raw/wikidata.json", ROOT);
const OSM_PATH = new URL("data/hotels/raw/osm.json", ROOT);
const CENTROIDS_PATH = new URL(
  "data/_state/municipality_centroids.json",
  ROOT,
);
const MASTER_PATH = new URL("data/hotels/master.json", ROOT);
const REVIEW_DIR = new URL("data/hotels/review/", ROOT);

interface BaseHotel {
  source: "wikidata" | "osm";
  source_id: string;
  source_url: string;
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  street: string | null;
  postal_code: string | null;
  website: string | null;
  type: string | null;
  prefecture_code: string | null;
  raw: unknown;
}

interface WikidataHotel {
  qid: string;
  wikidata_url: string;
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  prefecture_code: string;
  phone: string | null;
  website: string | null;
  street_address: string | null;
  postal_code: string | null;
}

interface OsmHotel {
  osm_id: string;
  osm_url: string;
  type: string;
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  postal_code: string | null;
  street: string | null;
  phone: string | null;
  website: string | null;
}

interface MatchedRecord {
  id: string;
  confidence: "confirmed" | "singleton";
  match_reasons: string[];
  name: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  website: string | null;
  type: string | null;
  postal_code: string | null;
  street: string | null;
  prefecture_code: string | null;
  sources: { source: "wikidata" | "osm"; id: string; url: string }[];
}

interface ReviewRecord {
  id: string;
  confidence: "likely" | "ambiguous";
  match_reasons: string[];
  candidates: BaseHotel[];
}

// ─── Normalisation helpers ────────────────────────────────────────────

function normalizeName(name: string | null): string {
  if (!name) return "";
  return name
    .replace(
      /株式会社|有限会社|（株）|\(株\)|（有）|\(有\)|株式|合同会社|（合）/g,
      "",
    )
    .replace(
      /ホテル|hotel|旅館|ryokan|inn|ゲストハウス|guest\s*house|guesthouse|hostel|ホステル|民宿|温泉|リゾート|resort/gi,
      "",
    )
    .replace(/[\s　・·.,()（）&＆‐\-]/g, "")
    .toLowerCase()
    .trim();
}

function normalizePhone(p: string | null): string {
  if (!p) return "";
  return p.replace(/\D/g, "").slice(-10);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const m = a.length;
  const n = b.length;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  return 1 - dist / maxLen;
}

const EARTH_R = 6_371_000;
function haversine(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(h));
}

function gridKey(lat: number, lng: number): string {
  // ~111m × cos(lat) m grid at 0.001°
  return `${Math.round(lat * 1000)},${Math.round(lng * 1000)}`;
}

function neighborKeys(lat: number, lng: number): string[] {
  const lk = Math.round(lat * 1000);
  const gk = Math.round(lng * 1000);
  const out: string[] = [];
  for (let dl = -1; dl <= 1; dl++) {
    for (let dg = -1; dg <= 1; dg++) {
      out.push(`${lk + dl},${gk + dg}`);
    }
  }
  return out;
}

function bestName(a: string | null, b: string | null): string | null {
  if (a && !b) return a;
  if (!a && b) return b;
  if (!a && !b) return null;
  return (a as string).length >= (b as string).length ? a : b;
}

function makeId(...parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 12);
}

// ─── Loading ──────────────────────────────────────────────────────────

async function loadWikidata(): Promise<BaseHotel[]> {
  try {
    const f = JSON.parse(
      await readFile(fileURLToPath(WIKIDATA_PATH), "utf8"),
    ) as { hotels: WikidataHotel[] };
    return f.hotels.map((h) => ({
      source: "wikidata" as const,
      source_id: h.qid,
      source_url: h.wikidata_url,
      name: h.name_ja,
      name_en: h.name_en,
      name_zh: h.name_zh,
      name_ko: h.name_ko,
      coordinates: h.coordinates,
      phone: h.phone,
      street: h.street_address,
      postal_code: h.postal_code,
      website: h.website,
      type: null,
      prefecture_code: h.prefecture_code,
      raw: h,
    }));
  } catch (err) {
    console.error("[matcher] no wikidata source:", (err as Error).message);
    return [];
  }
}

async function loadOsm(): Promise<BaseHotel[]> {
  try {
    const f = JSON.parse(
      await readFile(fileURLToPath(OSM_PATH), "utf8"),
    ) as { hotels: OsmHotel[] };
    return f.hotels.map((h) => ({
      source: "osm" as const,
      source_id: h.osm_id,
      source_url: h.osm_url,
      name: h.name,
      name_en: h.name_en,
      name_zh: h.name_zh,
      name_ko: h.name_ko,
      coordinates: h.coordinates,
      phone: h.phone,
      street: h.street,
      postal_code: h.postal_code,
      website: h.website,
      type: h.type,
      prefecture_code: null,
      raw: h,
    }));
  } catch (err) {
    console.error("[matcher] no osm source:", (err as Error).message);
    return [];
  }
}

// ─── Main matcher ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const wd = await loadWikidata();
  const osm = await loadOsm();
  const all = [...wd, ...osm];
  console.error(
    `[matcher] inputs: wikidata=${wd.length}, osm=${osm.length}, total=${all.length}`,
  );

  // Load municipality centroids so we can attach a prefecture_code to OSM
  // hotels that lack one. The prefecture_code is the first two digits of the
  // nearest municipality centroid's code.
  let centroids: Record<string, { lat: number; lng: number }> = {};
  try {
    const f = JSON.parse(
      await readFile(fileURLToPath(CENTROIDS_PATH), "utf8"),
    ) as { centroids: Record<string, { lat: number; lng: number }> };
    centroids = f.centroids ?? {};
  } catch {
    /* missing — pref_code derivation will be skipped */
  }
  const centroidEntries = Object.entries(centroids);
  function nearestPrefecture(
    coord: { lat: number; lng: number },
  ): string | null {
    let bestDist = Infinity;
    let bestCode: string | null = null;
    for (const [code, c] of centroidEntries) {
      const d = haversine(coord, c);
      if (d < bestDist) {
        bestDist = d;
        bestCode = code.slice(0, 2);
      }
    }
    // Sanity check: if no municipality is within 30km, the point is
    // probably outside Japan (the bbox query catches some Korean/Chinese
    // border points). Don't assign a Japanese prefecture.
    if (bestDist > 30_000) return null;
    return bestCode;
  }

  // Attach prefecture_code to records missing it (typically OSM)
  for (const h of all) {
    if (!h.prefecture_code && h.coordinates) {
      h.prefecture_code = nearestPrefecture(h.coordinates);
    }
  }

  // Build grid index of records that have coordinates
  const grid = new Map<string, BaseHotel[]>();
  for (const h of all) {
    if (!h.coordinates) continue;
    const key = gridKey(h.coordinates.lat, h.coordinates.lng);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(h);
  }

  // Union-find over confirmed pairs
  const idOf = (h: BaseHotel) => `${h.source}/${h.source_id}`;
  const parent = new Map<string, string>();
  for (const h of all) parent.set(idOf(h), idOf(h));
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!;
      parent.set(cur, parent.get(p)!);
      cur = parent.get(cur)!;
    }
    return cur;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const reviewPairs: { a: BaseHotel; b: BaseHotel; reasons: string[] }[] = [];
  let confirmedPairs = 0;

  // Walk each grid cell, compare against itself + neighbors
  const seen = new Set<string>();
  for (const [key, records] of grid) {
    const candidates: BaseHotel[] = [...records];
    for (const nk of neighborKeys(records[0].coordinates!.lat, records[0].coordinates!.lng)) {
      if (nk === key) continue;
      const nb = grid.get(nk);
      if (nb) candidates.push(...nb);
    }
    for (let i = 0; i < records.length; i++) {
      for (let j = 0; j < candidates.length; j++) {
        const a = records[i];
        const b = candidates[j];
        if (a === b) continue;
        if (a.source === b.source && a.source_id === b.source_id) continue;
        const pairKey = [idOf(a), idOf(b)].sort().join("//");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        if (!a.coordinates || !b.coordinates) continue;
        const dist = haversine(a.coordinates, b.coordinates);
        if (dist > 100) continue;

        const reasons: string[] = [`distance ${Math.round(dist)}m`];
        const pa = normalizePhone(a.phone);
        const pb = normalizePhone(b.phone);
        const phoneMatch = pa && pb && pa === pb;

        const nameA =
          normalizeName(a.name) ||
          normalizeName(a.name_en) ||
          normalizeName(a.name_zh) ||
          normalizeName(a.name_ko);
        const nameB =
          normalizeName(b.name) ||
          normalizeName(b.name_en) ||
          normalizeName(b.name_zh) ||
          normalizeName(b.name_ko);
        const nameSim =
          nameA && nameB ? nameSimilarity(nameA, nameB) : 0;

        if (phoneMatch) {
          reasons.push("phone match");
          union(idOf(a), idOf(b));
          confirmedPairs += 1;
        } else if (nameSim >= 0.9) {
          reasons.push(`name similarity ${nameSim.toFixed(2)}`);
          union(idOf(a), idOf(b));
          confirmedPairs += 1;
        } else if (nameSim >= 0.65) {
          reasons.push(`name similarity ${nameSim.toFixed(2)} (likely)`);
          reviewPairs.push({ a, b, reasons });
        }
      }
    }
  }

  // Group by union-find root
  const clusters = new Map<string, BaseHotel[]>();
  for (const h of all) {
    const root = find(idOf(h));
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(h);
  }

  // Build master records
  const master: MatchedRecord[] = [];
  for (const [root, members] of clusters) {
    const isCluster = members.length > 1;
    const reasons: string[] = isCluster ? ["matched via union-find"] : [];
    const merged: MatchedRecord = {
      id: makeId(root),
      confidence: isCluster ? "confirmed" : "singleton",
      match_reasons: reasons,
      name: null,
      name_en: null,
      name_zh: null,
      name_ko: null,
      coordinates: null,
      phone: null,
      website: null,
      type: null,
      postal_code: null,
      street: null,
      prefecture_code: null,
      sources: [],
    };
    for (const m of members) {
      merged.name = bestName(merged.name, m.name);
      merged.name_en = bestName(merged.name_en, m.name_en);
      merged.name_zh = bestName(merged.name_zh, m.name_zh);
      merged.name_ko = bestName(merged.name_ko, m.name_ko);
      merged.coordinates = merged.coordinates ?? m.coordinates;
      merged.phone = merged.phone ?? m.phone;
      merged.website = merged.website ?? m.website;
      merged.type = merged.type ?? m.type;
      merged.postal_code = merged.postal_code ?? m.postal_code;
      merged.street = merged.street ?? m.street;
      merged.prefecture_code = merged.prefecture_code ?? m.prefecture_code;
      merged.sources.push({
        source: m.source,
        id: m.source_id,
        url: m.source_url,
      });
    }
    master.push(merged);
  }

  // Sort: confirmed first, then by name
  master.sort((x, y) => {
    if (x.confidence !== y.confidence)
      return x.confidence === "confirmed" ? -1 : 1;
    return (x.name ?? "").localeCompare(y.name ?? "");
  });

  // Stats
  const stats = {
    total: master.length,
    confirmed_clusters: master.filter((m) => m.confidence === "confirmed").length,
    singletons: master.filter((m) => m.confidence === "singleton").length,
    confirmed_pair_events: confirmedPairs,
    review_pairs: reviewPairs.length,
    with_coord: master.filter((m) => m.coordinates).length,
    with_name_en: master.filter((m) => m.name_en).length,
    with_phone: master.filter((m) => m.phone).length,
    with_website: master.filter((m) => m.website).length,
    by_source: {
      wikidata_only: master.filter(
        (m) => m.sources.every((s) => s.source === "wikidata"),
      ).length,
      osm_only: master.filter(
        (m) => m.sources.every((s) => s.source === "osm"),
      ).length,
      both: master.filter(
        (m) =>
          m.sources.some((s) => s.source === "wikidata") &&
          m.sources.some((s) => s.source === "osm"),
      ).length,
    },
  };

  console.error(`[matcher] stats:`, stats);

  // Write master
  const masterOut = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    sources: ["wikidata", "osm"],
    license: "Aggregation: CC BY 4.0; OSM data: ODbL 1.0; Wikidata: CC0",
    disclaimer:
      "Aggregation of public sources. Verify with the property before booking.",
    stats,
    hotels: master,
  };
  await mkdir(dirname(fileURLToPath(MASTER_PATH)), { recursive: true });
  await writeFile(
    fileURLToPath(MASTER_PATH),
    JSON.stringify(masterOut, null, 2),
    "utf8",
  );
  console.error(`[matcher] master saved → ${fileURLToPath(MASTER_PATH)}`);

  // Write review pairs (one file per pair)
  // Clean previous review files first
  try {
    await rm(fileURLToPath(REVIEW_DIR), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  await mkdir(fileURLToPath(REVIEW_DIR), { recursive: true });

  // Cap review file count to keep PR review tractable
  const MAX_REVIEW = 200;
  const reviewToWrite = reviewPairs.slice(0, MAX_REVIEW);
  for (const pair of reviewToWrite) {
    const id = makeId(idOf(pair.a), idOf(pair.b));
    const review: ReviewRecord = {
      id,
      confidence: "likely",
      match_reasons: pair.reasons,
      candidates: [pair.a, pair.b],
    };
    await writeFile(
      fileURLToPath(new URL(`${id}.json`, REVIEW_DIR)),
      JSON.stringify(review, null, 2),
      "utf8",
    );
  }
  console.error(
    `[matcher] review files saved: ${reviewToWrite.length} (capped at ${MAX_REVIEW} of ${reviewPairs.length} likely pairs)`,
  );
}

main().catch((err) => {
  console.error("[matcher] FAILED:", err);
  process.exit(1);
});
