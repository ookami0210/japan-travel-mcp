/**
 * R-3 source refresh — invoked by GitHub Actions cron after the municipal scrape.
 *
 * Schedule (per day-of-week, JST):
 *   Mon — MAFF GI (slow, ~5 min)
 *   Tue — METI Traditional Crafts (slow, ~6 min)
 *   Wed — Japan Heritage (slow, ~5 min)
 *   Thu — Bunka intangible + UNESCO (fast SPARQL, ~30 s)
 *   Fri/Sat/Sun — skip
 *
 * Every R-3 source refresh that produces new keys triggers an INCREMENTAL
 * translation pass (`translate_r3.ts`) so the 17-language file stays current
 * without re-translating existing rows.
 *
 * Each step is wrapped in try/catch so a single failing source does NOT block
 * the others or the surrounding daily run.
 *
 * Override:
 *   R3_FORCE=maff_gi,meti_densan          run a specific subset
 *   R3_FORCE=all                            run every R-3 fetcher
 *   R3_TRANSLATE=0                          skip the translate pass
 *
 * Run:
 *   npx tsx scrapers/r3_refresh.ts
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fetchMaffGi } from "./sources/fetch_maff_gi.js";
import { fetchMetiDensan } from "./sources/fetch_meti_densan.js";
import { fetchJapanHeritage } from "./sources/fetch_japan_heritage.js";
import { fetchBunkaIntangible } from "./sources/fetch_bunka_intangible.js";
import { fetchUnescoJapan } from "./sources/fetch_unesco_japan.js";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { notify } from "./lib/slack.js";

const ROOT = new URL("../", import.meta.url);
const R3_DIR = new URL("data/r3/", ROOT);

type SourceKey =
  | "maff_gi"
  | "meti_densan"
  | "japan_heritage"
  | "bunka_intangible"
  | "unesco_japan";

const DAY_TO_SOURCES: Record<number, SourceKey[]> = {
  0: [], // Sun
  1: ["maff_gi"], // Mon
  2: ["meti_densan"], // Tue
  3: ["japan_heritage"], // Wed
  4: ["bunka_intangible", "unesco_japan"], // Thu
  5: [], // Fri
  6: [], // Sat
};

const SOURCE_INFO: Record<SourceKey, {
  label: string;
  outFile: string;
  run: () => Promise<{ total: number; sourceMeta: Record<string, unknown> }>;
}> = {
  maff_gi: {
    label: "MAFF GI",
    outFile: "maff_gi.json",
    run: async () => {
      const records = await fetchMaffGi();
      return {
        total: records.length,
        sourceMeta: {
          source: {
            name: "MAFF Geographical Indication (GI) registered products",
            authority: "農林水産省",
            url: "https://www.maff.go.jp/j/shokusan/gi_act/register/",
            license:
              "出典明記による二次利用可 (政府標準利用規約 2.0 / CC BY 4.0 互換)",
          },
          records,
        },
      };
    },
  },
  meti_densan: {
    label: "METI Traditional Crafts",
    outFile: "meti_densan.json",
    run: async () => {
      const records = await fetchMetiDensan();
      return {
        total: records.length,
        sourceMeta: {
          source: {
            name: "METI Traditional Crafts (伝統的工芸品)",
            authority: "経済産業省",
            url: "https://kougeihin.jp/crafts/",
            operator: "一般財団法人 伝統的工芸品産業振興協会",
            license:
              "公式制度の登録名・指定情報。出典明記による教育・観光案内目的の引用",
          },
          records,
        },
      };
    },
  },
  japan_heritage: {
    label: "Japan Heritage",
    outFile: "japan_heritage.json",
    run: async () => {
      const records = await fetchJapanHeritage();
      return {
        total: records.length,
        sourceMeta: {
          source: {
            name: "Japan Heritage (日本遺産)",
            authority: "文化庁",
            url: "https://japan-heritage.bunka.go.jp/ja/stories/",
            license:
              "公式制度の登録名・概要。出典明記による教育・観光案内目的の引用",
          },
          records,
        },
      };
    },
  },
  bunka_intangible: {
    label: "Bunkacho Intangible Cultural Properties",
    outFile: "bunka_intangible.json",
    run: async () => {
      const records = await fetchBunkaIntangible();
      return {
        total: records.length,
        sourceMeta: {
          source: {
            name: "Japan Important Intangible Cultural Properties (重要無形文化財・重要無形民俗文化財)",
            authority: "文化庁",
            origin: "Wikidata SPARQL (mirrors the official designation; CC0)",
            license: "CC0",
          },
          records,
        },
      };
    },
  },
  unesco_japan: {
    label: "UNESCO ICH (Japan)",
    outFile: "unesco_japan.json",
    run: async () => {
      const records = await fetchUnescoJapan();
      return {
        total: records.length,
        sourceMeta: {
          source: {
            name: "UNESCO Intangible Cultural Heritage of Japan",
            authority: "UNESCO",
            origin: "Wikidata SPARQL (mirrors official UNESCO inventory; CC0)",
            license: "CC0",
          },
          records,
        },
      };
    },
  },
};

interface RefreshResult {
  source: SourceKey;
  total: number;
  delta: number;
  ok: boolean;
  error?: string;
}

async function countExistingRecords(file: string): Promise<number> {
  const path = new URL(file, R3_DIR);
  if (!existsSync(fileURLToPath(path))) return 0;
  try {
    const json = JSON.parse(await readFile(fileURLToPath(path), "utf8")) as {
      records?: unknown[];
    };
    return json.records?.length ?? 0;
  } catch {
    return 0;
  }
}

async function refreshOne(source: SourceKey): Promise<RefreshResult> {
  const info = SOURCE_INFO[source];
  const before = await countExistingRecords(info.outFile);
  try {
    const { total, sourceMeta } = await info.run();
    const out = {
      ...sourceMeta,
      fetched_at: new Date().toISOString(),
      total,
    };
    const path = new URL(info.outFile, R3_DIR);
    await mkdir(dirname(fileURLToPath(path)), { recursive: true });
    await writeFile(
      fileURLToPath(path),
      JSON.stringify(out, null, 2),
      "utf8",
    );
    return { source, total, delta: total - before, ok: true };
  } catch (err) {
    return {
      source,
      total: before,
      delta: 0,
      ok: false,
      error: (err as Error).message,
    };
  }
}

function spawnNode(
  cmd: string,
  args: string[],
  env: Record<string, string>,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "inherit", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      const t = d.toString();
      stderr += t;
      process.stderr.write(t);
    });
    child.on("exit", (code) => resolve({ code: code ?? -1, stderr }));
  });
}

async function runIncrementalTranslation(): Promise<{
  ok: boolean;
  error?: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY missing — skipping translation",
    };
  }
  const { code, stderr } = await spawnNode(
    "npx",
    ["tsx", "scrapers/translate/translate_r3.ts"],
    { INCREMENTAL: "1" },
  );
  if (code !== 0) {
    return { ok: false, error: `translate_r3 exited ${code}: ${stderr.slice(-400)}` };
  }
  return { ok: true };
}

function pickSources(): SourceKey[] {
  const force = process.env.R3_FORCE;
  if (force === "all") {
    return Object.keys(SOURCE_INFO) as SourceKey[];
  }
  if (force) {
    return force
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is SourceKey => s in SOURCE_INFO);
  }
  // JST day-of-week (Asia/Tokyo). GitHub Actions runs in UTC; convert.
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dow = jst.getUTCDay();
  return DAY_TO_SOURCES[dow] ?? [];
}

async function main(): Promise<void> {
  const sources = pickSources();
  if (sources.length === 0) {
    process.stderr.write(
      "[r3_refresh] no sources scheduled for today — exiting\n",
    );
    return;
  }
  process.stderr.write(
    `[r3_refresh] sources to refresh: ${sources.join(", ")}\n`,
  );

  const results: RefreshResult[] = [];
  for (const s of sources) {
    process.stderr.write(`[r3_refresh] === ${SOURCE_INFO[s].label} ===\n`);
    const r = await refreshOne(s);
    results.push(r);
    process.stderr.write(
      `[r3_refresh]   result: ok=${r.ok} total=${r.total} delta=${r.delta}${r.error ? ` error=${r.error}` : ""}\n`,
    );
  }

  // Trigger incremental translation if any source succeeded with new records.
  const wantTranslate =
    process.env.R3_TRANSLATE !== "0" &&
    results.some((r) => r.ok && r.delta !== 0);
  let translateMsg = "skipped";
  if (wantTranslate) {
    process.stderr.write(`[r3_refresh] running incremental translation...\n`);
    const t = await runIncrementalTranslation();
    translateMsg = t.ok ? "ok" : `failed: ${t.error}`;
  }

  const okCount = results.filter((r) => r.ok).length;
  const summary = results
    .map(
      (r) =>
        `${r.ok ? "✅" : "❌"} ${SOURCE_INFO[r.source].label} (${r.total} total, Δ${r.delta})`,
    )
    .join(" | ");
  await notify(
    `🔄 R-3 refresh — ${okCount}/${results.length} ok | ${summary} | translation: ${translateMsg}`,
  );

  // Non-zero exit if every requested source failed.
  if (okCount === 0 && sources.length > 0) {
    process.exit(2);
  }
}

main().catch(async (err) => {
  console.error("[r3_refresh] FAILED:", err);
  await notify(`🚨 R-3 refresh crashed: ${(err as Error).message}`, "error");
  process.exit(1);
});
