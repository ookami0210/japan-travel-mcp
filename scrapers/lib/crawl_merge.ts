/**
 * Hybrid spot merge for the resumable municipal crawl.
 *
 * A large official site is crawled across several windows. Each window returns
 * only the spots it extracted that window, so naively replacing the
 * municipality block would drop everything found in earlier windows. This
 * merge instead:
 *
 *   - Unions by spot id (existing ∪ fresh; fresh wins on conflict, so a
 *     re-crawled page gets the newer record). Coverage therefore only grows
 *     during a multi-window crawl and never dips mid-crawl.
 *   - Once the crawl completes, drops any spot older than the cycle start —
 *     these are pages that existed last cycle but were not re-found this cycle
 *     (deleted from the site). A finished crawl thus leaves a clean, current
 *     set, without a heavy staging area or an atomic-swap at the end.
 */

/** Minimal shape this merge needs — a superset of TouristSpot / PrefFileSpot. */
export interface MergeableSpot {
  id?: string;
  last_scraped_at?: string | null;
}

export function hybridMergeSpots<T extends MergeableSpot>(
  existing: T[],
  fresh: T[],
  complete: boolean,
  crawlStartedAt: string | undefined,
): T[] {
  const byId = new Map<string, T>();
  // Spots without an id can't be deduped; keep them verbatim.
  const noId: T[] = [];
  for (const s of existing) {
    if (s.id) byId.set(s.id, s);
    else noId.push(s);
  }
  for (const s of fresh) {
    if (s.id) byId.set(s.id, s); // fresh wins on id conflict
    else noId.push(s);
  }
  let out = [...byId.values(), ...noId];
  if (complete && crawlStartedAt) {
    out = out.filter(
      (s) => !s.last_scraped_at || s.last_scraped_at >= crawlStartedAt,
    );
  }
  return out;
}
