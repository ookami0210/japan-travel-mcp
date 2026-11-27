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
 * The master decides which Wikidata rows a file holds: a row the refreshed
 * master no longer holds leaves the file. A row both hold keeps the fields
 * only the file has (OSM tags, opening hours, descriptions, written by the
 * enrichment scripts), with the master's values over them. Rows the inject
 * scripts added (`isInjected`) are not fetched from Wikidata, so a master
 * refresh does not carry them; they stay.
 *
 * A file is written only when its rows change, so an unchanged prefecture
 * keeps its bytes and the upload skips it.
 */

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PREFECTURE_SLUGS } from "./lib/prefectures.js";
import { notify } from "./lib/slack.js";

const ROOT = new URL("../", import.meta.url);
const PREF_DIR = new URL("data/prefectures/", ROOT);
const WIKIDATA_PATH = new URL("data/_state/wikidata_attractions.json", ROOT);

/** `source_anchor` values the scripts in `scripts/inject_*.py` give the rows they add. */
export const INJECTED_ANCHORS: ReadonlySet<string> = new Set([
  "bunka_kunishitei",
  "landmark_by_name",
  "manual_canonical_injection",
  "wikidata_national_park",
  "wikidata_shukubo",
  "wikipedia_category",
]);

/** `inject_wikipedia_lists.py` anchors its rows as `wikipedia_list:<list title>`. */
const INJECTED_PREFIXES: readonly string[] = ["wikipedia_list:"];

export function isInjected(anchor: unknown): boolean {
  const a = String(anchor ?? "");
  return INJECTED_ANCHORS.has(a) || INJECTED_PREFIXES.some((p) => a.startsWith(p));
}

/**
 * A prefecture whose master rows are fewer than this share of the file's
 * current Wikidata rows (injected ones aside) is left as it is: a master that
 * lost most of a prefecture is a broken fetch, not a change in Wikidata.
 * `MERGE_WIKIDATA_ALLOW_SHRINK=1` lets an intended shrink through.
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
  /** Current Wikidata rows the master no longer holds, dropped. */
  dropped: number;
  /** True when the merge was refused by the collapse guard. */
  refused: boolean;
  /** True when `rows` differ from the current file's. */
  changed: boolean;
}

/** The file's row with the master's values over it; a master null does not erase a value. */
function overlay(current: WikidataAttraction | undefined, master: WikidataAttraction): WikidataAttraction {
  if (!current) return master;
  const row: WikidataAttraction = { ...current };
  for (const [key, value] of Object.entries(master)) {
    if (value !== null && value !== undefined) row[key] = value;
  }
  return row;
}

/** The prefecture's new `wikidata_attractions`: the master's rows, then the injected rows it lacks. */
export function mergePrefecture(
  current: readonly WikidataAttraction[],
  fromMaster: readonly WikidataAttraction[],
  { allowShrink = false }: { allowShrink?: boolean } = {},
): PrefectureMerge {
  const byQid = new Map(current.map((a) => [a.qid, a]));
  const inMaster = new Set(fromMaster.map((a) => a.qid));
  const notInMaster = current.filter((a) => !inMaster.has(a.qid));
  const injected = notInMaster.filter((a) => isInjected(a.source_anchor));
  const wikidataNow = current.filter((a) => !isInjected(a.source_anchor)).length;
  const refused = !allowShrink && wikidataNow > 0 && fromMaster.length < wikidataNow * MIN_KEPT_SHARE;
  const rows = refused ? [...current] : [...fromMaster.map((m) => overlay(byQid.get(m.qid), m)), ...injected];
  return {
    rows,
    keptInjected: injected.length,
    dropped: notInMaster.length - injected.length,
    refused,
    changed: !refused && JSON.stringify(rows) !== JSON.stringify(current),
  };
}

async function main(): Promise<void> {
  const allowShrink = process.env.MERGE_WIKIDATA_ALLOW_SHRINK === "1";
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
  let unchanged = 0;
  const refused: string[] = [];
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
    const merged = mergePrefecture(current, attractions, { allowShrink });
    if (merged.refused) {
      console.error(
        `[merge_wikidata] ${slug}: REFUSED (master ${attractions.length} rows against ${current.length} in the file); file left as it is`,
      );
      refused.push(`${slug} (${current.length} → master ${attractions.length})`);
      continue;
    }
    if (!merged.changed) {
      unchanged += 1;
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

  console.error(
    `[merge_wikidata] updated ${updated} prefecture files, unchanged ${unchanged}, refused ${refused.length}`,
  );
  if (refused.length > 0) {
    await notify(
      `merge_wikidata refused ${refused.length} prefecture file(s), left stale: ${refused.join(", ")}. ` +
        "If the shrink is intended, run it with MERGE_WIKIDATA_ALLOW_SHRINK=1.",
      "warn",
    );
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("[merge_wikidata] FAILED:", err);
    process.exit(1);
  });
}
