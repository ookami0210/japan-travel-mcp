/**
 * Ryokan ledger coverage vs. the MHLW 衛生行政報告例 baseline.
 *
 * North star: the ingested facility roster should approach the official
 * fiscal-year-end permit counts (旅館・ホテル + 簡易宿所 + 下宿), per
 * authority and nationally. This report is the gap dashboard.
 *
 * Baseline semantics (see fetch_mhlw_ryokan_baseline.ts):
 *   - prefecture rows are FULL totals → a prefecture AUTHORITY's own
 *     jurisdiction is pref_total − Σ(re-listed designated/core cities).
 *     The remainder still contains the 5 individually designated
 *     public-health-center cities and (for Tokyo) the 23 special wards,
 *     which the survey does not re-list — flagged per row.
 *   - designated/core city authorities compare against their 再掲 row.
 *   - phc cities / special wards have no baseline row of their own.
 *
 * Run: npm run quality:ryokan_coverage
 * Output: data/_state/ryokan_registry/coverage_report.json + console table.
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadAuthorities } from "../sources/ryokan_authority_list.js";

const DIR = new URL("../../data/_state/ryokan_registry/", import.meta.url);
const OUT_URL = new URL("coverage_report.json", DIR);

interface BaselineRow {
  name: string;
  level: string;
  prefecture: string | null;
  ryokan_hotel_facilities: number;
  kani_shukusho_facilities: number;
  geshuku_facilities: number;
}

interface IngestResult {
  authority_key: string;
  authority_name: string;
  status: string;
  facility_count: number;
  by_category: Record<string, number>;
}

const total = (r: BaselineRow): number =>
  r.ryokan_hotel_facilities + r.kani_shukusho_facilities + r.geshuku_facilities;

async function main(): Promise<void> {
  const baseline = JSON.parse(
    await readFile(new URL("mhlw_baseline.json", DIR), "utf8"),
  ) as { rows: BaselineRow[]; national: BaselineRow; label_ja: string; counts_as_of: string };
  const ingest = JSON.parse(
    await readFile(new URL("ingest_report.json", DIR), "utf8"),
  ) as { results: IngestResult[] };
  const authorities = await loadAuthorities();
  const authByKey = new Map(authorities.map((a) => [a.key, a]));

  const cityRows = baseline.rows.filter(
    (r) => r.level === "designated_city" || r.level === "core_city",
  );
  const prefRows = baseline.rows.filter((r) => r.level === "prefecture");

  const rows = ingest.results
    .filter((r) => r.status === "ingested")
    .map((r) => {
      const auth = authByKey.get(r.authority_key)!;
      let baselineTotal: number | null = null;
      let note: string | null = null;
      if (auth.kind === "designated_city" || auth.kind === "core_city") {
        const b = cityRows.find((c) => c.name === auth.name);
        baselineTotal = b ? total(b) : null;
      } else if (auth.kind === "prefecture") {
        const pref = prefRows.find((p) => p.name === auth.name)!;
        const recap = cityRows.filter((c) => c.prefecture === auth.name);
        baselineTotal = total(pref) - recap.reduce((s, c) => s + total(c), 0);
        note =
          "pref total minus re-listed cities; remainder still includes " +
          "non-re-listed PHC cities" +
          (auth.name === "東京都" ? " and the 23 special wards" : "");
      } else {
        note = "no dedicated baseline row in the survey (inside prefecture total)";
      }
      return {
        authority_key: r.authority_key,
        authority_name: r.authority_name,
        kind: auth.kind,
        ingested: r.facility_count,
        by_category: r.by_category,
        baseline_total: baselineTotal,
        coverage_pct:
          baselineTotal && baselineTotal > 0
            ? Math.round((r.facility_count / baselineTotal) * 1000) / 10
            : null,
        note,
      };
    });

  // Tokyo rollup: wards have no baseline rows, but the prefecture total is a
  // meaningful ceiling for (wards + Tokyo-pref jurisdiction + 八王子 recap).
  const tokyoPref = prefRows.find((p) => p.name === "東京都")!;
  const tokyoIngested = rows
    .filter((r) => r.authority_key.startsWith("muni-131") || r.authority_key === "pref-13")
    .reduce((s, r) => s + r.ingested, 0);

  const nationalBaseline = total(baseline.national as unknown as BaselineRow);
  const nationalIngested = rows.reduce((s, r) => s + r.ingested, 0);

  const out = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    baseline: {
      survey: "衛生行政報告例",
      vintage: `${baseline.label_ja} (as of ${baseline.counts_as_of})`,
      national_total: nationalBaseline,
    },
    national: {
      ingested: nationalIngested,
      baseline_total: nationalBaseline,
      coverage_pct: Math.round((nationalIngested / nationalBaseline) * 1000) / 10,
    },
    tokyo_rollup: {
      ingested: tokyoIngested,
      baseline_total: total(tokyoPref),
      coverage_pct: Math.round((tokyoIngested / total(tokyoPref)) * 1000) / 10,
    },
    authorities: rows.sort((a, b) => (b.coverage_pct ?? -1) - (a.coverage_pct ?? -1)),
  };

  const tmp = fileURLToPath(OUT_URL) + ".tmp";
  await writeFile(tmp, JSON.stringify(out, null, 2), "utf8");
  await rename(tmp, fileURLToPath(OUT_URL));

  console.error(`\n=== ryokan ledger coverage vs ${out.baseline.vintage} ===`);
  console.error(
    `national: ${nationalIngested} / ${nationalBaseline} (${out.national.coverage_pct}%)`,
  );
  console.error(
    `tokyo rollup: ${tokyoIngested} / ${total(tokyoPref)} (${out.tokyo_rollup.coverage_pct}%)\n`,
  );
  for (const r of out.authorities) {
    const cov = r.coverage_pct === null ? "  n/a" : `${String(r.coverage_pct).padStart(5)}%`;
    const bl = r.baseline_total === null ? "—" : String(r.baseline_total);
    console.error(
      `  ${cov}  ${r.authority_name.padEnd(14, "　")} ${r.ingested} / ${bl}`,
    );
  }
  console.error(`\nwrote ${fileURLToPath(OUT_URL)}`);
}

main().catch((err) => {
  console.error("[ryokan_coverage_report] fatal:", err);
  process.exitCode = 1;
});
