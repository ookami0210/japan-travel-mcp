/**
 * Collapse guard for registry-style outputs (R3 and the industry lodging
 * lists).
 *
 * Every one of these fetchers rewrites its whole output file from a fresh
 * crawl. When the source is down (a 503 maintenance page), has moved, or has
 * changed its markup, the crawl returns nothing and the rewrite replaces a
 * good file with an empty one. The empty file then ships to the dataset and
 * stays there until someone notices. The freshness audit caught exactly this
 * three times in one week.
 *
 * The rule: a result that is empty, or far smaller than the file it would
 * replace, is refused. The previous file stays on disk, the fetcher exits
 * non-zero, and the failure surfaces in the workflow instead of in the data.
 * A genuine shrink of a registry (an association losing half its members in
 * a month) is rare enough that a human should look at it before it ships;
 * `R3_ALLOW_COLLAPSE=1` lets that run through on purpose.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

/** Below this many previous records a shrink is not judged, only emptiness. */
export const MIN_PREVIOUS_FOR_RATIO = 20;
/** A result smaller than this share of the previous count is refused. */
export const MIN_KEEP_RATIO = 0.5;

export class CollapsedResultError extends Error {
  constructor(
    public readonly label: string,
    public readonly previous: number,
    public readonly next: number,
  ) {
    super(
      `${label}: refusing to overwrite ${previous} records with ${next}` +
        ` (source down or markup changed?). Set R3_ALLOW_COLLAPSE=1 to force.`,
    );
    this.name = "CollapsedResultError";
  }
}

/**
 * Throw when `next` would replace `previous` with a collapsed result.
 * `previous === 0` (no file yet, or an already-empty file) never blocks, so a
 * first run and a repair of an empty file both go through.
 */
export function assertNotCollapsed(label: string, previous: number, next: number): void {
  if (process.env.R3_ALLOW_COLLAPSE === "1") return;
  if (previous <= 0) return;
  if (next <= 0) throw new CollapsedResultError(label, previous, next);
  if (previous >= MIN_PREVIOUS_FOR_RATIO && next < previous * MIN_KEEP_RATIO) {
    throw new CollapsedResultError(label, previous, next);
  }
}

/** Record count of an existing output file (`records` array), 0 when absent or unreadable. */
export async function countRecordsInFile(path: string): Promise<number> {
  if (!existsSync(path)) return 0;
  try {
    const json = JSON.parse(await readFile(path, "utf8")) as { records?: unknown[] };
    return Array.isArray(json.records) ? json.records.length : 0;
  } catch {
    return 0;
  }
}
