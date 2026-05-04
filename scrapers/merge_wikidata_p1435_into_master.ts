/**
 * Union the P1435/direct-P31 sidecar fetch into the v2 master file.
 *
 * v2 (`data/_state/wikidata_attractions.json`) is the canonical attractions
 * dataset consumed by `merge_wikidata.ts` (which writes per-prefecture JSON).
 * The P1435 fetcher writes a sidecar at
 * `data/_state/wikidata_attractions_p1435.json`. This script unions the two
 * by qid, preserving v2 fields when present and adding the P1435-derived
 * fields (heritage_designations, source_anchor) onto matching records.
 *
 * Why a separate script: keeps the v2 fetcher's output stable (the fetcher
 * is idempotent for re-runs) and isolates the union to a single audit point.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MASTER_PATH = fileURLToPath(
  new URL("../data/_state/wikidata_attractions.json", import.meta.url),
);
const SIDECAR_PATH = fileURLToPath(
  new URL("../data/_state/wikidata_attractions_p1435.json", import.meta.url),
);

interface AttractionRecord {
  qid: string;
  wikidata_url?: string;
  name_ja?: string | null;
  name_en?: string | null;
  name_zh?: string | null;
  name_ko?: string | null;
  description_en?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  prefecture_code?: string;
  admin_code?: string | null;
  admin_name?: string | null;
  types?: string[];
  heritage_designations?: string[];
  source_anchor?: string;
  [key: string]: unknown;
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await readFile(p, "utf8")) as T;
}

function mergeRecord(
  base: AttractionRecord,
  add: AttractionRecord,
): AttractionRecord {
  const out: AttractionRecord = { ...base };
  out.name_ja = base.name_ja ?? add.name_ja ?? null;
  out.name_en = base.name_en ?? add.name_en ?? null;
  out.name_zh = base.name_zh ?? add.name_zh ?? null;
  out.name_ko = base.name_ko ?? add.name_ko ?? null;
  out.description_en = base.description_en ?? add.description_en ?? null;
  out.coordinates = base.coordinates ?? add.coordinates ?? null;
  out.prefecture_code = base.prefecture_code ?? add.prefecture_code ?? "";
  out.admin_code = base.admin_code ?? add.admin_code ?? null;
  out.admin_name = base.admin_name ?? add.admin_name ?? null;

  const types = new Set<string>([...(base.types ?? []), ...(add.types ?? [])]);
  out.types = Array.from(types);

  const heritages = new Set<string>([
    ...(base.heritage_designations ?? []),
    ...(add.heritage_designations ?? []),
  ]);
  out.heritage_designations = Array.from(heritages);

  // Track combined origin so downstream code can reason about coverage
  const baseAnchor = (base.source_anchor as string | undefined) ?? "v2";
  const addAnchor = (add.source_anchor as string | undefined) ?? "p1435";
  if (baseAnchor === addAnchor) {
    out.source_anchor = baseAnchor;
  } else {
    const combined = new Set<string>(
      [baseAnchor, addAnchor].flatMap((s) => s.split("+")),
    );
    out.source_anchor = Array.from(combined).sort().join("+");
  }

  return out;
}

async function main(): Promise<void> {
  const master = await readJson<{
    source: unknown;
    fetched_at?: string;
    started_at?: string;
    prefecture_prefixes_fetched?: string[];
    total_attractions?: number;
    multilingual_coverage?: unknown;
    coordinate_coverage?: unknown;
    attractions: AttractionRecord[];
  }>(MASTER_PATH);
  const sidecar = await readJson<{ attractions: AttractionRecord[] }>(
    SIDECAR_PATH,
  );

  const byQid = new Map<string, AttractionRecord>();
  for (const r of master.attractions) {
    if (!r.source_anchor) r.source_anchor = "v2";
    byQid.set(r.qid, r);
  }
  let added = 0;
  let merged = 0;
  for (const r of sidecar.attractions) {
    const cur = byQid.get(r.qid);
    if (!cur) {
      byQid.set(r.qid, { ...r, source_anchor: r.source_anchor ?? "p1435" });
      added += 1;
    } else {
      byQid.set(r.qid, mergeRecord(cur, r));
      merged += 1;
    }
  }

  const records = Array.from(byQid.values()).sort((a, b) =>
    a.qid.localeCompare(b.qid),
  );

  // Recompute coverage stats
  let withEn = 0,
    withZh = 0,
    withKo = 0,
    withCoord = 0;
  const byPref: Record<string, number> = {};
  for (const r of records) {
    if (r.name_en) withEn += 1;
    if (r.name_zh) withZh += 1;
    if (r.name_ko) withKo += 1;
    if (r.coordinates) withCoord += 1;
    const code = r.prefecture_code ?? "";
    byPref[code] = (byPref[code] ?? 0) + 1;
  }

  master.attractions = records;
  master.total_attractions = records.length;
  master.fetched_at = new Date().toISOString();
  master.multilingual_coverage = {
    total: records.length,
    en_pct: ((withEn / records.length) * 100).toFixed(1),
    zh_pct: ((withZh / records.length) * 100).toFixed(1),
    ko_pct: ((withKo / records.length) * 100).toFixed(1),
  };
  master.coordinate_coverage = {
    total: records.length,
    with_coords: withCoord,
    pct: ((withCoord / records.length) * 100).toFixed(1),
  };

  await writeFile(MASTER_PATH, JSON.stringify(master, null, 2), "utf8");
  console.error(
    `[union_p1435] master grew by ${added} (merged ${merged}). new total=${records.length}`,
  );
  const heritageCount = records.filter(
    (r) => (r.heritage_designations ?? []).length > 0,
  ).length;
  console.error(
    `[union_p1435] records with heritage_designations: ${heritageCount}`,
  );
}

main().catch((err) => {
  console.error("[union_p1435] FAILED:", err);
  process.exit(1);
});
