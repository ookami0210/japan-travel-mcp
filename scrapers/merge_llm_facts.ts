/**
 * Fold the local-model results into the official-page facts file.
 *
 * The deterministic pass wrote one record per entity; the model pass wrote
 * one validated record per queued entity. This merge fills only the fields
 * the deterministic readers left empty, so a value a page stated in a form
 * the rules understood is never replaced by the model's reading of it.
 *
 * Input : data/facts/official_page_facts.jsonl      (deterministic pass)
 *         data/facts/official_page_facts.llm.jsonl  (model pass)
 * Output: data/facts/official_page_facts.jsonl      (rewritten in place)
 *
 * Run: npx tsx scrapers/merge_llm_facts.ts
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractHours, normalizeJa } from "./lib/ja_hours_rules.js";
import type { OfficialPageFacts } from "./lib/official_page_facts.js";

/**
 * The model locates the hours sentence; the deterministic rules structure
 * it. A string the rules cannot turn into OSM syntax is not used, so the
 * model never writes a schedule the rules would not have accepted.
 */
export function modelHoursToOsm(raw: string): string | null {
  const text = normalizeJa(raw.trim());
  // Already OSM syntax ("Mo-Fr 09:00-17:00; Sa off")?
  if (/^[A-Za-z0-9:;,\-\s]+$/.test(text) && /\d{2}:\d{2}-\d{2}:\d{2}/.test(text)) {
    return text;
  }
  const r = extractHours(`営業時間 ${text.replace(/;/g, " ")}`);
  return r && !r.ambiguous ? r.opening_hours : null;
}

const ROOT = new URL("../", import.meta.url);
const MAIN = fileURLToPath(new URL("data/facts/official_page_facts.jsonl", ROOT));
const LLM = fileURLToPath(new URL("data/facts/official_page_facts.llm.jsonl", ROOT));

interface LlmRow {
  id: string;
  model?: string;
  opening_hours: string | null;
  open_every_day: boolean;
  adult_jpy: number | null;
  child_jpy: number | null;
  free: boolean;
  from_jpy: number | null;
  checkin: string | null;
  checkout: string | null;
  evidence: string[];
}

async function readJsonl<T>(path: string): Promise<T[]> {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of (await readFile(path, "utf8")).split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // skip torn lines
    }
  }
  return out;
}

async function main(): Promise<void> {
  const main = await readJsonl<OfficialPageFacts>(MAIN);
  const llm = await readJsonl<LlmRow>(LLM);
  const byId = new Map(main.map((r) => [r.id, r]));
  // The last model row per id wins (re-runs append).
  const latest = new Map<string, LlmRow>();
  for (const row of llm) latest.set(row.id, row);

  let filledHours = 0;
  let filledPrice = 0;
  let filledLodging = 0;
  for (const [id, row] of latest) {
    const rec = byId.get(id);
    if (!rec) continue;
    let touched = false;
    const osm = row.opening_hours ? modelHoursToOsm(row.opening_hours) : null;
    if (!rec.opening_hours && osm && rec.layer !== "hotel") {
      rec.opening_hours = osm;
      rec.hours_evidence = [...rec.hours_evidence, ...row.evidence];
      filledHours += 1;
      touched = true;
    }
    if (!rec.open_every_day && row.open_every_day) {
      rec.open_every_day = true;
      touched = true;
    }
    // A restaurant page's amounts are menu items, not an admission price.
    const priceWanted = rec.layer !== "food";
    if (priceWanted && !rec.price && (row.adult_jpy || row.child_jpy || row.from_jpy || row.free)) {
      rec.price = {
        adult_jpy: row.adult_jpy,
        child_jpy: row.child_jpy,
        free: row.free,
        from_jpy: row.from_jpy,
      };
      rec.price_evidence = [...rec.price_evidence, ...row.evidence];
      filledPrice += 1;
      touched = true;
    }
    if (rec.layer === "hotel" && !rec.lodging && (row.checkin || row.checkout)) {
      rec.lodging = { checkin: row.checkin, checkout: row.checkout };
      filledLodging += 1;
      touched = true;
    }
    if (touched && rec.method === "none") rec.method = "llm_local";
    const hoursMissing = rec.layer === "hotel" ? !rec.lodging : !rec.opening_hours;
    rec.needs_llm = hoursMissing || (!rec.price && !rec.price_range_raw);
  }

  const tmp = `${MAIN}.tmp`;
  await writeFile(tmp, `${[...byId.values()].map((r) => JSON.stringify(r)).join("\n")}\n`, "utf8");
  await rename(tmp, MAIN);
  console.error(
    `[merge_llm_facts] ${latest.size} model rows; filled hours ${filledHours}, price ${filledPrice}, check-in/out ${filledLodging}; ${byId.size} records written`,
  );
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error("[merge_llm_facts] FAILED:", err);
    process.exit(1);
  });
}
