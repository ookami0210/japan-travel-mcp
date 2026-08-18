/**
 * Deterministic parser for the common subset of the OSM `opening_hours`
 * syntax, producing minute-granularity weekly windows that downstream
 * itinerary/verification engines can check against ("is this spot open at
 * 14:30 on a Tuesday?").
 *
 * Honesty contract (mirrors DATA_POLICY.md "honest nulls"):
 *   - We only structure what we can parse with confidence. Constructs we do
 *     not model (seasonal month ranges, public holidays, sunrise/sunset,
 *     week numbers, conditional comments) mark the result `partial: true`
 *     and are otherwise skipped — the raw string is always preserved next to
 *     the structured form so consumers can fall back to it.
 *   - If nothing in the expression can be parsed, the function returns null
 *     (raw-only), never a guessed schedule.
 *
 * Supported subset (covers the overwhelming majority of Japanese POI values):
 *   - "24/7"
 *   - rule lists separated by ";"  e.g. "Mo-Fr 09:00-17:00; Sa 09:00-12:00"
 *   - day ranges and lists, including wrap-around: "Mo-Fr", "Sa,Su", "Fr-Mo"
 *   - multiple time intervals per rule: "09:00-12:00,13:00-17:00"
 *   - past-midnight intervals: "18:00-02:00" (close encoded as 26:00 = 1560)
 *   - explicit closures: "Mo off" / "Tu closed"
 *   - a bare time spec applies to all seven days: "09:00-17:00"
 * Pure and side-effect-free — unit-testable without any dataset.
 */

export type Weekday = "mo" | "tu" | "we" | "th" | "fr" | "sa" | "su";

const WEEKDAYS: Weekday[] = ["mo", "tu", "we", "th", "fr", "sa", "su"];

export interface OpeningInterval {
  /** minutes from midnight, 0-1439 */
  open: number;
  /** minutes from midnight; may exceed 1440 when the window crosses midnight
   *  (e.g. 18:00-02:00 → open 1080, close 1560) */
  close: number;
}

export interface StructuredOpeningHours {
  /** open around the clock, every day */
  twenty_four_seven: boolean;
  /** minute-granularity intervals per weekday. A day mapped to an empty
   *  array is explicitly closed; a day absent from the map was not stated. */
  weekly: Partial<Record<Weekday, OpeningInterval[]>>;
  /** true when part of the raw expression (months, public holidays,
   *  conditionals, …) could not be represented. `weekly` then reflects only
   *  the parsed subset — consumers should treat it conservatively and may
   *  fall back to the raw string. */
  partial: boolean;
}

/** "09:00" → 540. Accepts 24:00 (= 1440). Returns null on anything else. */
function parseTime(t: string): number | null {
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (min > 59) return null;
  if (h > 24 || (h === 24 && min > 0)) return null;
  return h * 60 + min;
}

/**
 * "Mo-Fr,Su" → [mo,tu,we,th,fr,su]; handles wrap ranges ("Fr-Mo").
 * PH / SH (public / school holiday) tokens in a day list — very common in
 * Japanese POI values like "Mo-Su,PH 09:30-18:00" — are dropped rather than
 * failing the whole rule; `droppedHoliday` reports the omission so the
 * caller can mark the result partial (the holiday schedule is unmodelled).
 */
function parseDaySpec(
  spec: string,
): { days: Weekday[]; droppedHoliday: boolean } | null {
  const out: Weekday[] = [];
  let droppedHoliday = false;
  for (const part of spec.split(",")) {
    const range = part.trim().toLowerCase();
    if (!range) return null;
    if (range === "ph" || range === "sh") {
      droppedHoliday = true;
      continue;
    }
    const m = range.match(/^([a-z]{2})(?:-([a-z]{2}))?$/);
    if (!m) return null;
    const from = WEEKDAYS.indexOf(m[1] as Weekday);
    if (from === -1) return null;
    if (!m[2]) {
      if (!out.includes(WEEKDAYS[from])) out.push(WEEKDAYS[from]);
      continue;
    }
    const to = WEEKDAYS.indexOf(m[2] as Weekday);
    if (to === -1) return null;
    // Inclusive range, wrapping across the week boundary when to < from.
    for (let i = from; ; i = (i + 1) % 7) {
      if (!out.includes(WEEKDAYS[i])) out.push(WEEKDAYS[i]);
      if (i === to) break;
    }
  }
  return out.length > 0 ? { days: out, droppedHoliday } : null;
}

/** "09:00-12:00,13:00-17:00" → intervals. Null when any piece is malformed. */
function parseTimeSpec(spec: string): OpeningInterval[] | null {
  const out: OpeningInterval[] = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) return null;
    const open = parseTime(m[1]);
    let close = parseTime(m[2]);
    if (open === null || close === null) return null;
    if (close <= open) close += 1440; // crosses midnight
    out.push({ open, close });
  }
  return out.length > 0 ? out : null;
}

/**
 * Parse an OSM opening_hours value into structured weekly windows.
 * Returns null when nothing in the expression could be parsed.
 */
export function parseOpeningHours(raw: string): StructuredOpeningHours | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed === "24/7") {
    const weekly: StructuredOpeningHours["weekly"] = {};
    for (const d of WEEKDAYS) weekly[d] = [{ open: 0, close: 1440 }];
    return { twenty_four_seven: true, weekly, partial: false };
  }

  const weekly: StructuredOpeningHours["weekly"] = {};
  let partial = false;
  let parsedAny = false;

  // "||" introduces a fallback rule set — beyond the modelled subset.
  const [main, ...fallbacks] = trimmed.split("||");
  if (fallbacks.length > 0) partial = true;

  for (const ruleRaw of main.split(";")) {
    const rule = ruleRaw.trim();
    if (!rule) continue;

    // Constructs outside the modelled subset make the result partial:
    // months (Jan..Dec / seasonal), week numbers, sunrise/sunset, open-ended
    // "+", and quoted conditional comments. (PH/SH inside a *day list* is
    // handled tolerantly by parseDaySpec instead of failing the rule.)
    if (
      /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|week|easter|sunrise|sunset|dawn|dusk)\b/i.test(
        rule,
      ) ||
      /["+]/.test(rule)
    ) {
      partial = true;
      continue;
    }

    // Split into optional day spec + body. Day spec = leading token composed
    // only of weekday abbreviations, commas and hyphens.
    const m = rule.match(/^([A-Za-z]{2}(?:\s*[-,]\s*[A-Za-z]{2})*)?\s*(.*)$/);
    const daySpecRaw = m?.[1]?.replace(/\s+/g, "") ?? null;
    const body = (m?.[2] ?? "").trim();

    let days: Weekday[] | null = null;
    if (daySpecRaw) {
      const spec = parseDaySpec(daySpecRaw);
      if (spec === null) {
        partial = true; // unrecognized day-ish token
        continue;
      }
      days = spec.days;
      if (spec.droppedHoliday) partial = true;
    }

    const bodyLower = body.toLowerCase();
    if (bodyLower === "off" || bodyLower === "closed") {
      if (days === null) {
        // "off" with no day spec — whole expression closed; not a schedule.
        partial = true;
        continue;
      }
      for (const d of days) weekly[d] = [];
      parsedAny = true;
      continue;
    }

    const intervals = parseTimeSpec(body);
    if (intervals === null) {
      partial = true;
      continue;
    }
    // No day spec → the time spec applies to all seven days.
    for (const d of days ?? WEEKDAYS) {
      // Later rules override earlier ones for the same day (OSM semantics).
      weekly[d] = intervals.map((iv) => ({ ...iv }));
    }
    parsedAny = true;
  }

  if (!parsedAny) return null;
  return { twenty_four_seven: false, weekly, partial };
}
