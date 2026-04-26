/**
 * One-shot patch: recompute prefecture_codes for existing R-3 records using
 * the latest (stricter) extraction rule. Avoids a full re-fetch of the upstream
 * sites when only the prefecture-resolution logic has changed.
 *
 * Run:
 *   npx tsx scrapers/sources/recompute_prefecture_codes.ts
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  extractPrefectureCodes,
  loadMunicipalityRows,
  loadPrefectureRows,
} from "../lib/prefecture_match.js";

const ROOT = new URL("../../", import.meta.url);

interface MaffGiRec {
  production_area_text: string | null;
  prefecture_codes: string[];
}
interface MetiRec {
  production_area_text: string | null;
  prefecture_codes: string[];
}
interface JhRec {
  related_areas_text: string | null;
  body_ja: string | null;
  summary_ja: string | null;
  title_ja: string;
  prefecture_codes: string[];
}

async function patch<T>(
  file: string,
  recompute: (
    r: T,
    prefRows: Awaited<ReturnType<typeof loadPrefectureRows>>,
    muniRows: Awaited<ReturnType<typeof loadMunicipalityRows>>,
  ) => string[],
): Promise<void> {
  const path = fileURLToPath(new URL(`data/r3/${file}`, ROOT));
  const json = JSON.parse(await readFile(path, "utf8")) as {
    records: T[];
  };
  const prefRows = await loadPrefectureRows();
  const muniRows = await loadMunicipalityRows();
  let changed = 0;
  for (const r of json.records) {
    const before = JSON.stringify((r as { prefecture_codes: string[] }).prefecture_codes);
    (r as { prefecture_codes: string[] }).prefecture_codes = recompute(
      r,
      prefRows,
      muniRows,
    );
    const after = JSON.stringify((r as { prefecture_codes: string[] }).prefecture_codes);
    if (before !== after) changed += 1;
  }
  await writeFile(path, JSON.stringify(json, null, 2), "utf8");
  console.error(`[recompute] ${file}: changed ${changed}/${json.records.length} records`);
}

async function main(): Promise<void> {
  await patch<MaffGiRec>("maff_gi.json", (r, p, m) =>
    r.production_area_text ? extractPrefectureCodes(r.production_area_text, p, m) : [],
  );
  await patch<MetiRec>("meti_densan.json", (r, p, m) =>
    r.production_area_text ? extractPrefectureCodes(r.production_area_text, p, m) : [],
  );
  await patch<JhRec>("japan_heritage.json", (r, p, m) =>
    extractPrefectureCodes(
      [r.related_areas_text ?? "", r.body_ja ?? "", r.summary_ja ?? "", r.title_ja].join(" "),
      p,
      m,
    ),
  );
}

main().catch((err) => {
  console.error("[recompute] FAILED:", err);
  process.exit(1);
});
