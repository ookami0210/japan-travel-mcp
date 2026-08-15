/**
 * Deterministic Schema.org JSON-LD fact extraction from official venue pages.
 *
 * Many restaurant/venue sites (especially site-builder-made ones) embed
 * machine-readable facts as <script type="application/ld+json"> —
 * openingHoursSpecification, priceRange, acceptsReservations, telephone.
 * Extracting THOSE (and only those) is pure structured-data reading: no
 * interpretation, no LLM, no guessing. A page without JSON-LD yields
 * nothing — honest null, an enrichment gap for a later pass.
 */

export interface JsonLdVenueFacts {
  /** Raw openingHoursSpecification objects, as published. */
  hours_spec: Array<Record<string, unknown>> | null;
  /** Raw openingHours strings (schema.org alternative form). */
  opening_hours: string[] | null;
  /** Raw priceRange string, e.g. "¥1,000～¥1,999" or "$$". */
  price_range_raw: string | null;
  /** Raw acceptsReservations value (bool / string / URL). */
  accepts_reservations: string | null;
  telephone: string | null;
}

const VENUE_TYPES = new Set([
  "Restaurant",
  "FoodEstablishment",
  "CafeOrCoffeeShop",
  "BarOrPub",
  "FastFoodRestaurant",
  "Bakery",
  "IceCreamShop",
  "Winery",
  "Brewery",
  "Distillery",
  "LocalBusiness",
]);

function typeMatches(t: unknown): boolean {
  if (typeof t === "string") return VENUE_TYPES.has(t.replace(/^https?:\/\/schema\.org\//, ""));
  if (Array.isArray(t)) return t.some(typeMatches);
  return false;
}

/** Depth-first over a parsed JSON-LD document (handles @graph nesting). */
function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const x of node) yield* walk(x);
    return;
  }
  if (node && typeof node === "object") {
    yield node as Record<string, unknown>;
    const graph = (node as Record<string, unknown>)["@graph"];
    if (graph) yield* walk(graph);
  }
}

function asStringArray(v: unknown): string[] | null {
  if (typeof v === "string" && v.trim()) return [v.trim()];
  if (Array.isArray(v)) {
    const out = v.filter((x): x is string => typeof x === "string" && !!x.trim());
    return out.length ? out : null;
  }
  return null;
}

/** Extract venue facts from raw HTML. Returns null when the page carries no
 *  matching JSON-LD — the caller records an honest "nothing published". */
export function extractJsonLdFacts(html: string): JsonLdVenueFacts | null {
  const scripts = html.matchAll(
    /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  let best: JsonLdVenueFacts | null = null;
  for (const m of scripts) {
    let doc: unknown;
    try {
      doc = JSON.parse(m[1].trim());
    } catch {
      continue; // malformed block — skip, never guess
    }
    for (const node of walk(doc)) {
      if (!typeMatches(node["@type"])) continue;
      const spec = node.openingHoursSpecification;
      const specArr = Array.isArray(spec)
        ? (spec.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>)
        : spec && typeof spec === "object"
          ? [spec as Record<string, unknown>]
          : null;
      const facts: JsonLdVenueFacts = {
        hours_spec: specArr && specArr.length ? specArr : null,
        opening_hours: asStringArray(node.openingHours),
        price_range_raw:
          typeof node.priceRange === "string" && node.priceRange.trim()
            ? node.priceRange.trim()
            : null,
        accepts_reservations:
          node.acceptsReservations !== undefined && node.acceptsReservations !== null
            ? String(node.acceptsReservations)
            : null,
        telephone:
          typeof node.telephone === "string" && node.telephone.trim()
            ? node.telephone.trim()
            : null,
      };
      const weight = (f: JsonLdVenueFacts): number =>
        (f.hours_spec ? 4 : 0) +
        (f.opening_hours ? 2 : 0) +
        (f.price_range_raw ? 2 : 0) +
        (f.accepts_reservations ? 1 : 0) +
        (f.telephone ? 1 : 0);
      if (weight(facts) === 0) continue;
      if (!best || weight(facts) > weight(best)) best = facts;
    }
  }
  return best;
}
