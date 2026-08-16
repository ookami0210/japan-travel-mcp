/**
 * Unresolved-name intake — the demand signal for data expansion.
 *
 * Consumer applications log names that appeared in real conversations /
 * search results but did not resolve to a verified entity. This script
 * aggregates those logs into a ranked worklist so entity creation follows
 * measured demand (hit_count) instead of guesses.
 *
 * INTAKE CONTRACT — drop JSONL files under data/_state/unresolved_names/:
 *   one JSON object per line:
 *     { "name": "Motonago Ryokan",        // required
 *       "area": "京都",                    // optional free text
 *       "category_guess": "lodging",      // optional
 *       "hit_count": 3 }                  // optional, default 1
 *   File naming: <consumer>_<yyyymmdd>.jsonl (any name is accepted).
 *
 * Output: data/_logs/unresolved_report_<date>.{json,md} — names ranked by
 * total hits, with per-area breakdown. Idempotent; safe to re-run.
 *
 * Usage: npm run quality:unresolved
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const INTAKE_DIR = resolve(ROOT, "data/_state/unresolved_names");
const LOG_DIR = resolve(ROOT, "data/_logs");

interface UnresolvedLine {
  name?: string;
  area?: string;
  category_guess?: string;
  hit_count?: number;
}

function normalizeKey(s: string): string {
  return s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  let files: string[] = [];
  try {
    files = (await readdir(INTAKE_DIR)).filter((f) => f.endsWith(".jsonl"));
  } catch {
    console.log(`[unresolved] no intake dir yet (${INTAKE_DIR}) — nothing to do`);
    return;
  }
  if (files.length === 0) {
    console.log("[unresolved] intake dir is empty — nothing to do");
    return;
  }

  const agg = new Map<
    string,
    {
      name: string;
      hits: number;
      areas: Map<string, number>;
      categories: Set<string>;
      sources: Set<string>;
    }
  >();
  let totalLines = 0;
  let badLines = 0;

  for (const f of files) {
    const raw = await readFile(join(INTAKE_DIR, f), "utf8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      totalLines += 1;
      let rec: UnresolvedLine;
      try {
        rec = JSON.parse(line) as UnresolvedLine;
      } catch {
        badLines += 1;
        continue;
      }
      const name = rec.name?.trim();
      if (!name) {
        badLines += 1;
        continue;
      }
      const key = normalizeKey(name);
      let row = agg.get(key);
      if (!row) {
        row = {
          name,
          hits: 0,
          areas: new Map(),
          categories: new Set(),
          sources: new Set(),
        };
        agg.set(key, row);
      }
      const hits = Math.max(1, Math.floor(rec.hit_count ?? 1));
      row.hits += hits;
      if (rec.area) row.areas.set(rec.area, (row.areas.get(rec.area) ?? 0) + hits);
      if (rec.category_guess) row.categories.add(rec.category_guess);
      row.sources.add(f);
    }
  }

  const ranked = Array.from(agg.values()).sort((a, b) => b.hits - a.hits);
  const stamp = new Date().toISOString().slice(0, 10);

  await mkdir(LOG_DIR, { recursive: true });
  const jsonPath = join(LOG_DIR, `unresolved_report_${stamp}.json`);
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        intake_files: files,
        total_lines: totalLines,
        malformed_lines: badLines,
        unique_names: ranked.length,
        ranked: ranked.map((r) => ({
          name: r.name,
          hits: r.hits,
          areas: Object.fromEntries(r.areas),
          category_guesses: Array.from(r.categories),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );

  const mdLines = [
    `# Unresolved names — demand-ranked worklist (${stamp})`,
    "",
    `Intake: ${files.length} file(s), ${totalLines} lines (${badLines} malformed skipped), ${ranked.length} unique names.`,
    "",
    "| # | Name | Hits | Areas | Category guesses |",
    "|--:|---|--:|---|---|",
    ...ranked
      .slice(0, 200)
      .map(
        (r, i) =>
          `| ${i + 1} | ${r.name} | ${r.hits} | ${Array.from(r.areas.keys()).join(", ") || "—"} | ${Array.from(r.categories).join(", ") || "—"} |`,
      ),
  ];
  const mdPath = join(LOG_DIR, `unresolved_report_${stamp}.md`);
  await writeFile(mdPath, mdLines.join("\n") + "\n", "utf8");

  console.log(
    `[unresolved] ${ranked.length} unique names from ${totalLines} lines → ${mdPath}`,
  );
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${String(r.hits).padStart(4)}×  ${r.name}`);
  }
}

main().catch((err) => {
  console.error("[unresolved] FAILED:", err);
  process.exit(1);
});
