/**
 * Merge Wikidata attractions into per-prefecture JSON files as a parallel
 * data layer.
 *
 * The municipality scraper produces `municipalities[].spots[]` from official
 * sites. This merger adds a top-level `wikidata_attractions` array sourced
 * from Wikidata SPARQL — providing multilingual labels, coordinates, and
 * Wikidata-traceable provenance even where municipal sites are sparse.
 *
 * Both layers coexist in each prefecture file so consumers can choose which
 * (or both) to use.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const PREF_DIR = new URL("data/prefectures/", ROOT);
const WIKIDATA_PATH = new URL("data/_state/wikidata_attractions.json", ROOT);

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

interface WikidataAttraction {
  qid: string;
  prefecture_code: string;
  [key: string]: unknown;
}

async function main(): Promise<void> {
  const wdRaw = JSON.parse(
    await readFile(fileURLToPath(WIKIDATA_PATH), "utf8"),
  ) as { attractions: WikidataAttraction[] };

  const byPref = new Map<string, WikidataAttraction[]>();
  for (const a of wdRaw.attractions) {
    const code = a.prefecture_code;
    if (!byPref.has(code)) byPref.set(code, []);
    byPref.get(code)!.push(a);
  }

  let updated = 0;
  for (const [code, attractions] of byPref) {
    const slug = PREFECTURE_SLUGS[code];
    if (!slug) continue;
    const path = new URL(`${slug}.json`, PREF_DIR);
    let pref: Record<string, unknown>;
    try {
      pref = JSON.parse(await readFile(fileURLToPath(path), "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      console.error(
        `[merge_wikidata] ${slug}: skipping (no prefecture file yet)`,
      );
      continue;
    }

    pref.wikidata_attractions = attractions;
    pref.data_as_of = new Date().toISOString();
    await writeFile(fileURLToPath(path), JSON.stringify(pref, null, 2), "utf8");
    const withEn = attractions.filter((a) => (a as { name_en?: string }).name_en).length;
    const withCoord = attractions.filter(
      (a) => (a as { coordinates?: unknown }).coordinates,
    ).length;
    console.error(
      `[merge_wikidata] ${slug}: +${attractions.length} Wikidata attractions (EN ${withEn}, coord ${withCoord})`,
    );
    updated += 1;
  }

  console.error(`[merge_wikidata] updated ${updated} prefecture files`);
}

main().catch((err) => {
  console.error("[merge_wikidata] FAILED:", err);
  process.exit(1);
});
