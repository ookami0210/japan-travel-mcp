/**
 * Deterministic parser for simple OSM `charge` values (admission fees).
 *
 * OSM charge strings in Japan are mostly of the forms:
 *   "300 JPY" / "300JPY" / "¥500" / "500 ¥" / "500 yen" / "300 JPY/person"
 * Tiered lists ("730 JPY/adult;0 JPY/child", "520 JPY;310 JPY;200 JPY") are
 * NOT collapsed to a single number — picking one tier would misstate the
 * price for other visitors. Honest contract: parse only unambiguous
 * single-value forms; everything else keeps the raw string only.
 */

export interface ParsedCharge {
  amount: number;
  currency: "JPY";
  /** per-unit qualifier when stated, e.g. "person" / "adult" */
  per?: string;
}

export function parseCharge(raw: string): ParsedCharge | null {
  const t = raw.trim();
  // Multiple values (tiers) — ambiguous, keep raw only.
  if (t.includes(";") || t.includes(",")) return null;

  // "¥500" / "￥500"
  let m = t.match(/^[¥￥]\s*(\d+)$/);
  if (m) return { amount: parseInt(m[1], 10), currency: "JPY" };

  // "300 JPY" / "300JPY" / "300 yen" / "500 ¥" — optional "/person" etc.
  m = t.match(/^(\d+)\s*(?:jpy|yen|円|[¥￥])(?:\s*\/\s*([a-z]+))?$/i);
  if (m) {
    const parsed: ParsedCharge = { amount: parseInt(m[1], 10), currency: "JPY" };
    if (m[2]) parsed.per = m[2].toLowerCase();
    return parsed;
  }

  return null;
}
