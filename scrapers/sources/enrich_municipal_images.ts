/**
 * Build the municipal page image layer (DATA_SOURCES.md #52) from the
 * prefecture files the municipal scrape writes. No network access: the
 * choice is made from the image URLs each page already stored (see
 * scrapers/lib/municipal_images.ts).
 *
 * Output: data/images/municipal/<slug>.json, one per prefecture file,
 * `{ prefecture, records: [{ key: "spot:<id>", images: [...] }] }`. The
 * output is deterministic (no timestamps, sorted), so an unchanged
 * prefecture produces a byte-identical file and the dataset upload skips it.
 *
 * Run: npx tsx scrapers/sources/enrich_municipal_images.ts
 *      PREF_DIR=/path/to/prefectures npx tsx scrapers/sources/enrich_municipal_images.ts
 */

import { mkdir, readdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildMunicipalImageRecords, type MunicipalSpotInput } from "../lib/municipal_images.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../..");
const PREF_DIR = process.env.PREF_DIR ?? resolve(REPO_ROOT, "data/prefectures");
const OUT_DIR = resolve(REPO_ROOT, "data/images/municipal");

interface PrefectureFile {
  prefecture?: { code?: string; name?: string };
  municipalities?: Array<{ spots?: MunicipalSpotInput[] | null } | null> | null;
}

async function main(): Promise<void> {
  const names = (await readdir(PREF_DIR)).filter((n) => n.endsWith(".json") && !n.includes(" ")).sort();
  await mkdir(OUT_DIR, { recursive: true });
  let spotsTotal = 0;
  let kept = 0;
  let failed = 0;
  for (const name of names) {
    let file: PrefectureFile;
    try {
      file = JSON.parse(await readFile(resolve(PREF_DIR, name), "utf8")) as PrefectureFile;
    } catch (err) {
      // One unreadable prefecture leaves its previous image file in place.
      failed += 1;
      console.error(`[municipal_images] ${name}: unreadable (${(err as Error).message}); kept previous output`);
      continue;
    }
    const spots = (file.municipalities ?? []).flatMap((m) => (m?.spots ?? []).filter(Boolean));
    const records = buildMunicipalImageRecords(spots);
    spotsTotal += spots.length;
    kept += records.length;
    const out = resolve(OUT_DIR, `${basename(name, ".json")}.json`);
    const tmp = `${out}.tmp`;
    await writeFile(tmp, JSON.stringify({ prefecture: file.prefecture?.code ?? null, records }));
    await rename(tmp, out);
  }
  console.log(
    `[municipal_images] ${names.length - failed}/${names.length} prefectures, ${kept}/${spotsTotal} spots with an image`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
