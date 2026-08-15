/**
 * One-shot (idempotent) category backfill over the prefecture corpus.
 *
 * Applies the deterministic spot classifier (scrapers/lib/spot_category.ts)
 * to every municipal spot whose `category` is null, plus area_id stamping
 * for any block that predates the stamping pass. Nightly scrapes get both
 * via mergePrefectureFile; this script brings the EXISTING corpus up to the
 * same contract without waiting a full re-scrape cycle.
 *
 * Usage: npx tsx scrapers/backfill_spot_categories.ts [--dry-run]
 */

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  readPrefFile,
  writePrefFileAtomic,
  stampAreaIds,
  stampCategories,
} from "./lib/pref_file.js";

const ROOT = new URL("../", import.meta.url);
const PREF_DIR = fileURLToPath(new URL("data/prefectures/", ROOT));

const SLUGS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima",
  "ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa",
  "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano", "gifu",
  "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara",
  "wakayama", "tottori", "shimane", "okayama", "hiroshima", "yamaguchi",
  "tokushima", "kagawa", "ehime", "kochi", "fukuoka", "saga", "nagasaki",
  "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
];

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  let totalSpots = 0;
  let filled = 0;
  for (const slug of SLUGS) {
    const path = resolve(PREF_DIR, `${slug}.json`);
    const file = await readPrefFile(path);
    if (!file) {
      console.warn(`[backfill] ${slug}: no file — skipped`);
      continue;
    }
    let before = 0;
    let after = 0;
    for (const block of file.municipalities ?? []) {
      stampAreaIds(block);
      for (const s of block.spots ?? []) {
        totalSpots += 1;
        if (s.category) before += 1;
      }
      stampCategories(block);
      for (const s of block.spots ?? []) {
        if (s.category) after += 1;
      }
    }
    filled += after - before;
    console.log(
      `[backfill] ${slug}: categorized ${before} → ${after}`,
    );
    if (!dryRun) await writePrefFileAtomic(path, file);
  }
  console.log(
    `[backfill] ${dryRun ? "(dry-run) " : ""}filled ${filled} categories across ${totalSpots} spots`,
  );
}

main().catch((err) => {
  console.error("[backfill] FAILED:", err);
  process.exit(1);
});
