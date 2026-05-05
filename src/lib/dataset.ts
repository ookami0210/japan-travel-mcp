/**
 * Dataset-level metadata helpers.
 *
 * Functions that summarise the loaded prefecture corpus rather than any
 * single record — currently just the freshness watermark surfaced in
 * every tool response.
 */

/** Narrow input contract — structurally compatible with PrefectureFile. */
export interface DatasetSnapshot {
  data_as_of: string;
}

/**
 * Return the freshest `data_as_of` watermark across the loaded prefecture
 * files. Used so every tool response can carry a single dataset version
 * marker. Sort is lexicographic which works because every record uses
 * ISO-8601 dates (YYYY-MM-DD or full timestamps).
 *
 * Returns `null` for an empty input — callers should treat that as "no
 * data loaded yet" rather than emitting an empty string.
 */
export function dataAsOf(prefs: DatasetSnapshot[]): string | null {
  if (prefs.length === 0) return null;
  return prefs.map((p) => p.data_as_of).sort().pop() ?? null;
}
