/**
 * Tolerant municipality / prefecture name matching.
 *
 * Pulled out of src/index.ts because the matching logic is subtle enough
 * to deserve unit tests, and at least three tools (get_spots, get_local_food
 * scraped tier, get_festivals scraped tier) want the same semantics.
 *
 * Design choices (do not silently change without rerunning the demo
 * queries — these are tuned against actual user expectations):
 *
 *   - Suffix-strip both sides (市/町/村/区) so "南山城" matches "南山城村"
 *     and "南山城村" still matches itself.
 *   - Inclusion-match: "南山城" → "南山城村" (jaBare.includes(cityKey)),
 *     and "南山城村" → "南山城村" (exact). We do NOT match the other
 *     direction to avoid 京都市 being matched by query "京".
 *   - Lowercase comparison (so EN slugs work after the romaji layer
 *     lands).
 *   - Empty / null query → match everything (the caller didn't filter).
 */

export function matchesMunicipality(
  muniName: string,
  query: string | null | undefined,
): boolean {
  if (!query) return true;
  const cityKey = query.trim().toLowerCase();
  if (!cityKey) return true;
  const cityBare = stripMuniSuffix(cityKey);
  const ja = muniName.toLowerCase();
  const jaBare = stripMuniSuffix(ja);
  if (ja === cityKey || jaBare === cityKey) return true;
  if (cityBare && (jaBare === cityBare || ja.includes(cityBare))) return true;
  if (jaBare.includes(cityKey)) return true;
  return false;
}

export function stripMuniSuffix(name: string): string {
  return name.replace(/[市町村区]$/u, "");
}

export function stripPrefSuffix(name: string): string {
  return name.replace(/[都道府県]$/u, "");
}
