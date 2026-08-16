/**
 * Ryokan-gyo permit-registry discovery — CKAN cross-catalog survey.
 *
 * WHY: no nationwide ledger of Hotel Business Act (旅館業法) permit
 * facilities exists — publication is a patchwork across 157 permit
 * authorities (see ryokan_authority_list.ts). Before building the hotel
 * ledger's public-verification layer we need a coverage matrix: which
 * authority publishes a permit-facility list, where, and in what format.
 *
 * This script sweeps CKAN catalogs (federated + regional), matches hits to
 * the 157 authorities, classifies each dataset's best format tier, and
 * writes the machine-readable matrix. Authorities absent from every swept
 * catalog become the worklist for the direct-survey pass (official-site
 * search), NOT a conclusion that they publish nothing.
 *
 * Format tiers (ingestion cost ladder):
 *   A    = CSV / XLSX / JSON / API  (machine-readable, direct ingest)
 *   B    = HTML table               (scrape)
 *   C/D  = PDF                      (text vs. scanned undetermined until
 *                                    downloaded; both feed one
 *                                    vision-structured-extraction pipeline)
 *   E    = not present in any swept catalog (needs direct survey)
 *
 * Output: data/_state/ryokan_registry/catalog_matrix.json
 *
 * Usage:
 *   npx tsx scrapers/sources/discover_ryokan_registries.ts
 */

import { mkdir, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  loadAuthorities,
  type Authority,
} from "./ryokan_authority_list.js";

const OUT_URL = new URL(
  "../../data/_state/ryokan_registry/catalog_matrix.json",
  import.meta.url,
);

const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; ryokan-registry discovery)";

const RATE_LIMIT_MS = 1200;
const FETCH_TIMEOUT_MS = 30_000;
const PAGE_SIZE = 100;
/** Per-query hit cap — CKAN full-text search degrades into noise long before this. */
const MAX_HITS_PER_QUERY = 600;

interface Catalog {
  id: string;
  /** CKAN API v3 base, e.g. https://data.bodik.jp/api/3 */
  base: string;
  note: string;
}

/**
 * Swept catalogs. Verified reachable 2026-08-16. data.go.jp now redirects
 * to data.e-gov.go.jp (national ministries only — kept for completeness,
 * its facility-list yield is ~zero). BODIK hosts 100+ municipal orgs
 * nationwide; the Tokyo catalog carries 都 + 区市町村 datasets.
 */
const CATALOGS: Catalog[] = [
  { id: "bodik", base: "https://data.bodik.jp/api/3", note: "BODIK ODCS (multi-municipality)" },
  { id: "tokyo", base: "https://catalog.data.metro.tokyo.lg.jp/api/3", note: "東京都オープンデータカタログ" },
  { id: "e-gov", base: "https://data.e-gov.go.jp/data/api/3", note: "国 (旧 data.go.jp)" },
];

/** Phrase queries (sent quoted — unquoted CJK queries explode into noise). */
const QUERIES = [
  "旅館業",
  "旅館業法",
  "ホテル営業",
  "簡易宿所",
  "旅館・ホテル",
  // Tokyo special wards title their permit ledgers 宿泊施設（旅館台帳）.
  "宿泊施設",
  "旅館台帳",
];

/** Any lodging-domain signal at all (title + notes + resource names). */
const RELEVANT_RE = /旅館|ホテル|簡易宿所|宿泊/;
/** Permit-ledger vocabulary. */
const PERMIT_RE = /旅館業|ホテル営業|簡易宿所|旅館・ホテル|ホテル・旅館|旅館台帳|下宿営業/;
/** Facility-enumeration vocabulary. */
const LIST_RE = /一覧|施設|台帳|名簿|営業許可|許可施設/;
/** Statistics, not facility enumerations (施設数 = counts, not a ledger). */
const STATS_RE = /衛生行政報告|統計|年報|件数|施設数/;
/**
 * Energy-reporting datasets keep surfacing in lodging queries because
 * ホテル・旅館 is a building-use category in CO2 benchmark tables.
 */
const NOT_LIST_TITLE_RE = /ベンチマーク|温暖化|排出|ＣＯ２|CO2/;

type DatasetKind = "facility_list" | "stats" | "related";
type Tier = "A" | "B" | "C/D" | "unknown";

interface DatasetHit {
  catalog: string;
  ckan_id: string;
  ckan_name: string;
  title: string;
  organization: string | null;
  landing_page: string;
  license: string | null;
  metadata_modified: string | null;
  formats: string[];
  resource_count: number;
  kind: DatasetKind;
  tier: Tier;
  matched_queries: string[];
}

interface AuthorityRow extends Authority {
  datasets: DatasetHit[];
  facility_list_found: boolean;
  best_tier: Tier | "E";
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function ckanSearch(
  catalog: Catalog,
  query: string,
  start: number,
): Promise<{ count: number; results: Record<string, unknown>[] }> {
  const url =
    `${catalog.base}/action/package_search?q=${encodeURIComponent(`"${query}"`)}` +
    `&rows=${PAGE_SIZE}&start=${start}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const body = (await res.json()) as {
    success: boolean;
    result?: { count: number; results: Record<string, unknown>[] };
  };
  if (!body.success || !body.result) throw new Error(`CKAN error for ${url}`);
  return body.result;
}

function classifyTier(formats: string[]): Tier {
  const f = formats.map((x) => x.toLowerCase());
  if (f.some((x) => /csv|xlsx|xls|json|api|rdf|geojson/.test(x))) return "A";
  if (f.some((x) => /html/.test(x))) return "B";
  if (f.some((x) => /pdf/.test(x))) return "C/D";
  return "unknown";
}

function classifyKind(title: string, text: string): DatasetKind | null {
  if (!RELEVANT_RE.test(text)) return null;
  // The publisher's own title wins: 施設数/統計年鑑 are counts even when the
  // notes quote permit-law vocabulary.
  if (STATS_RE.test(title)) return "stats";
  if (NOT_LIST_TITLE_RE.test(title)) return "related";
  if (STATS_RE.test(text) && !LIST_RE.test(text)) return "stats";
  if (PERMIT_RE.test(text) && LIST_RE.test(text)) return "facility_list";
  return "related";
}

function toHit(
  catalog: Catalog,
  pkg: Record<string, unknown>,
  query: string,
): DatasetHit | null {
  const title = String(pkg.title ?? "");
  const notes = String(pkg.notes ?? "");
  const resources = (pkg.resources ?? []) as {
    format?: string;
    name?: string;
  }[];
  const resourceNames = resources.map((r) => r.name ?? "").join(" ");
  const kind = classifyKind(title, `${title} ${notes} ${resourceNames}`);
  if (kind === null) return null;

  const org = (pkg.organization ?? null) as { title?: string } | null;
  const formats = [
    ...new Set(resources.map((r) => (r.format ?? "").trim()).filter(Boolean)),
  ];
  const siteBase = catalog.base.replace(/\/api\/3$/, "");
  return {
    catalog: catalog.id,
    ckan_id: String(pkg.id ?? ""),
    ckan_name: String(pkg.name ?? ""),
    title,
    organization: org?.title ?? null,
    landing_page: `${siteBase}/dataset/${String(pkg.name ?? pkg.id ?? "")}`,
    license: (pkg.license_title as string | null) ?? (pkg.license_id as string | null) ?? null,
    metadata_modified: (pkg.metadata_modified as string | null) ?? null,
    formats,
    resource_count: resources.length,
    kind,
    tier: classifyTier(formats),
    matched_queries: [query],
  };
}

/**
 * Attribute a dataset to an authority via its publishing organization.
 * Longest-name-first containment so 東大阪市 never falls through to 大阪市.
 */
function buildAttributor(authorities: Authority[]): (org: string | null) => Authority | null {
  const sorted = [...authorities].sort((a, b) => b.name.length - a.name.length);
  return (org) => {
    if (!org) return null;
    const exact = sorted.find((a) => a.name === org);
    if (exact) return exact;
    return sorted.find((a) => org.includes(a.name)) ?? null;
  };
}

async function main(): Promise<void> {
  const authorities = await loadAuthorities();
  const attribute = buildAttributor(authorities);

  const hitsById = new Map<string, DatasetHit>(); // key = catalog:ckan_id
  const sweepLog: {
    catalog: string;
    query: string;
    count: number | null;
    kept: number;
    error: string | null;
  }[] = [];

  for (const catalog of CATALOGS) {
    for (const query of QUERIES) {
      let kept = 0;
      let count: number | null = null;
      try {
        let start = 0;
        for (;;) {
          const page = await ckanSearch(catalog, query, start);
          count = page.count;
          for (const pkg of page.results) {
            const hit = toHit(catalog, pkg, query);
            if (!hit) continue;
            const key = `${hit.catalog}:${hit.ckan_id}`;
            const existing = hitsById.get(key);
            if (existing) {
              if (!existing.matched_queries.includes(query)) {
                existing.matched_queries.push(query);
              }
            } else {
              hitsById.set(key, hit);
              kept += 1;
            }
          }
          start += PAGE_SIZE;
          if (start >= Math.min(count, MAX_HITS_PER_QUERY) || page.results.length === 0) break;
          await sleep(RATE_LIMIT_MS);
        }
        sweepLog.push({ catalog: catalog.id, query, count, kept, error: null });
        console.error(`[discover] ${catalog.id} "${query}": ${count} hits, +${kept} new kept`);
      } catch (err) {
        // Isolate per catalog×query — one dead endpoint must not sink the survey.
        const msg = err instanceof Error ? err.message : String(err);
        sweepLog.push({ catalog: catalog.id, query, count, kept, error: msg });
        console.error(`[discover] ${catalog.id} "${query}": FAILED — ${msg}`);
      }
      await sleep(RATE_LIMIT_MS);
    }
  }

  // Attribute every hit to an authority (or the unattributed bucket).
  const rows = new Map<string, AuthorityRow>(
    authorities.map((a) => [
      a.key,
      { ...a, datasets: [], facility_list_found: false, best_tier: "E" as const },
    ]),
  );
  const unattributed: DatasetHit[] = [];

  for (const hit of hitsById.values()) {
    const auth = attribute(hit.organization);
    if (!auth) {
      unattributed.push(hit);
      continue;
    }
    rows.get(auth.key)!.datasets.push(hit);
  }

  const tierRank: Record<Tier, number> = { A: 3, B: 2, "C/D": 1, unknown: 0 };
  for (const row of rows.values()) {
    const lists = row.datasets.filter((d) => d.kind === "facility_list");
    row.facility_list_found = lists.length > 0;
    if (lists.length > 0) {
      row.best_tier = lists.reduce((best, d) =>
        tierRank[d.tier] > tierRank[best.tier] ? d : best,
      ).tier;
    }
    row.datasets.sort((a, b) => tierRank[b.tier] - tierRank[a.tier]);
  }

  const rowList = [...rows.values()];
  const covered = rowList.filter((r) => r.facility_list_found);
  const summary = {
    authorities_total: rowList.length,
    facility_list_found: covered.length,
    by_tier: {
      A: covered.filter((r) => r.best_tier === "A").length,
      B: covered.filter((r) => r.best_tier === "B").length,
      "C/D": covered.filter((r) => r.best_tier === "C/D").length,
      unknown: covered.filter((r) => r.best_tier === "unknown").length,
      E: rowList.length - covered.length,
    },
    by_kind_datasets: {
      facility_list: [...hitsById.values()].filter((h) => h.kind === "facility_list").length,
      stats: [...hitsById.values()].filter((h) => h.kind === "stats").length,
      related: [...hitsById.values()].filter((h) => h.kind === "related").length,
    },
    unattributed_datasets: unattributed.length,
  };

  const out = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    method:
      "CKAN package_search phrase queries across federated/regional catalogs; " +
      "hits classified by vocabulary (facility_list/stats/related) and attributed " +
      "to permit authorities via publishing organization. E-tier means 'absent " +
      "from swept catalogs', not 'publishes nothing' — direct survey follows.",
    catalogs: CATALOGS,
    queries: QUERIES,
    sweep_log: sweepLog,
    summary,
    authorities: rowList,
    unattributed,
  };

  await mkdir(dirname(fileURLToPath(OUT_URL)), { recursive: true });
  const tmp = fileURLToPath(OUT_URL) + ".tmp";
  await writeFile(tmp, JSON.stringify(out, null, 2), "utf8");
  await rename(tmp, fileURLToPath(OUT_URL));

  console.error("\n=== coverage summary ===");
  console.error(JSON.stringify(summary, null, 2));
  console.error("\ncovered authorities (best tier):");
  for (const r of covered.sort((a, b) => a.key.localeCompare(b.key))) {
    console.error(`  [${r.best_tier}] ${r.prefecture_name} ${r.kind === "prefecture" ? "" : r.name} (${r.kind})`);
  }
  console.error(`\nwrote ${fileURLToPath(OUT_URL)}`);
}

main().catch((err) => {
  console.error("[discover_ryokan_registries] fatal:", err);
  process.exitCode = 1;
});
