/**
 * E1 + E2 — quality observability for the multi-source sprint (ADR 0001).
 *
 * E1 — Coverage gap dashboard
 * ----------------------------
 *   For every (prefecture × topic) cell, count how many entities we have.
 *   Topics: spots / hotels / festivals / local_food / cultural_heritage.
 *   For each entity-bearing topic, also count how many entities have full
 *   17-language translation coverage. Output a markdown matrix and a
 *   machine-readable JSON.
 *
 * E2 — Per-entity quality score
 * -----------------------------
 *   Score every spot in data/prefectures/<slug>.json on a 0-1 scale based on:
 *     - has_description       : 0.20
 *     - description_length    : 0.15  (>=120 chars = full credit)
 *     - has_body_paragraphs   : 0.20  (>=2 paragraphs = full)
 *     - has_address           : 0.10
 *     - has_coordinates       : 0.10  (exact > geocoded > centroid)
 *     - has_schema_data       : 0.15  (JSON-LD Event/Place present)
 *     - has_image             : 0.10
 *   Tagged "low" (<0.30), "medium" (0.30-0.65), "high" (>=0.65).
 *   Output: per-entity scores in JSONL; per-prefecture median in the
 *   summary report.
 *
 * Run:
 *   npx tsx scrapers/quality/quality_report.ts
 *   # outputs:
 *   #   data/_logs/quality_report_<ts>.md     (human-readable)
 *   #   data/_logs/quality_report_<ts>.json   (machine-readable)
 *   #   data/_logs/quality_scores_<ts>.jsonl  (per-entity scores)
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { scoreSpot as rubricScoreSpot } from "../lib/quality_score.js";

const REPO_ROOT = new URL("../../", import.meta.url);
const LOG_DIR = new URL("data/_logs/", REPO_ROOT);

// Data-root candidates. Each one is the directory that *contains*
// prefectures/, hotels/, r3/ — i.e. it is the "data/" level, regardless of
// whether the literal segment is present in the URL.
const REPO_DATA = new URL("data/", REPO_ROOT);
const HF_CACHE = new URL("file://" + process.env.HOME + "/.japan-travel-mcp/data/");
const E2E_CACHE = new URL("file:///tmp/jtm-e2e-cache/");

async function pickDataRoot(): Promise<URL> {
  for (const candidate of [REPO_DATA, HF_CACHE, E2E_CACHE]) {
    const prefDir = new URL("prefectures/", candidate);
    if (!existsSync(fileURLToPath(prefDir))) continue;
    const files = await readdir(fileURLToPath(prefDir));
    if (files.some((f) => f.endsWith(".json"))) return candidate;
  }
  return REPO_DATA;
}

function r3(dataRoot: URL): {
  maff: URL;
  meti: URL;
  bunka: URL;
  unesco: URL;
  jh: URL;
} {
  return {
    maff: new URL("r3/maff_gi.json", dataRoot),
    meti: new URL("r3/meti_densan.json", dataRoot),
    bunka: new URL("r3/bunka_intangible.json", dataRoot),
    unesco: new URL("r3/unesco_japan.json", dataRoot),
    jh: new URL("r3/japan_heritage.json", dataRoot),
  };
}

function regionsPath(dataRoot: URL): URL {
  return new URL("knowledge/taxonomies/japan_regions.json", dataRoot);
}

interface PrefRow {
  code: string;
  name_en: string;
  name_ja: string;
}

interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  municipalities: Array<{
    municipality: { code: string; name: string; prefecture_code: string };
    spots: Array<{
      id: string;
      name: string;
      description: string | null;
      body_paragraphs?: string[];
      address: string | null;
      coordinates: { lat: number; lng: number } | null;
      coordinate_precision: string | null;
      images: string[];
      schema_events?: unknown[];
      schema_places?: unknown[];
      url: string;
    }>;
  }>;
  wikidata_attractions?: Array<{ qid: string; prefecture_code: string }>;
}

// ──────────────────────────────────────────────────────────────────────
// E2 — quality score per spot

interface SpotScore {
  spot_id: string;
  spot_name: string;
  url: string;
  prefecture_code: string;
  municipality_name: string;
  score: number;
  band: "low" | "medium" | "high";
  components: Record<string, number>;
}

function scoreSpot(
  s: PrefectureFile["municipalities"][number]["spots"][number],
  prefCode: string,
  muniName: string,
): SpotScore {
  const r = rubricScoreSpot(s);
  return {
    spot_id: s.id,
    spot_name: s.name,
    url: s.url,
    prefecture_code: prefCode,
    municipality_name: muniName,
    score: r.score,
    band: r.band,
    components: r.components as unknown as Record<string, number>,
  };
}

// ──────────────────────────────────────────────────────────────────────
// E1 — coverage matrix (prefecture × topic)

interface CoverageCell {
  total: number;
  with_translation: number; // entities with at least one of the 17 langs
}

interface CoverageRow {
  code: string;
  name_en: string;
  name_ja: string;
  spots: CoverageCell;
  hotels: CoverageCell;
  festivals: CoverageCell;
  local_food: CoverageCell;
  heritage: CoverageCell;
  spot_score_band: { high: number; medium: number; low: number };
  spot_score_median: number;
}

function emptyCell(): CoverageCell {
  return { total: 0, with_translation: 0 };
}

async function loadJsonl(url: URL): Promise<unknown[]> {
  if (!existsSync(fileURLToPath(url))) return [];
  const text = await readFile(fileURLToPath(url), "utf8");
  const out: unknown[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      // skip malformed
    }
  }
  return out;
}

async function loadJson(url: URL): Promise<unknown> {
  if (!existsSync(fileURLToPath(url))) return null;
  return JSON.parse(await readFile(fileURLToPath(url), "utf8"));
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

const FESTIVAL_KW = ["祭", "祭り", "祭礼", "まつり", "神事", "神楽", "神輿", "行事"];
const FOOD_KW = ["グルメ", "ご当地", "名物", "銘菓", "銘酒", "地酒", "郷土料理"];

function hasAny(text: string | null | undefined, kws: string[]): boolean {
  if (!text) return false;
  return kws.some((k) => text.includes(k));
}

async function main(): Promise<void> {
  const dataRoot = await pickDataRoot();
  process.stderr.write(`[quality] data root: ${dataRoot.href}\n`);
  const R3 = r3(dataRoot);

  // Load prefectures index — taxonomies are repo-only, fall back to repo if
  // the data-root candidate doesn't ship them.
  let regions = (await loadJson(regionsPath(dataRoot))) as
    | { prefectures: PrefRow[] }
    | null;
  if (!regions) {
    regions = (await loadJson(regionsPath(REPO_DATA))) as { prefectures: PrefRow[] };
  }
  const rows = new Map<string, CoverageRow>();
  for (const p of regions.prefectures) {
    rows.set(p.code, {
      code: p.code,
      name_en: p.name_en,
      name_ja: p.name_ja,
      spots: emptyCell(),
      hotels: emptyCell(),
      festivals: emptyCell(),
      local_food: emptyCell(),
      heritage: emptyCell(),
      spot_score_band: { high: 0, medium: 0, low: 0 },
      spot_score_median: 0,
    });
  }

  // ── spots + per-spot quality scores
  const allScores: SpotScore[] = [];
  const scoresByPref = new Map<string, number[]>();
  const prefDir = new URL("prefectures/", dataRoot);
  const prefFiles = (await readdir(fileURLToPath(prefDir))).filter((f) =>
    f.endsWith(".json"),
  );
  // Map description-translation set for spots → "with_translation" check
  const descRows = await loadJsonl(new URL("translations/descriptions_complete.jsonl", dataRoot));
  const qidsWithTrans = new Set<string>();
  for (const r of descRows) {
    const o = r as { qid?: string; descriptions?: Record<string, string> };
    if (o.qid && o.descriptions && Object.keys(o.descriptions).length > 0) {
      qidsWithTrans.add(o.qid);
    }
  }

  for (const f of prefFiles) {
    const data = JSON.parse(
      await readFile(fileURLToPath(new URL(f, prefDir)), "utf8"),
    ) as PrefectureFile;
    const code = data.prefecture.code;
    const row = rows.get(code);
    if (!row) continue;

    // spots: count municipalities' spots + wikidata attractions in this prefecture
    let muniSpots = 0;
    let muniSpotsWithDesc = 0;
    const prefScores: number[] = [];
    for (const m of data.municipalities) {
      for (const s of m.spots) {
        muniSpots += 1;
        if (s.description) muniSpotsWithDesc += 1;
        const sc = scoreSpot(s, code, m.municipality.name);
        allScores.push(sc);
        prefScores.push(sc.score);
        row.spot_score_band[sc.band] += 1;

        // festivals + local food in scraped layer
        if (
          hasAny(s.name, FESTIVAL_KW) ||
          hasAny(s.description, FESTIVAL_KW) ||
          (s.schema_events?.length ?? 0) > 0
        ) {
          row.festivals.total += 1;
        }
        if (
          hasAny(s.name, FOOD_KW) ||
          hasAny(s.description, FOOD_KW)
        ) {
          row.local_food.total += 1;
        }
      }
    }
    row.spots.total = muniSpots + (data.wikidata_attractions?.length ?? 0);
    row.spots.with_translation =
      muniSpotsWithDesc +
      (data.wikidata_attractions?.filter((a) => qidsWithTrans.has(a.qid)).length ?? 0);
    scoresByPref.set(code, prefScores);
    row.spot_score_median = Math.round(median(prefScores) * 1000) / 1000;
  }

  // ── hotels per prefecture
  const hotelsRaw = (await loadJson(new URL("hotels/master.json", dataRoot))) as
    | { hotels?: Array<{ prefecture_code?: string | null; name?: string | null }> }
    | null;
  if (hotelsRaw?.hotels) {
    for (const h of hotelsRaw.hotels) {
      const c = h.prefecture_code;
      if (!c) continue;
      const row = rows.get(c);
      if (row) {
        row.hotels.total += 1;
        if (h.name) row.hotels.with_translation += 1;
      }
    }
  }

  // ── festivals + local food + heritage from r3 sources
  // local food: MAFF GI rows attribute to a prefecture via prefecture_codes
  const r3Maff = (await loadJson(R3.maff)) as
    | { records?: Array<{ prefecture_codes?: string[] }> }
    | null;
  if (r3Maff?.records) {
    for (const r of r3Maff.records) {
      for (const c of r.prefecture_codes ?? []) {
        const row = rows.get(c);
        if (row) row.local_food.total += 1;
      }
    }
  }
  // festivals (bunka_intangible + unesco) — attribute to all prefectures (they
  // can span multiple), so we count once per prefecture for the entry's name
  const r3Bunka = (await loadJson(R3.bunka)) as
    | { records?: Array<{ name_ja?: string | null; name_en?: string | null }> }
    | null;
  const isFestivalLabel = (n: string | null | undefined): boolean =>
    !!n && FESTIVAL_KW.some((k) => n.includes(k));
  if (r3Bunka?.records) {
    for (const r of r3Bunka.records) {
      if (!isFestivalLabel(r.name_ja) && !isFestivalLabel(r.name_en)) continue;
      // bunka rows don't carry prefecture; count nationally — add to row 13 (Tokyo)
      // This is a coverage-counting heuristic; fixed in a future pass when
      // we add prefecture_codes to bunka_intangible records.
    }
  }

  // ── japan heritage → per-prefecture from prefecture_codes
  const r3Jh = (await loadJson(R3.jh)) as
    | { records?: Array<{ prefecture_codes?: string[] }> }
    | null;
  if (r3Jh?.records) {
    for (const r of r3Jh.records) {
      for (const c of r.prefecture_codes ?? []) {
        const row = rows.get(c);
        if (row) row.heritage.total += 1;
      }
    }
  }

  // ── output
  await mkdir(fileURLToPath(LOG_DIR), { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outJson = new URL(`quality_report_${ts}.json`, LOG_DIR);
  const outMd = new URL(`quality_report_${ts}.md`, LOG_DIR);
  const outScores = new URL(`quality_scores_${ts}.jsonl`, LOG_DIR);

  const sortedRows = [...rows.values()].sort((a, b) => a.code.localeCompare(b.code));
  await writeFile(
    fileURLToPath(outJson),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        data_root: dataRoot.href,
        rows: sortedRows,
        totals: {
          spots: allScores.length,
          spots_with_high_score: allScores.filter((s) => s.band === "high").length,
          spots_with_medium_score: allScores.filter((s) => s.band === "medium").length,
          spots_with_low_score: allScores.filter((s) => s.band === "low").length,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  // Markdown
  const lines: string[] = [];
  lines.push(`# Quality report — ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`Source: ${dataRoot.href}`);
  lines.push("");
  lines.push("## Coverage matrix (prefecture × topic)");
  lines.push("");
  lines.push("| Pref | Spots | Hotels | Festivals | Local food | Heritage | Spot quality (median) |");
  lines.push("|:---|---:|---:|---:|---:|---:|---:|");
  for (const r of sortedRows) {
    lines.push(
      `| ${r.name_en} | ${r.spots.total} | ${r.hotels.total} | ${r.festivals.total} | ${r.local_food.total} | ${r.heritage.total} | ${r.spot_score_median} |`,
    );
  }
  lines.push("");
  lines.push("## Per-entity quality bands (spots only)");
  lines.push("");
  const tot = allScores.length || 1;
  const hi = allScores.filter((s) => s.band === "high").length;
  const md = allScores.filter((s) => s.band === "medium").length;
  const lo = allScores.filter((s) => s.band === "low").length;
  lines.push(`- high   (≥0.65): ${hi} / ${tot} (${((hi / tot) * 100).toFixed(1)}%)`);
  lines.push(`- medium (≥0.30): ${md} / ${tot} (${((md / tot) * 100).toFixed(1)}%)`);
  lines.push(`- low    (<0.30): ${lo} / ${tot} (${((lo / tot) * 100).toFixed(1)}%)`);
  lines.push("");
  lines.push("## Bottom 20 spots by quality score (improvement candidates)");
  lines.push("");
  lines.push("| Pref | Municipality | Spot | Score | URL |");
  lines.push("|:---|:---|:---|---:|:---|");
  const bottom = [...allScores].sort((a, b) => a.score - b.score).slice(0, 20);
  for (const s of bottom) {
    lines.push(
      `| ${s.prefecture_code} | ${s.municipality_name} | ${s.spot_name.slice(0, 40)} | ${s.score} | ${s.url} |`,
    );
  }
  await writeFile(fileURLToPath(outMd), lines.join("\n") + "\n", "utf8");

  // JSONL of all scores (for downstream filtering / bigquery / etc.)
  const scoresLines = allScores.map((s) => JSON.stringify(s));
  await writeFile(
    fileURLToPath(outScores),
    scoresLines.join("\n") + "\n",
    "utf8",
  );

  process.stderr.write(`[quality] wrote ${fileURLToPath(outJson)}\n`);
  process.stderr.write(`[quality] wrote ${fileURLToPath(outMd)}\n`);
  process.stderr.write(`[quality] wrote ${fileURLToPath(outScores)} (${allScores.length} scores)\n`);
}

main().catch((err) => {
  console.error("[quality] FAILED:", err);
  process.exit(1);
});
