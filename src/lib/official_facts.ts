/**
 * Facts read from each entity's own official page (DATA_SOURCES.md #49),
 * overlaid on the attraction, food and lodging layers at load time.
 *
 * The file is optional: a dataset without it simply carries no
 * official-page facts. Where a layer already holds an OSM value (an
 * attraction's `opening_hours`, a venue's `hours_raw`) that value is kept;
 * the official page fills only what is missing, and every value it adds
 * carries the page it came from and the fragment it was read from, so a
 * consumer can quote the source rather than the dataset.
 */

import { readFile } from "node:fs/promises";
import { parseOpeningHours, type StructuredOpeningHours } from "./opening_hours.js";

export interface OfficialFactsRecord {
  id: string;
  layer: "attraction" | "hotel" | "food";
  url: string;
  final_url: string | null;
  fetched_at: string;
  method: string;
  opening_hours: string | null;
  hours_partial: boolean;
  closed_days: string[];
  open_every_day: boolean;
  hours_evidence: string[];
  price_range_raw: string | null;
  price: { adult_jpy: number | null; child_jpy: number | null; free: boolean; from_jpy: number | null } | null;
  price_evidence: string[];
  lodging: { checkin: string | null; checkout: string | null } | null;
  closure_notice?: string | null;
  pages_read?: string[];
}

/** What a consumer sees on a record: the facts plus their provenance. */
export interface OfficialFacts {
  source_url: string;
  fetched_at: string;
  closed_days?: string[];
  open_every_day?: boolean;
  hours_partial?: boolean;
  price?: { adult_jpy: number | null; child_jpy: number | null; free: boolean; from_jpy: number | null };
  price_range_raw?: string;
  checkin?: string;
  checkout?: string;
  closure_notice?: string;
  evidence: string[];
}

let cached: Map<string, OfficialFactsRecord> | null = null;

/** Load the facts file once; absent or torn lines are skipped. */
export async function loadOfficialFacts(path: string): Promise<Map<string, OfficialFactsRecord>> {
  if (cached) return cached;
  const map = new Map<string, OfficialFactsRecord>();
  try {
    const content = await readFile(path, "utf8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const rec = JSON.parse(t) as OfficialFactsRecord;
        if (rec.id && rec.layer) map.set(rec.id, rec);
      } catch {
        // a torn line is dropped, not propagated
      }
    }
  } catch {
    // optional layer
  }
  cached = map;
  return map;
}

/** Test seam. */
export function clearOfficialFactsCache(): void {
  cached = null;
}

function hasAny(rec: OfficialFactsRecord): boolean {
  return !!(
    rec.opening_hours ||
    rec.closed_days.length ||
    rec.open_every_day ||
    rec.price ||
    rec.price_range_raw ||
    rec.lodging ||
    rec.closure_notice
  );
}

/** The consumer-facing block for one record, or null when it states nothing. */
export function factsBlock(rec: OfficialFactsRecord): OfficialFacts | null {
  if (!hasAny(rec)) return null;
  const out: OfficialFacts = {
    source_url: rec.final_url ?? rec.url,
    fetched_at: rec.fetched_at,
    evidence: [...rec.hours_evidence, ...rec.price_evidence].slice(0, 4),
  };
  if (rec.closed_days.length) out.closed_days = rec.closed_days;
  if (rec.open_every_day) out.open_every_day = true;
  if (rec.hours_partial) out.hours_partial = true;
  if (rec.price) out.price = rec.price;
  if (rec.price_range_raw) out.price_range_raw = rec.price_range_raw;
  if (rec.lodging?.checkin) out.checkin = rec.lodging.checkin;
  if (rec.lodging?.checkout) out.checkout = rec.lodging.checkout;
  if (rec.closure_notice) out.closure_notice = rec.closure_notice;
  return out;
}

interface HoursCarrier {
  opening_hours?: string;
  opening_hours_structured?: StructuredOpeningHours | null;
  official_facts?: OfficialFacts;
}

/**
 * Attractions: fill `opening_hours` (and its structured form) from the
 * official page when the OSM tag is absent, and attach the facts block.
 */
export function applyOfficialFactsToAttractions(
  attractions: Array<HoursCarrier & { qid?: string }>,
  facts: Map<string, OfficialFactsRecord>,
): number {
  let applied = 0;
  for (const a of attractions) {
    if (!a.qid) continue;
    const rec = facts.get(`wd:${a.qid}`);
    if (!rec) continue;
    if (!a.opening_hours && rec.opening_hours) {
      a.opening_hours = rec.opening_hours;
      const structured = parseOpeningHours(rec.opening_hours);
      if (structured) a.opening_hours_structured = structured;
    }
    const block = factsBlock(rec);
    if (block) {
      a.official_facts = block;
      applied += 1;
    }
  }
  return applied;
}

interface FoodCarrier {
  id: string;
  hours_raw: string | null;
  opening_hours_structured?: StructuredOpeningHours | null;
  official_facts?: OfficialFacts;
}

/** Food venues: fill `hours_raw` from the official page when OSM has none. */
export function applyOfficialFactsToFood(venues: FoodCarrier[], facts: Map<string, OfficialFactsRecord>): number {
  let applied = 0;
  for (const v of venues) {
    const rec = facts.get(v.id);
    if (!rec) continue;
    if (!v.hours_raw && rec.opening_hours) {
      v.hours_raw = rec.opening_hours;
      v.opening_hours_structured = parseOpeningHours(rec.opening_hours);
    }
    const block = factsBlock(rec);
    if (block) {
      v.official_facts = block;
      applied += 1;
    }
  }
  return applied;
}

interface HotelCarrier {
  id: string;
  official_facts?: OfficialFacts;
}

/** Lodging: attach check-in/out, a from-rate and any closure notice. */
export function applyOfficialFactsToHotels(hotels: HotelCarrier[], facts: Map<string, OfficialFactsRecord>): number {
  let applied = 0;
  for (const h of hotels) {
    const rec = facts.get(`hotel:${h.id}`);
    if (!rec) continue;
    const block = factsBlock(rec);
    if (block) {
      h.official_facts = block;
      applied += 1;
    }
  }
  return applied;
}
