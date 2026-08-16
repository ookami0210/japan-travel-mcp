/**
 * Entity resolution — free-text name → canonical entity.
 *
 * Conversational consumers discover facility names via web search (English
 * blog spellings, romaji, nicknames) and need to resolve them to verified
 * entities (id + geo + category + official source) before anything reaches a
 * booking-adjacent step. Area×category retrieval can't do that reverse
 * lookup; this module can.
 *
 * Design constraints:
 *   - Honest confidence: a wrong match is worse than no match. Below the
 *     floor we return nothing rather than guess.
 *   - Conversation-latency budget: index once (a few seconds), then each
 *     query is a linear scan with cheap ops — tens of milliseconds warm.
 *   - Deterministic: no LLM, no network. Pure string similarity + geo/area
 *     boosts, so results are reproducible and testable.
 */

export interface ResolveEntry {
  id: string;
  source: "attraction" | "hotel" | "food_venue" | "municipal_spot";
  /** All known name variants (ja / en / zh / ko / romaji / translations). */
  names: string[];
  canonical_name: string;
  lat: number | null;
  lng: number | null;
  prefecture_code: string | null;
  category: string | null;
  official_url: string | null;
  /** Non-official reference link (e.g. Wikidata) — provenance, not "official". */
  reference_url: string | null;
}

export interface ResolveMatch {
  entry: ResolveEntry;
  score: number;
  confidence: "high" | "medium" | "low";
  matched_name: string;
}

/** Normalize a name for comparison: NFKC, lowercase, strip separators. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　\-‐–—・･'’`"“”.,、。()（）\[\]【】&+]/g, "");
}

/** Character-bigram Dice coefficient — language-agnostic fuzzy similarity. */
export function diceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const n = bigrams.get(bg) ?? 0;
    if (n > 0) {
      overlap += 1;
      bigrams.set(bg, n - 1);
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function haversineKmLocal(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface ResolveIndex {
  entries: ResolveEntry[];
  /** normalized name → entry indices (exact-match fast path). */
  exact: Map<string, number[]>;
  /** Parallel arrays for the fuzzy scan: normalized name + entry index. */
  normNames: string[];
  normOwner: number[];
}

export function buildResolveIndex(entries: ResolveEntry[]): ResolveIndex {
  const exact = new Map<string, number[]>();
  const normNames: string[] = [];
  const normOwner: number[] = [];
  entries.forEach((e, idx) => {
    const seen = new Set<string>();
    for (const raw of e.names) {
      if (!raw) continue;
      const norm = normalizeName(raw);
      if (norm.length < 2 || seen.has(norm)) continue;
      seen.add(norm);
      const bucket = exact.get(norm);
      if (bucket) bucket.push(idx);
      else exact.set(norm, [idx]);
      normNames.push(norm);
      normOwner.push(idx);
    }
  });
  return { entries, exact, normNames, normOwner };
}

/** Score floor below which we honestly return nothing. */
const SCORE_FLOOR = 0.55;

export function resolveByName(
  index: ResolveIndex,
  query: string,
  opts: {
    prefCodes?: Set<string> | null;
    near?: { lat: number; lng: number } | null;
    limit?: number;
  } = {},
): ResolveMatch[] {
  const qNorm = normalizeName(query);
  if (qNorm.length < 2) return [];
  const limit = Math.min(Math.max(opts.limit ?? 5, 1), 20);

  // Best textual score per entry index.
  const best = new Map<number, { score: number; name: string }>();
  const consider = (idx: number, score: number, name: string): void => {
    const prev = best.get(idx);
    if (!prev || score > prev.score) best.set(idx, { score, name });
  };

  // Exact normalized match.
  for (const idx of index.exact.get(qNorm) ?? []) consider(idx, 1.0, qNorm);

  // Containment + fuzzy scan. Containment covers "Hotel Granvia Kyoto" vs
  // "Granvia Kyoto" style prefix/suffix variants; Dice covers spelling drift.
  const qLen = qNorm.length;
  for (let i = 0; i < index.normNames.length; i++) {
    const cand = index.normNames[i];
    const idx = index.normOwner[i];
    if (cand === qNorm) continue; // already handled
    const shorter = Math.min(cand.length, qLen);
    const longer = Math.max(cand.length, qLen);
    // Containment needs the shorter side to carry most of the longer one —
    // otherwise generic tokens ("ryokan", "hotel", "onsen") inside a longer
    // query fabricate high-confidence wrong matches, which is exactly the
    // failure mode a resolver must not have.
    if (shorter / longer >= 0.55) {
      if (cand.includes(qNorm) || qNorm.includes(cand)) {
        consider(idx, 0.72 + 0.23 * (shorter / longer), cand);
        continue;
      }
    }
    // Fuzzy only within a sane length window — Dice on wildly different
    // lengths is noise, and skipping it keeps the scan fast.
    if (shorter / longer >= 0.5) {
      const sim = diceSimilarity(qNorm, cand);
      if (sim >= 0.62) consider(idx, sim * 0.9, cand);
    }
  }

  // Geo / area adjustments.
  const results: ResolveMatch[] = [];
  for (const [idx, { score, name }] of best) {
    const e = index.entries[idx];
    let s = score;
    if (opts.prefCodes && opts.prefCodes.size > 0 && e.prefecture_code) {
      s += opts.prefCodes.has(e.prefecture_code) ? 0.08 : -0.15;
    }
    if (opts.near && e.lat !== null && e.lng !== null) {
      const km = haversineKmLocal(opts.near.lat, opts.near.lng, e.lat, e.lng);
      if (km <= 5) s += 0.12;
      else if (km <= 30) s += 0.06;
      else if (km > 150) s -= 0.1;
    }
    s = Math.min(s, 1.0);
    if (s < SCORE_FLOOR) continue;
    results.push({
      entry: e,
      score: Math.round(s * 1000) / 1000,
      confidence: s >= 0.9 ? "high" : s >= 0.72 ? "medium" : "low",
      matched_name: name,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
