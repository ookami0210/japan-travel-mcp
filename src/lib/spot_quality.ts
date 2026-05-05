/**
 * Quality scoring for tourist-spot records.
 *
 * Mirrors `scrapers/lib/quality_score.ts` but lives in src/ so the
 * runtime can use it without reaching into the scrapers tree once
 * shipped. The two MUST stay in sync — `tests/lib/quality_score.test.ts`
 * pins the scrapers-side rubric and `tests/lib/spot_quality.test.ts`
 * pins this one.
 *
 * Pure function. Range: roughly 0.0 (empty record) to ~1.0 (rich record
 * with description, body, geo, images, and schema-extracted events).
 */

/**
 * Narrow input contract — structurally compatible with TouristSpot in
 * scrapers/lib/types.ts and the per-spot record shape used inside
 * src/index.ts.
 */
export interface SpotForScoring {
  description?: string | null;
  body_paragraphs?: string[];
  address?: string | null;
  coordinates?: { lat: number; lng: number } | null;
  coordinate_precision?: string | null;
  images?: string[];
  schema_events?: unknown[];
  schema_places?: unknown[];
}

export function scoreSpotQuality(s: SpotForScoring): number {
  let score = 0;
  if (s.description) {
    score += 0.2;
    score += Math.min(0.15, ((s.description.length ?? 0) / 120) * 0.15);
  }
  const bodies = s.body_paragraphs ?? [];
  score += Math.min(0.2, (bodies.length / 2) * 0.2);
  if (s.address) score += 0.1;
  if (s.coordinates) {
    if (s.coordinate_precision === "exact") score += 0.1;
    else if (s.coordinate_precision === "address_geocoded") score += 0.07;
    else score += 0.04;
  }
  const sn = (s.schema_events?.length ?? 0) + (s.schema_places?.length ?? 0);
  if (sn > 0) score += 0.15;
  if ((s.images?.length ?? 0) > 0) score += 0.1;
  return score;
}
