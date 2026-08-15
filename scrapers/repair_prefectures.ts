/**
 * Prefecture-file corpus repair.
 *
 * Rebuilds each data/prefectures/<slug>.json as the union of:
 *   1. a BASE directory of historical full files (--base, e.g. an operator
 *      checkout from before the nightly-clobber incident), and
 *   2. the CURRENT files already in data/prefectures/ (fresher scrapes,
 *      typically just prefetched from the HF dataset), and
 *   3. the master wikidata_attractions corpus from _state (SSOT, carries the
 *      OSM/Wikipedia enrichment), re-attached per prefecture.
 *
 * Municipality blocks are unioned by code with newest-wins recency (see
 * scrapers/lib/pref_file.ts). area_id is stamped on every spot. The result
 * is written atomically and is ready for a targeted HF upload.
 *
 * Usage:
 *   npx tsx scrapers/repair_prefectures.ts --base /path/to/historical/prefectures
 *   npx tsx scrapers/repair_prefectures.ts --base ... --dry-run
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  mergePrefectureFile,
  readPrefFile,
  writePrefFileAtomic,
  stampAreaIds,
  type PrefFileShape,
  type PrefFileMuniBlock,
} from "./lib/pref_file.js";

const ROOT = new URL("../", import.meta.url);
const PREF_DIR = fileURLToPath(new URL("data/prefectures/", ROOT));
const MASTER_PATH = fileURLToPath(
  new URL("data/_state/wikidata_attractions.json", ROOT),
);

const PREFECTURE_SLUGS: Record<string, string> = {
  "01": "hokkaido", "02": "aomori", "03": "iwate", "04": "miyagi",
  "05": "akita", "06": "yamagata", "07": "fukushima", "08": "ibaraki",
  "09": "tochigi", "10": "gunma", "11": "saitama", "12": "chiba",
  "13": "tokyo", "14": "kanagawa", "15": "niigata", "16": "toyama",
  "17": "ishikawa", "18": "fukui", "19": "yamanashi", "20": "nagano",
  "21": "gifu", "22": "shizuoka", "23": "aichi", "24": "mie",
  "25": "shiga", "26": "kyoto", "27": "osaka", "28": "hyogo",
  "29": "nara", "30": "wakayama", "31": "tottori", "32": "shimane",
  "33": "okayama", "34": "hiroshima", "35": "yamaguchi", "36": "tokushima",
  "37": "kagawa", "38": "ehime", "39": "kochi", "40": "fukuoka",
  "41": "saga", "42": "nagasaki", "43": "kumamoto", "44": "oita",
  "45": "miyazaki", "46": "kagoshima", "47": "okinawa",
};

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main(): Promise<void> {
  const baseDir = argValue("--base");
  const dryRun = process.argv.includes("--dry-run");
  if (!baseDir) {
    console.error(
      "Usage: repair_prefectures --base <dir-of-historical-prefecture-jsons> [--dry-run]",
    );
    process.exit(2);
  }

  // Master attraction corpus (SSOT, with OSM/Wikipedia enrichment).
  const master = JSON.parse(await readFile(MASTER_PATH, "utf8")) as {
    attractions?: Array<{ prefecture_code?: string }>;
  };
  const attractionsByPref = new Map<string, unknown[]>();
  for (const a of master.attractions ?? []) {
    const code = a.prefecture_code;
    if (!code) continue;
    let bucket = attractionsByPref.get(code);
    if (!bucket) {
      bucket = [];
      attractionsByPref.set(code, bucket);
    }
    bucket.push(a);
  }
  console.log(
    `[repair] master attractions: ${master.attractions?.length ?? 0} across ${attractionsByPref.size} prefectures`,
  );

  let repaired = 0;
  for (const [code, slug] of Object.entries(PREFECTURE_SLUGS)) {
    const basePath = resolve(baseDir, `${slug}.json`);
    const currentPath = resolve(PREF_DIR, `${slug}.json`);
    const base = await readPrefFile(basePath);
    const current = await readPrefFile(currentPath);
    if (!base && !current) {
      console.warn(`[repair] ${slug}: no base and no current file — skipped`);
      continue;
    }

    const prefName =
      current?.prefecture?.name ?? base?.prefecture?.name ?? slug;
    // Union: base (historical full) as existing, current blocks merged in.
    // Recency rule keeps whichever copy of a municipality is newest.
    const merged = mergePrefectureFile(base, {
      prefCode: code,
      prefName,
      slug,
      results: (current?.municipalities ?? []) as PrefFileMuniBlock[],
    });
    // Base-carried blocks predate area_id stamping — stamp everything.
    for (const block of merged.municipalities ?? []) stampAreaIds(block);
    // Re-attach the attraction layer from the master (SSOT wins over any
    // stale copy either input carried).
    merged.wikidata_attractions = attractionsByPref.get(code) ?? [];

    const muniCount = merged.municipalities?.length ?? 0;
    const spotCount = (merged.municipalities ?? []).reduce(
      (n, m) => n + (m.spots?.length ?? 0),
      0,
    );
    const attrCount = merged.wikidata_attractions.length;
    console.log(
      `[repair] ${slug}: munis=${muniCount} (base=${base?.municipalities?.length ?? 0}, current=${current?.municipalities?.length ?? 0}) spots=${spotCount} attractions=${attrCount}`,
    );
    if (attrCount === 0) {
      console.warn(`[repair] ${slug}: ⚠️ zero attractions from master`);
    }
    if (!dryRun) {
      await writePrefFileAtomic(currentPath, merged as PrefFileShape);
      repaired += 1;
    }
  }
  console.log(
    dryRun
      ? "[repair] dry-run complete (nothing written)"
      : `[repair] wrote ${repaired} prefecture files`,
  );
}

main().catch((err) => {
  console.error("[repair] FAILED:", err);
  process.exit(1);
});
