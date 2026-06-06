/**
 * Incremental-translation helpers.
 *
 * Pure functions (no I/O, no top-level side effects) so they can be unit
 * tested without triggering a translator's `main()`. Shared by the
 * description translator to translate only entities that are new or whose
 * source content changed — never the whole corpus.
 *
 * The mechanism is a content hash: we fingerprint the source fields that
 * determine an entity's output. If the fingerprint matches the one stored
 * with the existing translation, the entity is skipped (zero cost). If it
 * differs — or the entity is new, or its stored output is missing a target
 * language — it is re-translated.
 */

import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys are emitted in sorted order at every level
 * so the same logical value always hashes to the same string regardless of
 * key insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

/** Short, stable content fingerprint of the source fields. */
export function hashSource(fields: Record<string, unknown>): string {
  return createHash("sha256").update(stableStringify(fields)).digest("hex").slice(0, 16);
}

/** Minimal shape of a previously-written translation row we care about here. */
export interface ExistingRow {
  qid: string;
  descriptions?: Record<string, string>;
  source_hash?: string;
}

/**
 * Decide whether `qid` must be (re)translated given its current source hash,
 * the previously-written row (if any), and the set of languages that must be
 * present.
 *
 * - New entity (no prior row) → translate.
 * - Prior row missing any required language → translate (repair).
 * - Prior row complete but with no stored hash (legacy) → DO NOT translate;
 *   the caller backfills the hash without spending API budget.
 * - Prior row complete with a stored hash → translate only if it changed.
 */
export function isStale(
  currentHash: string,
  existing: ExistingRow | undefined,
  requiredLangs: readonly string[],
): boolean {
  if (!existing) return true;
  const have = existing.descriptions ?? {};
  for (const lang of requiredLangs) {
    if (!have[lang]) return true;
  }
  if (existing.source_hash === undefined) return false; // legacy-complete: backfill only
  return existing.source_hash !== currentHash;
}

/**
 * Merge freshly-translated rows into the existing corpus WITHOUT dropping
 * untouched entries (the previous writer truncated the file to only the rows
 * in the current run). Returns the full set of rows to write.
 *
 * - `existing`: every prior row, keyed by qid.
 * - `fresh`: rows produced this run (these win on conflict).
 * - `hashByQid`: current source hash for every candidate, used to stamp both
 *   fresh rows and legacy rows that are being backfilled.
 * - Rows whose stored hash is absent get the current hash stamped so the next
 *   run can detect future changes; their content is otherwise preserved.
 */
export function mergeRows<T extends { qid: string; source_hash?: string }>(
  existing: Map<string, T>,
  fresh: T[],
  hashByQid: Map<string, string>,
): T[] {
  const byQid = new Map<string, T>(existing);
  for (const row of fresh) {
    byQid.set(row.qid, row);
  }
  for (const [qid, row] of byQid) {
    if (row.source_hash === undefined && hashByQid.has(qid)) {
      row.source_hash = hashByQid.get(qid);
    }
  }
  return Array.from(byQid.values()).sort((a, b) => a.qid.localeCompare(b.qid));
}
