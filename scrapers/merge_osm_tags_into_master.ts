/**
 * Merge OSM-derived structured tags into the wikidata_attractions master.json.
 *
 * Reads:
 *   data/_state/osm_attraction_tags.json   ({ [qid]: { opening_hours, wheelchair, ... } })
 *   data/_state/wikidata_attractions.json  (master file)
 *
 * Writes (in-place):
 *   data/_state/wikidata_attractions.json
 *
 * Adds the following fields to each attraction (only when OSM has a value):
 *   - opening_hours          string (OSM opening_hours format, e.g. "Mo-Su 09:00-17:00")
 *   - wheelchair             "yes" | "no" | "limited"
 *   - tactile_paving         "yes" | "no"
 *   - phone                  string
 *   - website                string
 *   - email                  string
 *   - cuisine                string (";" separated)
 *   - fee                    "yes" | "no" | "donation"
 *   - internet_access        string
 *   - osm_ids                string[]   (provenance)
 *   - osm_tags_merged_at     ISO date (provenance)
 *
 * Idempotent: re-running overwrites the same fields with the latest OSM values.
 *
 * The downstream MCP server picks these up automatically through the
 * extended WikidataAttraction interface.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");
const OSM_FILE = resolve(REPO_ROOT, "data/_state/osm_attraction_tags.json");
const MASTER_FILE = resolve(REPO_ROOT, "data/_state/wikidata_attractions.json");

interface OsmRecord {
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
  internet_access?: string;
  smoking?: string;
}

const PICK: (keyof OsmRecord)[] = [
  "opening_hours",
  "wheelchair",
  "tactile_paving",
  "phone",
  "website",
  "email",
  "cuisine",
  "fee",
  "internet_access",
  "smoking",
];

async function main(): Promise<void> {
  if (!existsSync(OSM_FILE)) {
    process.stderr.write(`OSM file not found: ${OSM_FILE}. Run fetch_osm_attraction_tags.ts first.\n`);
    process.exit(1);
  }
  if (!existsSync(MASTER_FILE)) {
    process.stderr.write(`Master file not found: ${MASTER_FILE}.\n`);
    process.exit(1);
  }

  process.stderr.write(`Loading OSM tags from ${OSM_FILE}...\n`);
  const osm = JSON.parse(await readFile(OSM_FILE, "utf8")) as Record<string, OsmRecord>;
  process.stderr.write(`Loaded ${Object.keys(osm).length} OSM records.\n`);

  process.stderr.write(`Loading master from ${MASTER_FILE}...\n`);
  const master = JSON.parse(await readFile(MASTER_FILE, "utf8")) as {
    attractions: Record<string, unknown>[];
    [k: string]: unknown;
  };
  process.stderr.write(`Loaded ${master.attractions.length} attractions.\n`);

  const now = new Date().toISOString();
  let merged = 0;
  let openingHours = 0;
  let wheelchair = 0;
  let phone = 0;
  let website = 0;
  let fee = 0;
  for (const a of master.attractions) {
    const qid = a.qid as string;
    if (!qid) continue;
    const o = osm[qid];
    if (!o) continue;
    let touched = false;
    for (const k of PICK) {
      const v = o[k];
      if (v !== undefined && v !== null && v !== "") {
        (a as Record<string, unknown>)[k] = v;
        touched = true;
      }
    }
    if (o.osm_ids && o.osm_ids.length > 0) {
      (a as Record<string, unknown>).osm_ids = o.osm_ids;
      touched = true;
    }
    if (touched) {
      (a as Record<string, unknown>).osm_tags_merged_at = now;
      merged += 1;
      if (o.opening_hours) openingHours += 1;
      if (o.wheelchair) wheelchair += 1;
      if (o.phone) phone += 1;
      if (o.website) website += 1;
      if (o.fee) fee += 1;
    }
  }

  process.stderr.write(
    `Merged OSM tags into ${merged} / ${master.attractions.length} attractions.\n`,
  );
  process.stderr.write(
    `  opening_hours: ${openingHours}\n  wheelchair: ${wheelchair}\n  phone: ${phone}\n  website: ${website}\n  fee: ${fee}\n`,
  );

  const tmp = MASTER_FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(master, null, 2), "utf8");
  // Atomic rename
  await import("node:fs/promises").then((m) => m.rename(tmp, MASTER_FILE));
  process.stderr.write(`Wrote ${MASTER_FILE}\n`);
}

await main();
