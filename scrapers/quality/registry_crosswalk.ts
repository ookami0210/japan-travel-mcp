/**
 * Registry ↔ master crosswalk — match permit facilities (#44) against the
 * hotels master (Wikidata ∪ OSM) and quantify the expansion pool.
 *
 * WHY: the ledger target is ~40k ACTIVE facilities with official content;
 * the master currently holds ~20k. Permit rosters are one real-world signal:
 *   - a match = public verification for a master entry (permit provenance)
 *   - an unmatched permit facility = an expansion candidate the
 *     Wikidata/OSM sweep never saw (small ryokan / kani-shukusho long tail)
 * Permit data is a verification layer, not the spine — matches carry the
 * permit metadata onto master entries; unmatched candidates still need an
 * official-page check before they count as active inventory.
 *
 * Matching (within the authority's prefecture):
 *   confident: phone match + name overlap, or geo ≤150m + name sim ≥0.5,
 *              or unique name sim ≥0.85
 *   probable:  phone match alone, geo ≤50m + name sim ≥0.3, name sim 0.65–0.85
 *   unmatched: everything else → expansion pool
 *
 * Output:
 *   data/_state/ryokan_registry/crosswalk_summary.json  (committed)
 *   data/hotels/registry/_crosswalk_detail.json         (bulk, gitignored)
 *
 * Run: npx tsx scrapers/quality/registry_crosswalk.ts
 */

import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const REGISTRY_DIR = new URL("data/hotels/registry/", ROOT);
const SUMMARY_URL = new URL(
  "data/_state/ryokan_registry/crosswalk_summary.json",
  ROOT,
);
const DETAIL_URL = new URL("data/hotels/registry/_crosswalk_detail.json", ROOT);

/* ---------------------------- name similarity ----------------------------- */

const NOISE_RE = /株式会社|有限会社|合同会社|\s|　/g;

function normName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(NOISE_RE, "")
    .replace(/[()（）「」『』・･]/g, "");
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i += 1) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return (2 * inter) / (a.size + b.size);
}

function phoneDigits(s: string | null): string | null {
  if (!s) return null;
  const d = s.replace(/[^\d]/g, "");
  return d.length >= 9 ? d : null;
}

function distMeters(
  aLat: number, aLng: number, bLat: number, bLng: number,
): number {
  const dy = (aLat - bLat) * 111_320;
  const dx = (aLng - bLng) * 111_320 * Math.cos((aLat * Math.PI) / 180);
  return Math.sqrt(dx * dx + dy * dy);
}

/* --------------------------------- main ----------------------------------- */

interface MasterEntry {
  id: string;
  name: string | null;
  name_en: string | null;
  coordinates: { lat: number; lng: number } | null;
  phone: string | null;
  prefecture_code: string | null;
  type: string | null;
}

interface IndexedMaster {
  id: string;
  grams: Set<string>[];
  lat: number | null;
  lng: number | null;
  phone: string | null;
  displayName: string;
}

type MatchTier = "confident" | "probable" | "unmatched";

async function main(): Promise<void> {
  const master = JSON.parse(await readFile(MASTER_URL, "utf8")) as {
    hotels: MasterEntry[];
  };

  // Index master by prefecture.
  const byPref = new Map<string, IndexedMaster[]>();
  for (const h of master.hotels) {
    if (!h.prefecture_code) continue;
    const names = [h.name, h.name_en].filter((n): n is string => !!n);
    if (names.length === 0 && !h.coordinates) continue;
    const entry: IndexedMaster = {
      id: h.id,
      grams: names.map((n) => bigrams(normName(n))),
      lat: h.coordinates?.lat ?? null,
      lng: h.coordinates?.lng ?? null,
      phone: phoneDigits(h.phone),
      displayName: h.name ?? h.name_en ?? "(unnamed)",
    };
    const list = byPref.get(h.prefecture_code) ?? [];
    list.push(entry);
    byPref.set(h.prefecture_code, list);
  }

  const files = (await readdir(REGISTRY_DIR)).filter(
    (f) => f.endsWith(".json") && !f.startsWith("_"),
  );

  interface DetailRow {
    authority_key: string;
    facility_name: string;
    address_raw: string | null;
    category: string | null;
    permit_no: string | null;
    tier: MatchTier;
    master_id: string | null;
    master_name: string | null;
    score: number | null;
    reason: string | null;
  }

  const detail: DetailRow[] = [];
  const perAuthority: Record<
    string,
    { name: string; confident: number; probable: number; unmatched: number }
  > = {};

  for (const file of files) {
    const reg = JSON.parse(
      await readFile(new URL(file, REGISTRY_DIR), "utf8"),
    ) as {
      authority: { key: string; name: string; prefecture_code: string; prefecture_name: string };
      facilities: {
        facility_name: string;
        address_raw: string | null;
        category: string | null;
        permit_no: string | null;
        phone: string | null;
        lat: number | null;
        lng: number | null;
      }[];
    };
    const candidates = byPref.get(reg.authority.prefecture_code) ?? [];
    const stats = { name: `${reg.authority.prefecture_name} ${reg.authority.name}`, confident: 0, probable: 0, unmatched: 0 };
    perAuthority[reg.authority.key] = stats;

    for (const f of reg.facilities) {
      const grams = bigrams(normName(f.facility_name));
      const phone = phoneDigits(f.phone);

      let best: { m: IndexedMaster; sim: number } | null = null;
      let second = 0;
      let phoneHit: IndexedMaster | null = null;
      let geoHit: { m: IndexedMaster; d: number; sim: number } | null = null;

      for (const m of candidates) {
        const sim = m.grams.length
          ? Math.max(...m.grams.map((g) => dice(grams, g)))
          : 0;
        if (!best || sim > best.sim) {
          second = best?.sim ?? 0;
          best = { m, sim };
        } else if (sim > second) {
          second = sim;
        }
        if (phone && m.phone === phone && !phoneHit) phoneHit = m;
        if (f.lat && f.lng && m.lat !== null && m.lng !== null) {
          const d = distMeters(f.lat, f.lng, m.lat, m.lng);
          if (d <= 150 && (!geoHit || d < geoHit.d)) geoHit = { m, d, sim };
        }
      }

      let tier: MatchTier = "unmatched";
      let matched: IndexedMaster | null = null;
      let score: number | null = null;
      let reason: string | null = null;

      if (phoneHit) {
        const sim = phoneHit.grams.length
          ? Math.max(...phoneHit.grams.map((g) => dice(grams, g)))
          : 0;
        if (sim >= 0.4) {
          tier = "confident"; matched = phoneHit; score = sim; reason = "phone+name";
        } else {
          tier = "probable"; matched = phoneHit; score = sim; reason = "phone";
        }
      }
      if (tier !== "confident" && geoHit) {
        if (geoHit.sim >= 0.5) {
          tier = "confident"; matched = geoHit.m; score = geoHit.sim;
          reason = `geo≤150m+name`;
        } else if (geoHit.d <= 50 && geoHit.sim >= 0.3 && tier === "unmatched") {
          tier = "probable"; matched = geoHit.m; score = geoHit.sim; reason = "geo≤50m";
        }
      }
      if (tier !== "confident" && best) {
        if (best.sim >= 0.85 && best.sim - second >= 0.05) {
          tier = "confident"; matched = best.m; score = best.sim; reason = "name≥0.85 unique";
        } else if (best.sim >= 0.65 && tier === "unmatched") {
          tier = "probable"; matched = best.m; score = best.sim; reason = "name 0.65–0.85";
        }
      }

      stats[tier] += 1;
      detail.push({
        authority_key: reg.authority.key,
        facility_name: f.facility_name,
        address_raw: f.address_raw,
        category: f.category,
        permit_no: f.permit_no,
        tier,
        master_id: matched?.id ?? null,
        master_name: matched?.displayName ?? null,
        score: score === null ? null : Math.round(score * 100) / 100,
        reason,
      });
    }
  }

  const totals = { confident: 0, probable: 0, unmatched: 0 };
  for (const s of Object.values(perAuthority)) {
    totals.confident += s.confident;
    totals.probable += s.probable;
    totals.unmatched += s.unmatched;
  }
  const expansionPool = detail.filter(
    (d) => d.tier === "unmatched" && d.category !== "geshuku",
  ).length;

  const summary = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    master_size: master.hotels.length,
    registry_size: detail.length,
    totals,
    expansion_pool_estimate: expansionPool,
    note:
      "expansion pool = permit facilities not matched to any master entry " +
      "(下宿 excluded). These are CANDIDATES — each needs an official-page " +
      "check (active? seasonal?) before entering the master as inventory.",
    per_authority: perAuthority,
  };

  let tmp = fileURLToPath(SUMMARY_URL) + ".tmp";
  await writeFile(tmp, JSON.stringify(summary, null, 2), "utf8");
  await rename(tmp, fileURLToPath(SUMMARY_URL));
  tmp = fileURLToPath(DETAIL_URL) + ".tmp";
  await writeFile(tmp, JSON.stringify({ detail }, null, 1), "utf8");
  await rename(tmp, fileURLToPath(DETAIL_URL));

  console.error("=== registry ↔ master crosswalk ===");
  console.error(
    `registry ${detail.length} → confident ${totals.confident} / probable ${totals.probable} / unmatched ${totals.unmatched}`,
  );
  console.error(`expansion pool (excl. 下宿): ${expansionPool}`);
  for (const [k, s] of Object.entries(perAuthority)) {
    console.error(
      `  ${s.name}: c${s.confident} p${s.probable} u${s.unmatched}`,
    );
  }
  console.error(`wrote ${fileURLToPath(SUMMARY_URL)}`);
}

main().catch((err) => {
  console.error("[registry_crosswalk] fatal:", err);
  process.exitCode = 1;
});
