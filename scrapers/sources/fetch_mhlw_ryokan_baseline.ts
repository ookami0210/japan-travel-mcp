/**
 * MHLW ryokan-gyo baseline — official facility counts from the Report on
 * Public Health Administration and Services (衛生行政報告例, survey 00450027).
 *
 * WHY: this is the ground-truth denominator for the hotel ledger. The
 * fiscal-year-end table reports, per prefecture (with designated/core cities
 * re-listed), how many Hotel Business Act facilities exist: 旅館・ホテル営業
 * (facilities + guest rooms), 簡易宿所営業, 下宿営業. Ledger coverage is
 * measured as ingested-facilities ÷ these counts — the closer to 100% per
 * prefecture, the closer the ledger is to complete.
 *
 * Semantics to keep straight downstream:
 *   - Prefecture rows are FULL totals (cities included).
 *   - 指定都市/中核市 rows are 再掲 (subsets of their prefecture row).
 *   - "-" in the source means zero occurrences, parsed as 0.
 *   - Individually designated public-health-center cities (小樽 etc.) and
 *     Tokyo special wards are NOT re-listed — they are inside their
 *     prefecture totals only.
 *
 * Source: e-Stat file download (CSV, cp932). 政府統計の総合窓口,
 * 政府標準利用規約 (compatible with CC BY 4.0).
 *
 * Output: data/_state/ryokan_registry/mhlw_baseline.json
 *
 * Usage:
 *   npx tsx scrapers/sources/fetch_mhlw_ryokan_baseline.ts
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_URL = new URL(
  "../../data/_state/ryokan_registry/mhlw_baseline.json",
  import.meta.url,
);

const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; mhlw ryokan baseline)";

/**
 * 令和6年度 (FY2024, counts as of 2025-03-31) 第8表 — the newest year at the
 * time of writing. When the next fiscal year publishes (~autumn), update
 * STAT_INF_ID and FISCAL_YEAR together.
 */
const STAT_INF_ID = "000040359176";
const FISCAL_YEAR = {
  label_ja: "令和6年度",
  fiscal_year: "FY2024",
  counts_as_of: "2025-03-31",
};

const DOWNLOAD_URL = `https://www.e-stat.go.jp/stat-search/file-download?statInfId=${STAT_INF_ID}&fileKind=1`;

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

export interface BaselineRow {
  name: string;
  /** "prefecture" rows are full totals; city rows are 再掲 subsets. */
  level: "national" | "prefecture" | "designated_city" | "core_city";
  prefecture: string | null;
  ryokan_hotel_facilities: number;
  ryokan_hotel_rooms: number;
  kani_shukusho_facilities: number;
  geshuku_facilities: number;
  permits_granted_fy: number;
  closures_fy: number;
}

function parseCount(cell: string): number {
  const v = cell.trim();
  if (v === "-" || v === "") return 0;
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n)) throw new Error(`unparseable count cell: "${cell}"`);
  return n;
}

function parseRow(
  name: string,
  cells: string[],
  level: BaselineRow["level"],
  prefecture: string | null,
): BaselineRow {
  return {
    name,
    level,
    prefecture,
    ryokan_hotel_facilities: parseCount(cells[1] ?? ""),
    ryokan_hotel_rooms: parseCount(cells[2] ?? ""),
    kani_shukusho_facilities: parseCount(cells[3] ?? ""),
    geshuku_facilities: parseCount(cells[4] ?? ""),
    permits_granted_fy: parseCount(cells[5] ?? ""),
    closures_fy: parseCount(cells[6] ?? ""),
  };
}

async function main(): Promise<void> {
  console.error(`[mhlw_baseline] GET ${DOWNLOAD_URL}`);
  const res = await fetch(DOWNLOAD_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(60_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} downloading e-Stat table`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const text = new TextDecoder("shift_jis").decode(buf);
  const lines = text.split(/\r?\n/);

  // Sanity-pin the vintage: the first line carries the fiscal-year label
  // (full-width digits in the source — compare NFKC-normalized).
  if (!lines[0]?.normalize("NFKC").includes(FISCAL_YEAR.label_ja)) {
    throw new Error(
      `expected ${FISCAL_YEAR.label_ja} in the file header, got: "${lines[0]}" — ` +
        `statInfId ${STAT_INF_ID} may now point at a different vintage`,
    );
  }

  const rows: BaselineRow[] = [];
  let section: "designated_city" | "core_city" | null = null;

  for (const line of lines) {
    const cells = line.split(",").map((c) => c.trim());
    const head = cells[0] ?? "";
    if (head === "全国") {
      rows.push(parseRow("全国", cells, "national", null));
      continue;
    }
    if (head.startsWith("指定都市")) {
      section = "designated_city";
      continue;
    }
    if (head.startsWith("中核市")) {
      section = "core_city";
      continue;
    }
    if (section === null && PREFECTURES.includes(head)) {
      rows.push(parseRow(head, cells, "prefecture", head));
      continue;
    }
    if (section !== null) {
      // City rows concatenate prefecture + city: 北海道札幌市.
      const pref = PREFECTURES.find((p) => head.startsWith(p));
      if (pref && head.length > pref.length) {
        rows.push(parseRow(head.slice(pref.length), cells, section, pref));
      }
    }
  }

  // Validate shape and internal consistency before writing anything.
  const national = rows.filter((r) => r.level === "national");
  const prefs = rows.filter((r) => r.level === "prefecture");
  const designated = rows.filter((r) => r.level === "designated_city");
  const core = rows.filter((r) => r.level === "core_city");
  if (national.length !== 1 || prefs.length !== 47) {
    throw new Error(
      `unexpected shape: national=${national.length}, prefectures=${prefs.length}`,
    );
  }
  if (designated.length !== 20 || core.length !== 62) {
    throw new Error(
      `unexpected recap shape: designated=${designated.length}, core=${core.length}`,
    );
  }
  for (const field of [
    "ryokan_hotel_facilities",
    "kani_shukusho_facilities",
    "geshuku_facilities",
  ] as const) {
    const sum = prefs.reduce((s, r) => s + r[field], 0);
    if (sum !== national[0][field]) {
      throw new Error(
        `${field}: prefecture sum ${sum} != national ${national[0][field]}`,
      );
    }
  }

  const out = {
    schema_version: 1,
    survey: "衛生行政報告例 (Report on Public Health Administration and Services)",
    survey_code: "00450027",
    table: "生活衛生 第8表 旅館・ホテル営業の施設数・客室数及び簡易宿所・下宿営業の施設数・許可・廃止・処分件数",
    ...FISCAL_YEAR,
    stat_inf_id: STAT_INF_ID,
    source_url: DOWNLOAD_URL,
    license: "政府標準利用規約（第2.0版） / compatible with CC BY 4.0",
    retrieved_at: new Date().toISOString(),
    semantics: {
      prefecture_rows: "full totals, cities included",
      city_rows: "再掲 — subsets of their prefecture row",
      dash_cells: "parsed as 0",
    },
    national: national[0],
    rows,
  };

  await mkdir(dirname(fileURLToPath(OUT_URL)), { recursive: true });
  const tmp = fileURLToPath(OUT_URL) + ".tmp";
  await writeFile(tmp, JSON.stringify(out, null, 2), "utf8");
  await rename(tmp, fileURLToPath(OUT_URL));

  console.error(
    `[mhlw_baseline] ${FISCAL_YEAR.label_ja}: national 旅館・ホテル ${national[0].ryokan_hotel_facilities} / ` +
      `簡易宿所 ${national[0].kani_shukusho_facilities} / 下宿 ${national[0].geshuku_facilities}`,
  );
  console.error(`[mhlw_baseline] wrote ${fileURLToPath(OUT_URL)}`);
}

main().catch((err) => {
  console.error("[fetch_mhlw_ryokan_baseline] fatal:", err);
  process.exitCode = 1;
});
