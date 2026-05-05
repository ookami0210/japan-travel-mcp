/**
 * Geo utilities — coordinate parsing and great-circle distance.
 *
 * Pure functions. Used by `get_hotels`, `get_events`, and
 * `plan_feasibility_check`. Distances are computed via the haversine formula
 * on a spherical Earth (~0.5 % error vs. WGS-84 ellipsoid — fine for the
 * "is this itinerary even feasible?" sanity check we do here).
 */

/** Mean Earth radius in metres. */
export const EARTH_RADIUS_M = 6_371_000;
/** Mean Earth radius in kilometres. */
export const EARTH_RADIUS_KM = 6_371;

export interface LatLng {
  lat: number;
  lng: number;
}

const toRad = (d: number): number => (d * Math.PI) / 180;

/**
 * Great-circle distance in metres between two lat/lng points.
 * Used by `get_hotels` (radius filter, distance-from-spot ranking).
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Great-circle distance in kilometres. Used by `plan_feasibility_check` for
 * the rough km/hour travel-time estimate.
 *
 * Implemented as `haversineMeters / 1000` so the two helpers stay in lock
 * step — a previous duplication had two slightly different formulations
 * which were arithmetically identical but easy to drift.
 */
export function haversineKm(a: LatLng, b: LatLng): number {
  return haversineMeters(a, b) / 1000;
}

/**
 * Parse a WKT (Well-Known Text) `POINT(lng lat)` string into a LatLng.
 * Accepts WKT as Wikidata SPARQL emits it — case-insensitive `point` token,
 * negative coordinates, decimal points. Returns `null` for anything that
 * doesn't match the shape (callers must handle missing coords explicitly).
 *
 * Note WKT order is `lng lat`, NOT `lat lng` — easy to get wrong.
 */
export function parseWktPoint(v: string): LatLng | null {
  const m = v.match(/Point\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i);
  if (!m) return null;
  return { lng: parseFloat(m[1]), lat: parseFloat(m[2]) };
}
