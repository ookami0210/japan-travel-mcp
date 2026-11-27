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
 * (or both) to use. `get_spots` reads the prefecture files, so a master
 * refresh reaches it only through this merge; the steady scrape runs it every
 * night, after the prefecture files are restored from the dataset.
 *
 * The master decides the Wikidata rows: a row the refreshed master no longer
 * holds leaves the prefecture file. Rows that the inject scripts put into the
 * files (`INJECTED_ANCHORS`) are not fetched from Wikidata, so a master
 * refresh does not carry them; they stay.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

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

/** `source_anchor` values the scripts in `scripts/inject_*.py` give the rows they add. */
export const INJECTED_ANCHORS: ReadonlySet<string> = new Set([
  "bunka_kunishitei",
  "landmark_by_name",
  "wikidata_national_park",
  "wikidata_shukubo",
]);

/**
 * A prefecture whose merged layer would be smaller than this share of the
 * current one is left as it is: a master that lost most of a prefecture is a
 * broken fetch, not a change in Wikidata.
 */
export const MIN_KEPT_SHARE = 0.5;

export interface WikidataAttraction {
  qid: string;
  prefecture_code: string;
  source_anchor?: string | null;
  [key: string]: unknown;
}

export interface PrefectureMerge {
  rows: WikidataAttraction[];
  /** Injected rows the master does not hold, kept from the current file. */
  keptInjected: number;
  /** Current rows the master no longer holds, dropped. */
  dropped: number;
  /** True when the merge was refused by the collapse guard. */
  refused: boolean;
}

/** The prefecture's new `wikidata_attractions`: the master's rows, then the injected rows it lacks. */
export function mergePrefecture(
  current: readonly WikidataAttraction[],
  fromMaster: readonly WikidataAttraction[],
): PrefectureMerge {
  const inMaster = new Set(fromMaster.map((a) => a.qid));
  const notInMaster = current.filter((a) => !inMaster.has(a.qid));
  const injected = notInMaster.filter((a) => INJECTED_ANCHORS.has(String(a.source_anchor ?? "")));
  const rows = [...fromMaster, ...injected];
  const refused = current.length > 0 && rows.length < current.length * MIN_KEPT_SHARE;
  return {
    rows: refused ? [...current] : rows,
    keptInjected: injected.length,
    dropped: notInMaster.length - injected.length,
    refused,
  };
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
  let refused = 0;
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

    const current = (pref.wikidata_attractions as WikidataAttraction[] | undefined) ?? [];
    const merged = mergePrefecture(current, attractions);
    if (merged.refused) {
      console.error(
        `[merge_wikidata] ${slug}: REFUSED (${current.length} → ${merged.keptInjected + attractions.length} rows); file left as it is`,
      );
      refused += 1;
      continue;
    }

    pref.wikidata_attractions = merged.rows;
    pref.data_as_of = new Date().toISOString();
    await writeFile(fileURLToPath(path), JSON.stringify(pref, null, 2), "utf8");
    console.error(
      `[merge_wikidata] ${slug}: ${current.length} → ${merged.rows.length} Wikidata attractions (master ${attractions.length}, injected kept ${merged.keptInjected}, dropped ${merged.dropped})`,
    );
    updated += 1;
  }

  console.error(`[merge_wikidata] updated ${updated} prefecture files, refused ${refused}`);
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("[merge_wikidata] FAILED:", err);
    process.exit(1);
  });
}
