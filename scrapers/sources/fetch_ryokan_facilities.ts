/**
 * Ryokan-gyo facility ingestion — tier-A permit ledgers from the catalog
 * matrix (#42) into normalized per-authority facility files.
 *
 * WHY: the hotel ledger's public-verification layer. Each authority
 * publishes its permit-facility list with its own column schema; this
 * fetcher downloads every tier-A (CSV/XLSX) roster, maps headers via an
 * alias table, and emits one normalized JSON per authority. Coverage is
 * then measured against the MHLW 衛生行政報告例 baseline (#43).
 *
 * PII rule (hard): operator/applicant columns (営業者・申請者・代表者 etc.)
 * are DROPPED at ingest — individual operators' personal names never enter
 * the repo or the published dataset. Facility-level fields only.
 *
 * Roster-vs-delta: many authorities publish monthly 新規/廃止 delta files
 * instead of a full roster. Delta-only datasets are queued for review, not
 * ingested — accumulating deltas without a base roster would fabricate a
 * facility list we cannot verify.
 *
 * Output:
 *   data/hotels/registry/<authority_key>.json   (bulk, gitignored — HF-synced)
 *   data/_state/ryokan_registry/ingest_report.json (committed summary)
 *
 * Usage:
 *   npx tsx scrapers/sources/fetch_ryokan_facilities.ts
 *   npx tsx scrapers/sources/fetch_ryokan_facilities.ts --authority muni-131105
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { loadAuthorities, type Authority } from "./ryokan_authority_list.js";

const MATRIX_URL = new URL(
  "../../data/_state/ryokan_registry/catalog_matrix.json",
  import.meta.url,
);
const OUT_DIR = new URL("../../data/hotels/registry/", import.meta.url);
const REPORT_URL = new URL(
  "../../data/_state/ryokan_registry/ingest_report.json",
  import.meta.url,
);

const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; ryokan facility ingest)";
const RATE_LIMIT_MS = 1200;
const FETCH_TIMEOUT_MS = 60_000;

/* ------------------------------- schema ---------------------------------- */

export interface RegistryFacility {
  facility_name: string;
  address_raw: string | null;
  /** Normalized permit category; raw value preserved alongside. */
  category: "ryokan_hotel" | "kani_shukusho" | "geshuku" | null;
  category_raw: string | null;
  /** Permit number — the authority's own stable facility ID where published. */
  permit_no: string | null;
  permit_date_raw: string | null;
  phone: string | null;
  rooms: number | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
}

interface ColumnMap {
  name: string | null;
  address: string | null;
  category: string | null;
  permit_no: string | null;
  permit_date: string | null;
  phone: string | null;
  rooms: string | null;
  capacity: string | null;
  lat: string | null;
  lng: string | null;
  dropped_pii: string[];
  unmapped: string[];
}

/** Header aliases, matched on NFKC-normalized, whitespace-stripped headers. */
const ALIASES: Record<keyof Omit<ColumnMap, "dropped_pii" | "unmapped">, string[]> = {
  name: [
    "施設名称", "営業施設名称", "営業施設名", "施設名", "施設の名称",
    "営業所名称", "営業所の名称", "名称", "屋号", "ホテル・旅館名", "宿泊施設名",
  ],
  address: [
    "施設所在地", "営業施設所在地", "営業施設の所在地", "施設の所在地",
    "施設住所", "所在地住所", "所在地", "住所", "施設所在地住所",
  ],
  category: [
    "営業種別", "営業の種別", "営業種目", "許可の種類", "許可種別",
    "業種", "業態", "営業形態", "種別", "営業の種類",
  ],
  permit_no: ["許可番号", "許可確認番号", "許可(確認)番号"],
  permit_date: [
    "営業許可年月日", "許可年月日", "許可日", "営業許可日", "許可年月日西暦",
    "許可確認年月日",
  ],
  phone: ["施設電話番号", "電話番号", "TEL", "電話"],
  rooms: ["客室数", "部屋数", "和室数"],
  capacity: ["客室定員総計", "収容定員", "総定員数", "定員数", "定員", "収容"],
  lat: ["緯度"],
  lng: ["経度"],
};

/**
 * Never ingested — operator/applicant identity columns. 法人名/肩書 are
 * operator identity too (and hold personal names for sole proprietors).
 */
const PII_RE = /営業者|申請者|代表者|氏名|設置者|管理者|法人|肩書/;

/** Resource names that are delta files, not full rosters. */
const DELTA_RE = /新規|廃止|承継|停止|取消|処分|月分|変更/;

/* ------------------------------ helpers ---------------------------------- */

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function normHeader(h: string): string {
  return h.normalize("NFKC").replace(/[\s　()（）　]/g, "");
}

function decodeText(buf: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder("shift_jis").decode(buf);
  }
}

async function fetchBuf(url: string): Promise<Uint8Array> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      if (attempt >= 1) throw err;
      await sleep(3000);
    }
  }
}

interface CkanResource {
  id: string;
  name: string | null;
  format: string | null;
  url: string | null;
  last_modified: string | null;
  created: string | null;
}

async function ckanResources(catalogBase: string, datasetId: string): Promise<CkanResource[]> {
  const url = `${catalogBase}/action/package_show?id=${encodeURIComponent(datasetId)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = (await res.json()) as {
    success: boolean;
    result?: { resources?: Record<string, unknown>[] };
  };
  if (!body.success) throw new Error(`CKAN error for ${url}`);
  return (body.result?.resources ?? []).map((r) => ({
    id: String(r.id ?? ""),
    name: (r.name as string | null) ?? null,
    format: (r.format as string | null) ?? null,
    url: (r.url as string | null) ?? null,
    last_modified: (r.last_modified as string | null) ?? null,
    created: (r.created as string | null) ?? null,
  }));
}

/* ------------------------------ parsing ----------------------------------- */

function sheetRows(buf: Uint8Array, format: string): string[][] {
  const fmt = format.toLowerCase();
  let wb: XLSX.WorkBook;
  if (fmt.includes("csv")) {
    wb = XLSX.read(decodeText(buf), { type: "string", raw: true });
  } else {
    wb = XLSX.read(buf, { type: "array" });
  }
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return rows.map((r) => r.map((c) => String(c ?? "").trim()));
}

/** Find the header row: first row (within the top 15) that maps a name column. */
function findHeader(rows: string[][]): { index: number; map: ColumnMap } | null {
  for (let i = 0; i < Math.min(rows.length, 15); i += 1) {
    const map = mapColumns(rows[i]);
    if (map.name !== null) return { index: i, map };
  }
  return null;
}

function mapColumns(headerRow: string[]): ColumnMap {
  const map: ColumnMap = {
    name: null, address: null, category: null, permit_no: null,
    permit_date: null, phone: null, rooms: null, capacity: null,
    lat: null, lng: null, dropped_pii: [], unmapped: [],
  };
  const claimed = new Set<number>();
  const fields = Object.keys(ALIASES) as (keyof typeof ALIASES)[];
  for (const field of fields) {
    for (const alias of ALIASES[field]) {
      const idx = headerRow.findIndex(
        (h, i) => !claimed.has(i) && normHeader(h).includes(normHeader(alias)),
      );
      if (idx >= 0) {
        // A header that names the operator is never a facility field.
        if (PII_RE.test(normHeader(headerRow[idx]))) continue;
        (map as unknown as Record<string, string>)[field] = String(idx);
        claimed.add(idx);
        break;
      }
    }
  }
  headerRow.forEach((h, i) => {
    if (claimed.has(i) || h === "") return;
    if (PII_RE.test(normHeader(h))) map.dropped_pii.push(h);
    else map.unmapped.push(h);
  });
  return map;
}

/**
 * All-permit-type ledgers (food business, barber shops, …) surface in the
 * catalog sweep because 旅館業 is one permit type among many. A category
 * value naming a non-lodging trade is never a lodging permit, even when it
 * also mentions ホテル (e.g. 飲食店営業　ホテル・旅館 = a restaurant permit
 * INSIDE a hotel).
 */
const NON_LODGING_RE =
  /飲食|食品|喫茶|製造|販売|理容|美容|クリーニング|公衆浴場|興行場|プール|温泉利用|自動販売/;

function normalizeCategory(raw: string | null): RegistryFacility["category"] {
  if (!raw) return null;
  const v = raw.normalize("NFKC");
  if (NON_LODGING_RE.test(v)) return null;
  if (/簡易宿所/.test(v)) return "kani_shukusho";
  if (/下宿/.test(v)) return "geshuku";
  if (/旅館|ホテル/.test(v)) return "ryokan_hotel";
  return null;
}

function extractFacilities(
  rows: string[][],
  headerIdx: number,
  map: ColumnMap,
): { facilities: RegistryFacility[]; dropped_non_lodging: number } {
  const col = (field: keyof typeof ALIASES): number | null => {
    const v = (map as unknown as Record<string, string | null>)[field];
    return v === null ? null : Number(v);
  };
  const nameCol = col("name")!;
  const hasCategoryCol = col("category") !== null;
  const out: RegistryFacility[] = [];
  let droppedNonLodging = 0;
  for (const row of rows.slice(headerIdx + 1)) {
    const name = (row[nameCol] ?? "").trim();
    if (name === "" || normHeader(name) === "施設名称") continue;
    const cell = (field: keyof typeof ALIASES): string | null => {
      const c = col(field);
      const v = c === null ? "" : (row[c] ?? "").trim();
      return v === "" ? null : v;
    };
    const categoryRaw = cell("category");
    const category = normalizeCategory(categoryRaw);
    // When the source declares permit types, trust it: a populated category
    // that doesn't normalize to a lodging permit is another trade's permit
    // (all-permit ledgers mix food/barber/cleaning rows into the same file).
    if (hasCategoryCol && categoryRaw !== null && category === null) {
      droppedNonLodging += 1;
      continue;
    }
    const asCount = (v: string | null): number | null => {
      if (!v) return null;
      const n = Number(v.replace(/[^\d]/g, ""));
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const asCoord = (v: string | null): number | null => {
      if (!v) return null;
      const n = Number(v);
      return Number.isFinite(n) && n !== 0 ? n : null;
    };
    out.push({
      facility_name: name,
      address_raw: cell("address"),
      category,
      category_raw: categoryRaw,
      permit_no: cell("permit_no"),
      permit_date_raw: cell("permit_date"),
      phone: cell("phone"),
      rooms: asCount(cell("rooms")),
      capacity: asCount(cell("capacity")),
      lat: asCoord(cell("lat")),
      lng: asCoord(cell("lng")),
    });
  }
  return { facilities: out, dropped_non_lodging: droppedNonLodging };
}

/* -------------------------------- main ------------------------------------ */

interface MatrixDataset {
  catalog: string;
  ckan_id: string;
  ckan_name: string;
  title: string;
  landing_page: string;
  license: string | null;
  kind: string;
  tier: string;
}

interface MatrixAuthority extends Authority {
  datasets: MatrixDataset[];
}

interface AuthorityResult {
  authority_key: string;
  authority_name: string;
  status: "ingested" | "delta_only" | "no_resources" | "parse_failed" | "fetch_failed";
  dataset_title: string | null;
  resource_name: string | null;
  facility_count: number;
  by_category: Record<string, number>;
  /** Rows dropped because their declared permit type is a non-lodging trade. */
  dropped_non_lodging_rows: number;
  dropped_pii_columns: string[];
  unmapped_columns: string[];
  detail: string | null;
}

const CATALOG_BASES: Record<string, string> = {
  bodik: "https://data.bodik.jp/api/3",
  tokyo: "https://catalog.data.metro.tokyo.lg.jp/api/3",
  "e-gov": "https://data.e-gov.go.jp/data/api/3",
};

async function ingestAuthority(auth: MatrixAuthority): Promise<AuthorityResult> {
  const base = (r: Partial<AuthorityResult>): AuthorityResult => ({
    authority_key: auth.key,
    authority_name: `${auth.prefecture_name}${auth.kind === "prefecture" ? "" : " " + auth.name}`,
    status: "no_resources",
    dataset_title: null,
    resource_name: null,
    facility_count: 0,
    by_category: {},
    dropped_non_lodging_rows: 0,
    dropped_pii_columns: [],
    unmapped_columns: [],
    detail: null,
    ...r,
  });

  const candidates = auth.datasets.filter(
    (d) => d.kind === "facility_list" && (d.tier === "A" || d.tier === "unknown"),
  );
  if (candidates.length === 0) return base({ status: "no_resources", detail: "no tier-A facility_list dataset" });

  // Gather roster resources across the authority's datasets; best one wins.
  let best: {
    ds: MatrixDataset;
    res: CkanResource;
    facilities: RegistryFacility[];
    map: ColumnMap;
    dropped: number;
  } | null = null;
  let sawDelta = false;
  let lastError: string | null = null;

  for (const ds of candidates) {
    let resources: CkanResource[];
    try {
      resources = await ckanResources(CATALOG_BASES[ds.catalog], ds.ckan_id);
    } catch (err) {
      lastError = `package_show failed for ${ds.ckan_id}: ${err instanceof Error ? err.message : err}`;
      continue;
    }
    const tabular = resources.filter((r) => /csv|xlsx|xls/i.test(r.format ?? "") && r.url);
    // Mixed-trade datasets (環境衛生営業施設一覧) ship one file per trade —
    // a クリーニング所 file is never our roster, whatever its recency.
    const rosters = tabular.filter(
      (r) =>
        !DELTA_RE.test(r.name ?? "") &&
        !/クリーニング|理容|美容|浴場|興行|洗濯/.test(r.name ?? ""),
    );
    if (tabular.length > 0 && rosters.length === 0) sawDelta = true;
    // Lodging-named resources first, then newest (last_modified, then created).
    const lodgingNamed = (r: CkanResource): number =>
      /旅館|ホテル|宿泊|簡易宿所/.test(r.name ?? "") ? 1 : 0;
    rosters.sort(
      (a, b) =>
        lodgingNamed(b) - lodgingNamed(a) ||
        (b.last_modified ?? b.created ?? "").localeCompare(a.last_modified ?? a.created ?? ""),
    );
    for (const res of rosters) {
      try {
        await sleep(RATE_LIMIT_MS);
        const buf = await fetchBuf(res.url!);
        const rows = sheetRows(buf, res.format ?? "csv");
        const header = findHeader(rows);
        if (!header) {
          lastError = `no recognizable header in "${res.name}" (${ds.title})`;
          continue;
        }
        const { facilities, dropped_non_lodging } = extractFacilities(rows, header.index, header.map);
        if (facilities.length === 0) {
          lastError =
            dropped_non_lodging > 0
              ? `all ${dropped_non_lodging} rows in "${res.name}" carry non-lodging permit types (${ds.title})`
              : `0 rows extracted from "${res.name}" (${ds.title})`;
          continue;
        }
        if (!best || facilities.length > best.facilities.length) {
          best = { ds, res, facilities, map: header.map, dropped: dropped_non_lodging };
        }
        break; // newest parseable roster per dataset is enough
      } catch (err) {
        lastError = `fetch/parse failed for "${res.name}": ${err instanceof Error ? err.message : err}`;
      }
    }
  }

  if (!best) {
    if (sawDelta) return base({ status: "delta_only", detail: "only 新規/廃止 delta files published" });
    return base({
      status: lastError?.startsWith("fetch") ? "fetch_failed" : "parse_failed",
      detail: lastError ?? "no tabular (CSV/XLSX) resources on any candidate dataset",
    });
  }

  const byCategory: Record<string, number> = {};
  for (const f of best.facilities) {
    const k = f.category ?? "uncategorized";
    byCategory[k] = (byCategory[k] ?? 0) + 1;
  }

  const outPath = fileURLToPath(new URL(`${auth.key}.json`, OUT_DIR));
  await mkdir(dirname(outPath), { recursive: true });
  const payload = {
    schema_version: 1,
    authority: {
      key: auth.key,
      name: auth.name,
      kind: auth.kind,
      prefecture_code: auth.prefecture_code,
      prefecture_name: auth.prefecture_name,
    },
    source: {
      catalog: best.ds.catalog,
      dataset_title: best.ds.title,
      landing_page: best.ds.landing_page,
      resource_name: best.res.name,
      resource_url: best.res.url,
      license: best.ds.license,
      resource_last_modified: best.res.last_modified ?? best.res.created,
      retrieved_at: new Date().toISOString(),
    },
    pii_policy: "operator/applicant identity columns dropped at ingest",
    facility_count: best.facilities.length,
    facilities: best.facilities,
  };
  const tmp = outPath + ".tmp";
  await writeFile(tmp, JSON.stringify(payload, null, 1), "utf8");
  await rename(tmp, outPath);

  return base({
    status: "ingested",
    dataset_title: best.ds.title,
    resource_name: best.res.name,
    facility_count: best.facilities.length,
    by_category: byCategory,
    dropped_non_lodging_rows: best.dropped,
    dropped_pii_columns: best.map.dropped_pii,
    unmapped_columns: best.map.unmapped,
  });
}

async function main(): Promise<void> {
  const onlyKey = process.argv.includes("--authority")
    ? process.argv[process.argv.indexOf("--authority") + 1]
    : null;

  const authorities = await loadAuthorities();
  const matrix = JSON.parse(await readFile(MATRIX_URL, "utf8")) as {
    authorities: MatrixAuthority[];
  };
  const byKey = new Map(matrix.authorities.map((a) => [a.key, a]));

  const targets = authorities
    .map((a) => byKey.get(a.key))
    .filter((a): a is MatrixAuthority => !!a && a.datasets.some((d) => d.kind === "facility_list"))
    .filter((a) => (onlyKey ? a.key === onlyKey : true));

  console.error(`[ryokan_facilities] ${targets.length} authorities with facility lists`);
  const results: AuthorityResult[] = [];
  for (const auth of targets) {
    const r = await ingestAuthority(auth);
    results.push(r);
    console.error(
      `[ryokan_facilities] ${r.authority_name}: ${r.status}` +
        (r.status === "ingested" ? ` ${r.facility_count} facilities (${r.dataset_title})` : ` — ${r.detail ?? ""}`),
    );
  }

  if (onlyKey) {
    // Single-authority runs are debugging aids — never clobber the full report.
    console.error(`\n[ryokan_facilities] --authority run complete (report not rewritten)`);
    return;
  }

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    pii_policy: "operator/applicant identity columns dropped at ingest",
    totals: {
      authorities_attempted: results.length,
      ingested: results.filter((r) => r.status === "ingested").length,
      facilities: results.reduce((s, r) => s + r.facility_count, 0),
    },
    results,
  };
  const tmp = fileURLToPath(REPORT_URL) + ".tmp";
  await mkdir(dirname(fileURLToPath(REPORT_URL)), { recursive: true });
  await writeFile(tmp, JSON.stringify(report, null, 2), "utf8");
  await rename(tmp, fileURLToPath(REPORT_URL));
  console.error(`\n[ryokan_facilities] ingested ${report.totals.ingested}/${results.length} authorities, ` +
    `${report.totals.facilities} facilities`);
  console.error(`[ryokan_facilities] wrote ${fileURLToPath(REPORT_URL)}`);
}

main().catch((err) => {
  console.error("[fetch_ryokan_facilities] fatal:", err);
  process.exitCode = 1;
});
