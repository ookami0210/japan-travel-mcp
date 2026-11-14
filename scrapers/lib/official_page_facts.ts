/**
 * Facts read from one official page: the decision layer between the two
 * deterministic readers (Schema.org JSON-LD, then the Japanese text rules)
 * and the record the pass writes.
 *
 * Order of trust:
 *   1. JSON-LD the operator embedded (openingHoursSpecification /
 *      openingHours / priceRange). Machine-readable, no interpretation.
 *   2. The text rules in `ja_hours_rules.ts`, which return the verbatim
 *      fragment each value was read from.
 *   3. Nothing. The record then says so, and carries a bounded snippet for a
 *      later model pass, which is run separately and never inside this file.
 *
 * No network here, so the whole layer is testable on fixtures.
 */

import { extractJsonLdFacts } from "./jsonld_facts.js";
import {
  extractPageFacts,
  factsSnippet,
  type HoursResult,
  type LodgingTimes,
  type PriceResult,
  type Weekday,
} from "./ja_hours_rules.js";

export type FactsLayer = "attraction" | "hotel" | "food";
export type FactsMethod = "jsonld" | "rule" | "llm_local" | "none";

export interface OfficialPageFacts {
  id: string;
  layer: FactsLayer;
  url: string;
  final_url: string | null;
  fetched_at: string;
  http_status: number;
  /** Which reader produced `opening_hours`; "none" when neither could. */
  method: FactsMethod;
  /** OSM opening_hours syntax (the server structures it), or null. */
  opening_hours: string | null;
  hours_partial: boolean;
  closed_days: Weekday[];
  open_every_day: boolean;
  hours_evidence: string[];
  /** Raw Schema.org priceRange when the page embeds one. */
  price_range_raw: string | null;
  price: Omit<PriceResult, "evidence"> | null;
  price_evidence: string[];
  lodging: Omit<LodgingTimes, "evidence"> | null;
  /** Two hours blocks on the page disagree (several venues on one page). */
  hours_ambiguous: boolean;
  /** The page announces the venue has closed for good (verbatim fragment). */
  closure_notice: string | null;
  /** Pages read for this entity (the official URL plus any info page followed). */
  pages_read: string[];
  /** Characters of visible text the readers saw (0 when the fetch failed). */
  text_chars: number;
  /** True when hours or price are still missing after both readers. */
  needs_llm: boolean;
}

const SCHEMA_DAYS: Record<string, Weekday> = {
  monday: "Mo",
  tuesday: "Tu",
  wednesday: "We",
  thursday: "Th",
  friday: "Fr",
  saturday: "Sa",
  sunday: "Su",
  publicholidays: "PH",
};
const ORDER: Weekday[] = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function dayToken(v: unknown): Weekday | null {
  if (typeof v !== "string") return null;
  const key = v.replace(/^https?:\/\/schema\.org\//, "").toLowerCase();
  return SCHEMA_DAYS[key] ?? null;
}

function clock(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h > 24 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function compactDays(days: Weekday[]): string {
  const week = ORDER.filter((d) => days.includes(d));
  const parts: string[] = [];
  let i = 0;
  while (i < week.length) {
    let j = i;
    while (j + 1 < week.length && ORDER.indexOf(week[j + 1]) === ORDER.indexOf(week[j]) + 1) j += 1;
    if (j - i >= 2) parts.push(`${week[i]}-${week[j]}`);
    else for (let k = i; k <= j; k += 1) parts.push(week[k]);
    i = j + 1;
  }
  if (days.includes("PH")) parts.push("PH");
  return parts.join(",");
}

/**
 * Schema.org openingHoursSpecification objects to one OSM opening_hours
 * string. Specs without a parseable opens/closes pair are skipped; a spec
 * with days but no times is a closure ("off"). Returns null when nothing
 * usable remains.
 */
export function jsonLdHoursToOsm(specs: Array<Record<string, unknown>>): string | null {
  const byWindow = new Map<string, Weekday[]>();
  const closed: Weekday[] = [];
  for (const spec of specs) {
    const rawDays = spec.dayOfWeek;
    const list = Array.isArray(rawDays) ? rawDays : rawDays === undefined ? [] : [rawDays];
    const days = list.map(dayToken).filter((d): d is Weekday => d !== null);
    const opens = clock(spec.opens);
    const closes = clock(spec.closes);
    if (!opens || !closes) {
      if (days.length > 0 && spec.opens === undefined && spec.closes === undefined) {
        closed.push(...days);
      }
      continue;
    }
    if (opens === closes && opens === "00:00") {
      // 00:00-00:00 is the schema.org idiom for "open all day".
      const key = "00:00-24:00";
      byWindow.set(key, [...(byWindow.get(key) ?? []), ...days]);
      continue;
    }
    const key = `${opens}-${closes}`;
    byWindow.set(key, [...(byWindow.get(key) ?? []), ...days]);
  }
  const parts: string[] = [];
  for (const [window, days] of byWindow) {
    const uniq = [...new Set(days)];
    parts.push(uniq.length ? `${compactDays(uniq)} ${window}` : window);
  }
  for (const d of [...new Set(closed)]) parts.push(`${d} off`);
  return parts.length ? parts.join("; ") : null;
}

/** Schema.org `openingHours` strings are already in the OSM-like form. */
function joinOpeningHoursStrings(xs: string[]): string | null {
  const cleaned = xs.map((s) => s.trim()).filter((s) => /\d{1,2}:\d{2}/.test(s));
  return cleaned.length ? cleaned.join("; ") : null;
}

export interface ReadInput {
  id: string;
  layer: FactsLayer;
  url: string;
  final_url: string | null;
  fetched_at: string;
  http_status: number;
  html: string | null;
  text: string | null;
  pages_read?: string[];
}

/** The record for one fetched page. Never throws on odd markup. */
export function readOfficialPage(input: ReadInput): { record: OfficialPageFacts; snippet: string | null } {
  const lodging = input.layer === "hotel";
  const base: OfficialPageFacts = {
    id: input.id,
    layer: input.layer,
    url: input.url,
    final_url: input.final_url,
    fetched_at: input.fetched_at,
    http_status: input.http_status,
    method: "none",
    opening_hours: null,
    hours_partial: false,
    closed_days: [],
    open_every_day: false,
    hours_evidence: [],
    price_range_raw: null,
    price: null,
    price_evidence: [],
    lodging: null,
    hours_ambiguous: false,
    closure_notice: null,
    pages_read: input.pages_read ?? [input.url],
    text_chars: input.text?.length ?? 0,
    needs_llm: false,
  };
  if (!input.html || !input.text) return { record: base, snippet: null };

  // 1. JSON-LD
  let jsonldHours: string | null = null;
  try {
    const facts = extractJsonLdFacts(input.html);
    if (facts) {
      if (facts.hours_spec) jsonldHours = jsonLdHoursToOsm(facts.hours_spec);
      if (!jsonldHours && facts.opening_hours) jsonldHours = joinOpeningHoursStrings(facts.opening_hours);
      base.price_range_raw = facts.price_range_raw;
    }
  } catch {
    // Malformed JSON-LD is the page's problem; fall through to the rules.
  }

  // 2. Text rules
  let rules: ReturnType<typeof extractPageFacts> | null = null;
  try {
    rules = extractPageFacts(input.text, lodging);
  } catch {
    rules = null;
  }
  const hours: HoursResult | null = rules?.hours ?? null;

  if (jsonldHours) {
    base.method = "jsonld";
    base.opening_hours = jsonldHours;
    base.hours_evidence = ["schema.org openingHoursSpecification"];
    if (hours) {
      base.closed_days = hours.closed_days;
      base.open_every_day = hours.open_every_day;
    }
  } else if (hours?.ambiguous) {
    base.hours_ambiguous = true;
    base.hours_evidence = hours.evidence;
    base.closed_days = hours.closed_days;
    base.open_every_day = hours.open_every_day;
    base.hours_partial = true;
  } else if (hours?.opening_hours) {
    base.method = "rule";
    base.opening_hours = hours.opening_hours;
    base.hours_partial = hours.partial;
    base.closed_days = hours.closed_days;
    base.open_every_day = hours.open_every_day;
    base.hours_evidence = hours.evidence;
  } else if (hours) {
    // Closed days or 年中無休 without a time range: keep what was read.
    base.closed_days = hours.closed_days;
    base.open_every_day = hours.open_every_day;
    base.hours_evidence = hours.evidence;
    base.hours_partial = hours.partial;
  }

  // A restaurant page's amounts are menu items or minimums, never an
  // admission; only the embedded priceRange is kept for food.
  if (rules?.price && input.layer !== "food") {
    const { evidence, ...rest } = rules.price;
    base.price = rest;
    base.price_evidence = evidence;
    if (base.method === "none") base.method = "rule";
  }
  if (rules?.closure_notice) base.closure_notice = rules.closure_notice;
  if (rules?.lodging) {
    const { evidence, ...rest } = rules.lodging;
    base.lodging = rest;
    base.hours_evidence = [...base.hours_evidence, ...evidence];
    if (base.method === "none") base.method = "rule";
  }

  // Lodging pages seldom state daily opening hours; check-in/out is their
  // equivalent. For the other layers, hours are the priority fact.
  const hoursMissing = lodging ? !base.lodging : !base.opening_hours;
  const priceMissing = input.layer === "food" ? false : !base.price && !base.price_range_raw;
  // An ambiguous page (several venues) is not a model's job either.
  base.needs_llm = (hoursMissing || priceMissing) && !base.hours_ambiguous;
  const snippet = base.needs_llm ? factsSnippet(input.text) : null;
  return { record: base, snippet };
}
