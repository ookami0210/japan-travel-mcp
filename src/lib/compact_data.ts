/**
 * In-memory compaction of parsed prefecture files.
 *
 * The prefecture corpus is ~680 MB of JSON on disk and is held fully parsed
 * for the lifetime of the server. Field-weight measurement on the largest
 * file showed two fields carrying most of the string bytes while contributing
 * nothing to tool responses:
 *
 *   - spot.images[]: 25% of string weight. No tool returns images; the only
 *     consumer is the spot-quality score, which checks images.length > 0.
 *     Keeping just the first URL preserves that signal.
 *   - municipality.errors[]: scrape-run diagnostics. No src/ consumer at all.
 *
 * body_paragraphs (51%) IS used — keyword matching and get_local_food
 * responses — so it stays. Compaction happens once per file at parse time,
 * before the object is cached, so the transient full parse is released by GC
 * file-by-file instead of accumulating across all 47.
 */

// Structural minimum — callers pass their own richer types (e.g. the
// server's PrefectureFile); anything with these optional shapes qualifies.
interface CompactableSpot {
  images?: string[];
}

interface CompactableMunicipality {
  errors?: unknown;
  spots?: CompactableSpot[] | null;
}

interface CompactablePrefectureFile {
  municipalities?: Array<CompactableMunicipality | null> | null;
}

/**
 * Mutates the parsed prefecture file in place, dropping response-invisible
 * bulk. Safe on any shape — missing fields are skipped.
 */
export function compactPrefectureFile(file: CompactablePrefectureFile): void {
  if (!Array.isArray(file.municipalities)) return;
  for (const muni of file.municipalities) {
    if (!muni || typeof muni !== "object") continue;
    // Scrape diagnostics — never read by the server.
    if ("errors" in muni) delete (muni as { errors?: unknown }).errors;
    if (!Array.isArray(muni.spots)) continue;
    for (const spot of muni.spots) {
      if (!spot || typeof spot !== "object") continue;
      // Quality scoring only checks presence; one URL carries that bit.
      if (Array.isArray(spot.images) && spot.images.length > 1) {
        spot.images = [spot.images[0]];
      }
    }
  }
}
