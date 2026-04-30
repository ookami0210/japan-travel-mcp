/**
 * Per-spot quality rubric (E2 / ADR 0001).
 *
 * Lives in its own module so the rubric is unit-testable in isolation
 * — `quality_report.ts` is a thin shell that loads data from disk and
 * delegates the scoring to here.
 *
 * Components and weights (sum to 1.0):
 *   - has_description       : 0.20
 *   - description_length    : 0.15  (>=120 chars = full credit)
 *   - has_body_paragraphs   : 0.20  (>=2 paragraphs = full)
 *   - has_address           : 0.10
 *   - has_coordinates       : 0.10  (exact > address_geocoded > centroid)
 *   - has_schema_data       : 0.15  (any JSON-LD Event/Place present)
 *   - has_image             : 0.10
 */

export interface SpotForScoring {
  description: string | null;
  body_paragraphs?: string[];
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  coordinate_precision: string | null;
  images: string[];
  schema_events?: unknown[];
  schema_places?: unknown[];
}

export type QualityBand = "low" | "medium" | "high";

export interface QualityScore {
  score: number;
  band: QualityBand;
  components: {
    has_description: number;
    description_length: number;
    has_body_paragraphs: number;
    has_address: number;
    has_coordinates: number;
    has_schema_data: number;
    has_image: number;
  };
}

export const QUALITY_BAND_THRESHOLDS = {
  high: 0.65,
  medium: 0.30,
} as const;

export function scoreSpot(s: SpotForScoring): QualityScore {
  const components = {
    has_description: s.description ? 0.2 : 0,
    description_length: s.description
      ? Math.min(0.15, ((s.description.length ?? 0) / 120) * 0.15)
      : 0,
    has_body_paragraphs: Math.min(
      0.2,
      ((s.body_paragraphs?.length ?? 0) / 2) * 0.2,
    ),
    has_address: s.address ? 0.1 : 0,
    has_coordinates: scoreCoordinates(s),
    has_schema_data: scoreSchema(s),
    has_image: (s.images?.length ?? 0) > 0 ? 0.1 : 0,
  };
  const score = Object.values(components).reduce((a, b) => a + b, 0);
  const rounded = Math.round(score * 1000) / 1000;
  return { score: rounded, band: bandFor(rounded), components };
}

function scoreCoordinates(s: SpotForScoring): number {
  if (!s.coordinates) return 0;
  if (s.coordinate_precision === "exact") return 0.1;
  if (s.coordinate_precision === "address_geocoded") return 0.07;
  return 0.04;
}

function scoreSchema(s: SpotForScoring): number {
  const n = (s.schema_events?.length ?? 0) + (s.schema_places?.length ?? 0);
  return Math.min(0.15, n * 0.15);
}

export function bandFor(score: number): QualityBand {
  if (score >= QUALITY_BAND_THRESHOLDS.high) return "high";
  if (score >= QUALITY_BAND_THRESHOLDS.medium) return "medium";
  return "low";
}
