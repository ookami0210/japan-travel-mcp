/**
 * Discover the per-municipality tourism-association / official tourism portal
 * URL graph for all 1,938 municipalities + designated-city wards. Output is
 * the second source of crawl seeds the multi-source sprint relies on
 * (ADR 0001).
 *
 * Three strategies, all run unless --skip is passed:
 *
 *   1. Prefecture-portal harvest. We fetch each of the 47 prefecture-level
 *      tourism portals (data/_state/prefecture_tourism_orgs.json), do a
 *      bounded BFS over their pages, and extract anchors whose link text
 *      mentions a municipality from data/_state/municipalities.json. The
 *      anchor's href becomes a candidate URL for that municipality.
 *
 *   2. Wikidata SPARQL. For each municipality with a JIS code, we query
 *      Wikidata for any URL property (P856 official website, P973
 *      described-at-URL) on entities anchored to that JIS code via P429.
 *      Candidates that look like a tourism site (subdomain or path
 *      contains 'kanko' / 'tourism' / 'travel' / 'visit') are kept.
 *
 *   3. DNS pattern probe. For each municipality, we generate ~8 plausible
 *      tourism-domain patterns (kanko-{slug}.jp, {slug}-kanko.jp,
 *      visit-{slug}.jp, {slug}.travel, etc.) and probe each with a HEAD
 *      request. Anything that returns 200 is a candidate.
 *
 * The three strategies populate `data/_state/tourism_org_urls.json` with
 * per-municipality candidate lists, source and confidence tags. A subsequent
 * pass selects a primary URL per municipality.
 *
 * Run:
 *   # full: all 47 prefectures + all 1,938 municipalities (~60-90 min)
 *   ANTHROPIC_API_KEY=... npx tsx scrapers/sources/discover_tourism_orgs.ts
 *
 *   # batch 1 of 3 (JIS prefecture codes 01-15):
 *   BATCH=1 npx tsx scrapers/sources/discover_tourism_orgs.ts
 *
 *   # skip a strategy:
 *   SKIP=dns npx tsx scrapers/sources/discover_tourism_orgs.ts
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const ROOT = new URL("../../", import.meta.url);
const MUNI_PATH = new URL("data/_state/municipalities.json", ROOT);
const PREF_PORTALS_PATH = new URL(
  "data/_state/prefecture_tourism_orgs.json",
  ROOT,
);
const OUT_PATH = new URL("data/_state/tourism_org_urls.json", ROOT);
const STATE_PATH = new URL(
  "data/_state/tourism_org_discovery_state.json",
  ROOT,
);

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT =
  "JapanTravelMCP/1.0 (+https://github.com/ookami0210/japan-travel-mcp; tourism-org discovery)";

const RATE_LIMIT_MS = 1500;
const MAX_PAGES_PER_PORTAL = 40;
const SPARQL_DELAY_MS = 800;
const DNS_PROBE_TIMEOUT_MS = 5_000;

// Prefecture-codes per batch. Three roughly-equal batches keep each run
// under ~120 minutes (the KJ-PC budget).
const BATCHES: Record<number, string[]> = {
  1: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
      "11", "12", "13", "14", "15"],
  2: ["16", "17", "18", "19", "20", "21", "22", "23", "24", "25",
      "26", "27", "28", "29", "30", "31", "32"],
  3: ["33", "34", "35", "36", "37", "38", "39", "40", "41", "42",
      "43", "44", "45", "46", "47"],
};

// ──────────────────────────────────────────────────────────────────────
// Types

interface MunicipalityRow {
  code: string;
  prefecture_code: string;
  prefecture_name: string;
  name: string;
}

interface PrefecturePortal {
  code: string;
  name_en: string;
  name_ja: string;
  url: string;
}

type CandidateSource =
  | "prefecture_portal"
  | "wikidata_p856"
  | "wikidata_p973"
  | "dns_pattern";

interface Candidate {
  url: string;
  source: CandidateSource;
  confidence: "high" | "medium" | "low";
  evidence?: string;
}

interface MunicipalityEntry {
  code: string;
  prefecture_code: string;
  name: string;
  candidates: Candidate[];
  primary?: string | null;
  primary_source?: CandidateSource | null;
  last_discovered_at?: string;
}

// ──────────────────────────────────────────────────────────────────────
// Loading

async function loadMunicipalities(): Promise<MunicipalityRow[]> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(MUNI_PATH), "utf8"),
  ) as { municipalities: MunicipalityRow[] };
  return raw.municipalities;
}

async function loadPortals(): Promise<PrefecturePortal[]> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(PREF_PORTALS_PATH), "utf8"),
  ) as { prefectures: PrefecturePortal[] };
  return raw.prefectures;
}

async function loadExisting(): Promise<Map<string, MunicipalityEntry>> {
  const map = new Map<string, MunicipalityEntry>();
  if (!existsSync(fileURLToPath(OUT_PATH))) return map;
  try {
    const raw = JSON.parse(
      await readFile(fileURLToPath(OUT_PATH), "utf8"),
    ) as { entries: MunicipalityEntry[] };
    for (const e of raw.entries ?? []) map.set(e.code, e);
  } catch {
    // start fresh on parse error
  }
  return map;
}

// ──────────────────────────────────────────────────────────────────────
// Strategy 1: prefecture-portal harvest

const TOURISM_HINT_RE =
  /kanko|kankou|tourism|travel|visit|sightseeing|観光|旅行|まちあるき|ガイド/i;

const SKIP_HOST_RE = /facebook|twitter|instagram|youtube|line\.me|t\.co|google\./i;

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept-Language": "ja" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml/i.test(ct)) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function sameSiteOrTourism(href: string, base: URL): boolean {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (SKIP_HOST_RE.test(u.hostname)) return false;
    if (u.hostname === base.hostname) return true;
    return TOURISM_HINT_RE.test(u.hostname + u.pathname);
  } catch {
    return false;
  }
}

/** BFS the prefecture portal, collecting (link-text, href) pairs. */
async function harvestPortal(
  portal: PrefecturePortal,
): Promise<Array<{ text: string; href: string }>> {
  const collected: Array<{ text: string; href: string }> = [];
  const seen = new Set<string>();
  const queue: string[] = [portal.url];
  let base: URL;
  try {
    base = new URL(portal.url);
  } catch {
    return [];
  }

  while (queue.length > 0 && seen.size < MAX_PAGES_PER_PORTAL) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const html = await fetchHtml(next);
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
    if (!html) continue;
    const $ = cheerio.load(html);
    $("a[href]").each((_, el) => {
      const text = ($(el).text() ?? "").replace(/\s+/g, " ").trim();
      const href = $(el).attr("href") ?? "";
      if (!text || !href) return;
      try {
        const abs = new URL(href, base).href;
        collected.push({ text, href: abs });
        // Enqueue same-site or tourism-hinted internal pages for further
        // harvesting; cap by MAX_PAGES_PER_PORTAL.
        if (sameSiteOrTourism(href, base) && new URL(abs).hostname === base.hostname) {
          if (!seen.has(abs) && queue.length + seen.size < MAX_PAGES_PER_PORTAL) {
            queue.push(abs);
          }
        }
      } catch {
        // skip invalid url
      }
    });
  }
  return collected;
}

/**
 * For each link harvested from a portal, attribute it to a municipality if
 * the link text contains the municipality's name. Some municipalities share
 * common substrings (e.g. 府中市 in Tokyo and Hiroshima); we restrict matches
 * to municipalities of the *same* prefecture as the portal.
 */
function attributeLinksToMunicipalities(
  portalCode: string,
  links: Array<{ text: string; href: string }>,
  municipalities: MunicipalityRow[],
): Map<string, Array<{ text: string; href: string }>> {
  const inPref = municipalities.filter((m) => m.prefecture_code === portalCode);
  // longest first so 西置賜郡白鷹町 matches before 白鷹町
  const sorted = [...inPref].sort((a, b) => b.name.length - a.name.length);
  const out = new Map<string, Array<{ text: string; href: string }>>();
  for (const l of links) {
    for (const m of sorted) {
      if (l.text.includes(m.name)) {
        if (!out.has(m.code)) out.set(m.code, []);
        out.get(m.code)!.push(l);
        break; // attribute to longest-match only
      }
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Strategy 2: Wikidata SPARQL

interface SparqlBinding {
  muni?: { value: string };
  adminCode?: { value: string };
  officialSite?: { value: string };
  describedAt?: { value: string };
}

async function queryWikidataForPrefecture(
  prefCode: string,
): Promise<SparqlBinding[]> {
  const query = `
SELECT ?muni ?adminCode ?officialSite ?describedAt WHERE {
  ?muni wdt:P429 ?adminCode .
  FILTER(STRSTARTS(?adminCode, "${prefCode}"))
  OPTIONAL { ?muni wdt:P856 ?officialSite . }
  OPTIONAL { ?muni wdt:P973 ?describedAt . }
}
LIMIT 5000
`.trim();
  const url = `${SPARQL_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/sparql-results+json",
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { results: { bindings: SparqlBinding[] } };
    return json.results.bindings;
  } catch {
    return [];
  }
}

function isTourismUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return TOURISM_HINT_RE.test(u.hostname + u.pathname);
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Strategy 3: DNS pattern probe
//
// Only generate ASCII slugs; municipalities whose names romanise into very
// short forms (e.g. "市") would produce too-broad probes, so we require >= 4
// chars after slugification.

function slugifyMunicipality(name: string): string | null {
  // crude heuristic: many tourism domains use the city name without the 市/町/村 suffix
  const base = name
    .replace(/[市町村区]$/u, "")
    .replace(/[ぁ-んァ-ヴ一-龯々ー]/g, "");
  if (base.length < 3) return null;
  return base.toLowerCase();
}

// Slug pulled from prefecture_tourism_orgs.json `name_en`-style; falls back
// to municipalities whose romaji we already know via Wikidata. For the first
// pass we only probe municipalities whose Wikidata candidate already includes
// a romaji-looking string — keeps the probe count down.

const DNS_PATTERNS = (slug: string) => [
  `https://kanko-${slug}.jp`,
  `https://${slug}-kanko.jp`,
  `https://www.${slug}-kanko.jp`,
  `https://visit-${slug}.jp`,
  `https://${slug}.travel`,
  `https://${slug}-tourism.jp`,
  `https://www.${slug}.jp`,
];

async function probeUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(DNS_PROBE_TIMEOUT_MS),
      headers: { "User-Agent": USER_AGENT },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ──────────────────────────────────────────────────────────────────────
// Merge candidates into entries

function mergeCandidates(
  entries: Map<string, MunicipalityEntry>,
  code: string,
  prefCode: string,
  name: string,
  cands: Candidate[],
): void {
  if (cands.length === 0) return;
  let entry = entries.get(code);
  if (!entry) {
    entry = {
      code,
      prefecture_code: prefCode,
      name,
      candidates: [],
    };
    entries.set(code, entry);
  }
  const seen = new Set(entry.candidates.map((c) => c.url + "|" + c.source));
  for (const c of cands) {
    const k = c.url + "|" + c.source;
    if (!seen.has(k)) {
      entry.candidates.push(c);
      seen.add(k);
    }
  }
  entry.last_discovered_at = new Date().toISOString();
}

function pickPrimary(entry: MunicipalityEntry): void {
  if (entry.candidates.length === 0) {
    entry.primary = null;
    entry.primary_source = null;
    return;
  }
  // Confidence priority: high > medium > low.
  // Source priority within same confidence: prefecture_portal (most curated)
  // > wikidata_p856 > wikidata_p973 > dns_pattern.
  const SOURCE_RANK: Record<CandidateSource, number> = {
    prefecture_portal: 0,
    wikidata_p856: 1,
    wikidata_p973: 2,
    dns_pattern: 3,
  };
  const CONF_RANK = { high: 0, medium: 1, low: 2 };
  const sorted = [...entry.candidates].sort((a, b) => {
    const c = CONF_RANK[a.confidence] - CONF_RANK[b.confidence];
    if (c !== 0) return c;
    return SOURCE_RANK[a.source] - SOURCE_RANK[b.source];
  });
  entry.primary = sorted[0].url;
  entry.primary_source = sorted[0].source;
}

// ──────────────────────────────────────────────────────────────────────
// Save

async function save(entries: Map<string, MunicipalityEntry>): Promise<void> {
  const all = [...entries.values()].sort((a, b) => a.code.localeCompare(b.code));
  const haveCandidates = all.filter((e) => e.candidates.length > 0).length;
  const havePrimary = all.filter((e) => e.primary).length;
  const out = {
    schema_version: 1,
    fetched_at: new Date().toISOString(),
    summary: {
      total_municipalities_seen: all.length,
      with_at_least_one_candidate: haveCandidates,
      with_primary: havePrimary,
    },
    entries: all,
  };
  await mkdir(dirname(fileURLToPath(OUT_PATH)), { recursive: true });
  await writeFile(fileURLToPath(OUT_PATH), JSON.stringify(out, null, 2), "utf8");
  process.stderr.write(
    `[discover] wrote ${all.length} entries (${haveCandidates} with candidates, ${havePrimary} with primary)\n`,
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main

async function main(): Promise<void> {
  const skip = new Set((process.env.SKIP ?? "").split(",").map((s) => s.trim()));
  const batch = parseInt(process.env.BATCH ?? "0", 10);
  const onlyPrefs =
    batch >= 1 && batch <= 3 ? new Set(BATCHES[batch]) : null;

  const munis = await loadMunicipalities();
  const portals = await loadPortals();
  const entries = await loadExisting();

  // Filter targets by batch.
  const targetMunis = onlyPrefs
    ? munis.filter((m) => onlyPrefs.has(m.prefecture_code))
    : munis;
  const targetPortals = onlyPrefs
    ? portals.filter((p) => onlyPrefs.has(p.code))
    : portals;

  process.stderr.write(
    `[discover] batch ${batch || "all"} — ${targetMunis.length} municipalities, ` +
      `${targetPortals.length} prefecture portals\n`,
  );

  // ── Strategy 1 ────────────────────────────────────────────────────
  if (!skip.has("portal")) {
    process.stderr.write(`[discover/portal] starting...\n`);
    let portalIdx = 0;
    for (const portal of targetPortals) {
      portalIdx += 1;
      process.stderr.write(
        `[discover/portal] ${portalIdx}/${targetPortals.length}: ${portal.name_en} (${portal.url})\n`,
      );
      const links = await harvestPortal(portal);
      const attributed = attributeLinksToMunicipalities(
        portal.code,
        links,
        munis,
      );
      let attrCount = 0;
      for (const [code, ls] of attributed) {
        const m = munis.find((x) => x.code === code);
        if (!m) continue;
        // Dedupe URLs within attribution
        const seen = new Set<string>();
        const cands: Candidate[] = [];
        for (const l of ls) {
          try {
            const u = new URL(l.href);
            const key = u.hostname + u.pathname;
            if (seen.has(key)) continue;
            seen.add(key);
            // Cross-prefecture URL or city-hall URL → low confidence
            const conf =
              u.hostname.endsWith(".lg.jp") ? "low" : "high";
            cands.push({
              url: l.href,
              source: "prefecture_portal",
              confidence: conf,
              evidence: l.text.slice(0, 80),
            });
          } catch {}
        }
        mergeCandidates(entries, m.code, m.prefecture_code, m.name, cands);
        attrCount += cands.length;
      }
      process.stderr.write(
        `[discover/portal]   ${attributed.size} municipalities matched, ${attrCount} candidate URLs\n`,
      );
      // Save after every portal so a crash doesn't lose hours of work.
      await save(entries);
    }
  }

  // ── Strategy 2 ────────────────────────────────────────────────────
  if (!skip.has("wikidata")) {
    process.stderr.write(`[discover/wikidata] starting...\n`);
    const targetPrefs = onlyPrefs
      ? [...onlyPrefs]
      : Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, "0"));
    let prefIdx = 0;
    for (const pref of targetPrefs) {
      prefIdx += 1;
      const bindings = await queryWikidataForPrefecture(pref);
      let added = 0;
      for (const b of bindings) {
        const adminCode = b.adminCode?.value;
        if (!adminCode) continue;
        const m = targetMunis.find((x) => x.code === adminCode);
        if (!m) continue;
        const cands: Candidate[] = [];
        if (b.officialSite?.value && isTourismUrl(b.officialSite.value)) {
          cands.push({
            url: b.officialSite.value,
            source: "wikidata_p856",
            confidence: "medium",
          });
        }
        if (b.describedAt?.value && isTourismUrl(b.describedAt.value)) {
          cands.push({
            url: b.describedAt.value,
            source: "wikidata_p973",
            confidence: "medium",
          });
        }
        if (cands.length > 0) {
          mergeCandidates(entries, m.code, m.prefecture_code, m.name, cands);
          added += cands.length;
        }
      }
      process.stderr.write(
        `[discover/wikidata] ${prefIdx}/${targetPrefs.length} pref ${pref}: ${bindings.length} bindings, ${added} tourism URLs\n`,
      );
      await new Promise((r) => setTimeout(r, SPARQL_DELAY_MS));
    }
    await save(entries);
  }

  // ── Strategy 3 ────────────────────────────────────────────────────
  // DNS probe is the broadest and noisiest; skip by default unless asked.
  // Slug generation requires romaji which we don't carry yet for most
  // municipalities, so coverage will be limited until we add a romaji
  // column to municipalities.json.
  if (skip.has("dns") || !process.env.ENABLE_DNS_PROBE) {
    process.stderr.write(
      `[discover/dns] skipped (set ENABLE_DNS_PROBE=1 to run)\n`,
    );
  } else {
    process.stderr.write(`[discover/dns] starting...\n`);
    let probed = 0;
    for (const m of targetMunis) {
      const slug = slugifyMunicipality(m.name);
      if (!slug) continue;
      const patterns = DNS_PATTERNS(slug);
      const cands: Candidate[] = [];
      for (const url of patterns) {
        if (await probeUrl(url)) {
          cands.push({ url, source: "dns_pattern", confidence: "low" });
        }
      }
      if (cands.length > 0) {
        mergeCandidates(entries, m.code, m.prefecture_code, m.name, cands);
      }
      probed += 1;
      if (probed % 50 === 0) {
        process.stderr.write(
          `[discover/dns] probed ${probed}/${targetMunis.length}\n`,
        );
        await save(entries);
      }
    }
    await save(entries);
  }

  // ── Pick primary ──────────────────────────────────────────────────
  for (const e of entries.values()) pickPrimary(e);
  await save(entries);

  // Persist run state for batched runs.
  await writeFile(
    fileURLToPath(STATE_PATH),
    JSON.stringify(
      { last_run_at: new Date().toISOString(), batch, skip: [...skip] },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(`[discover] done.\n`);
}

main().catch((err) => {
  console.error("[discover] FAILED:", err);
  process.exit(1);
});
