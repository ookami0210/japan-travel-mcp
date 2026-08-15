/**
 * Entity-completeness report — the "placeable entities" KPI.
 *
 * Consumers building itineraries can only verify what has evidence: a
 * record missing geo, category, hours, or provenance cannot participate in
 * validation and is effectively invisible to planners. This report measures,
 * per prefecture, how many records meet each completeness tier — the KPI is
 * NOT record count, it is placeable-record count.
 *
 * Tiers (municipal spots + wikidata attractions):
 *   core       = name + geo + stable id + source/provenance
 *   categorized= core + machine-readable category signal
 *   placeable  = categorized + hours evidence (opening_hours[_structured])
 * Food layer (data/food/<slug>.json) is reported separately (same core
 * definition; hours/official_url coverage shown).
 *
 * Output: data/_logs/completeness_<date>.json + console table.
 * Pure reader — never fetches, never mutates. `npm run quality:completeness`.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const PREF_DIR = new URL("data/prefectures/", ROOT);
const FOOD_DIR = new URL("data/food/", ROOT);
const LOG_DIR = new URL("data/_logs/", ROOT);

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

interface Tier {
  total: number;
  core: number;
  categorized: number;
  placeable: number;
  with_hours: number;
  with_price: number;
  with_official_url: number;
}

function newTier(): Tier {
  return {
    total: 0,
    core: 0,
    categorized: 0,
    placeable: 0,
    with_hours: 0,
    with_price: 0,
    with_official_url: 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tally(t: Tier, rec: Record<string, any>, kind: "spot" | "attraction"): void {
  t.total += 1;
  const name = kind === "spot" ? rec.name : (rec.name_ja ?? rec.name_en);
  const geo =
    kind === "spot"
      ? rec.coordinates?.lat !== undefined
      : rec.coordinates !== null && rec.coordinates !== undefined;
  const id = kind === "spot" ? rec.id : rec.qid;
  const source = kind === "spot" ? rec.source_url ?? rec.url : rec.wikidata_url;
  const category =
    kind === "spot"
      ? !!rec.category
      : !!rec.category ||
        (Array.isArray(rec.wikipedia_kind_tags) && rec.wikipedia_kind_tags.length > 0) ||
        (Array.isArray(rec.types) && rec.types.length > 0);
  const hours = !!(rec.opening_hours || rec.opening_hours_structured);
  const price = !!(rec.charge || rec.charge_parsed);
  const officialUrl = kind === "spot" ? !!(rec.url ?? rec.source_url) : !!rec.official_url;

  const core = !!(name && geo && id && source);
  if (core) t.core += 1;
  if (core && category) t.categorized += 1;
  if (core && category && hours) t.placeable += 1;
  if (hours) t.with_hours += 1;
  if (price) t.with_price += 1;
  if (officialUrl) t.with_official_url += 1;
}

async function readJson(url: URL): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await readFile(fileURLToPath(url), "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const perPref: Record<string, { spots: Tier; attractions: Tier; food: Tier }> = {};
  const totals = { spots: newTier(), attractions: newTier(), food: newTier() };

  for (const [code, slug] of Object.entries(PREFECTURE_SLUGS)) {
    const pref = await readJson(new URL(`${slug}.json`, PREF_DIR));
    const food = await readJson(new URL(`${slug}.json`, FOOD_DIR));
    const row = { spots: newTier(), attractions: newTier(), food: newTier() };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const m of (pref?.municipalities as any[]) ?? []) {
      for (const s of m?.spots ?? []) {
        tally(row.spots, s, "spot");
        tally(totals.spots, s, "spot");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const a of (pref?.wikidata_attractions as any[]) ?? []) {
      tally(row.attractions, a, "attraction");
      tally(totals.attractions, a, "attraction");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (food?.entries as any[]) ?? []) {
      const t = row.food;
      t.total += 1;
      totals.food.total += 1;
      const core = !!(e.names?.default && e.geo?.lat !== undefined && e.id);
      if (core) {
        t.core += 1;
        totals.food.core += 1;
      }
      const cat = core && Array.isArray(e.cuisine) && e.cuisine.length > 0;
      if (cat) {
        t.categorized += 1;
        totals.food.categorized += 1;
      }
      if (e.hours_raw) {
        t.with_hours += 1;
        totals.food.with_hours += 1;
      }
      if (cat && e.hours_raw) {
        t.placeable += 1;
        totals.food.placeable += 1;
      }
      if (e.official_url) {
        t.with_official_url += 1;
        totals.food.with_official_url += 1;
      }
    }
    perPref[slug] = row;
  }

  const stamp = new Date().toISOString();
  const report = {
    run_type: "completeness",
    generated_at: stamp,
    tier_definitions: {
      core: "name + geo + stable id + source provenance",
      categorized: "core + machine-readable category signal",
      placeable: "categorized + hours evidence",
    },
    totals,
    per_prefecture: perPref,
  };

  const logPath = new URL(
    `completeness_${stamp.slice(0, 10)}.json`,
    LOG_DIR,
  );
  await mkdir(dirname(fileURLToPath(logPath)), { recursive: true });
  await writeFile(fileURLToPath(logPath), JSON.stringify(report, null, 2), "utf8");

  const pct = (n: number, d: number): string =>
    d === 0 ? "—" : `${Math.round((100 * n) / d)}%`;
  console.log(`\nEntity completeness — ${stamp.slice(0, 10)}`);
  for (const [label, t] of Object.entries(totals) as [string, Tier][]) {
    console.log(
      `  ${label.padEnd(12)} total=${String(t.total).padStart(6)}  core=${pct(t.core, t.total).padStart(4)}  categorized=${pct(t.categorized, t.total).padStart(4)}  placeable=${pct(t.placeable, t.total).padStart(4)}  hours=${pct(t.with_hours, t.total).padStart(4)}  price=${pct(t.with_price, t.total).padStart(4)}  official_url=${pct(t.with_official_url, t.total).padStart(4)}`,
    );
  }
  console.log(`  → ${fileURLToPath(logPath)}`);
}

main().catch((err) => {
  console.error("[completeness] FAILED:", err);
  process.exit(1);
});
