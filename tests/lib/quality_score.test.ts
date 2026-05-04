import { describe, it, expect } from "vitest";
import {
  scoreSpot,
  bandFor,
  QUALITY_BAND_THRESHOLDS,
  type SpotForScoring,
} from "../../scrapers/lib/quality_score.js";

const empty: SpotForScoring = {
  description: null,
  body_paragraphs: [],
  address: null,
  coordinates: null,
  coordinate_precision: null,
  images: [],
  schema_events: [],
  schema_places: [],
};

describe("scoreSpot — components", () => {
  it("returns 0 / low for an empty spot", () => {
    const r = scoreSpot(empty);
    expect(r.score).toBe(0);
    expect(r.band).toBe("low");
  });

  it("description gives 0.20 + length-prorated up to 0.15", () => {
    const short = scoreSpot({ ...empty, description: "x".repeat(60) });
    expect(short.components.has_description).toBe(0.2);
    // 60/120 * 0.15 = 0.075
    expect(short.components.description_length).toBeCloseTo(0.075, 4);

    const full = scoreSpot({ ...empty, description: "x".repeat(200) });
    expect(full.components.description_length).toBe(0.15);
  });

  it("body paragraphs cap at 0.20 (>=2 = full credit)", () => {
    expect(scoreSpot({ ...empty, body_paragraphs: ["one"] }).components.has_body_paragraphs).toBe(0.1);
    expect(scoreSpot({ ...empty, body_paragraphs: ["one", "two"] }).components.has_body_paragraphs).toBe(0.2);
    expect(scoreSpot({ ...empty, body_paragraphs: ["1", "2", "3", "4"] }).components.has_body_paragraphs).toBe(0.2);
  });

  it("coordinates rank exact > address_geocoded > centroid", () => {
    const exact = scoreSpot({
      ...empty,
      coordinates: { lat: 1, lng: 2 },
      coordinate_precision: "exact",
    });
    const geocoded = scoreSpot({
      ...empty,
      coordinates: { lat: 1, lng: 2 },
      coordinate_precision: "address_geocoded",
    });
    const centroid = scoreSpot({
      ...empty,
      coordinates: { lat: 1, lng: 2 },
      coordinate_precision: "centroid",
    });
    expect(exact.components.has_coordinates).toBe(0.1);
    expect(geocoded.components.has_coordinates).toBe(0.07);
    expect(centroid.components.has_coordinates).toBe(0.04);
  });

  it("schema data gives 0.15 once any Event or Place is present", () => {
    expect(
      scoreSpot({ ...empty, schema_events: [{}] }).components.has_schema_data,
    ).toBe(0.15);
    expect(
      scoreSpot({ ...empty, schema_places: [{}] }).components.has_schema_data,
    ).toBe(0.15);
    // multiple still capped at 0.15 (the rubric only credits "has any")
    expect(
      scoreSpot({ ...empty, schema_events: [{}, {}, {}] }).components.has_schema_data,
    ).toBe(0.15);
  });

  it("address and image are binary 0 or 0.10", () => {
    expect(scoreSpot({ ...empty, address: "東京都" }).components.has_address).toBe(0.1);
    expect(scoreSpot({ ...empty, images: ["x.jpg"] }).components.has_image).toBe(0.1);
  });
});

describe("scoreSpot — bands", () => {
  it("classifies a fully-populated rich spot as 'high'", () => {
    const rich: SpotForScoring = {
      description: "x".repeat(200),
      body_paragraphs: ["a longer paragraph", "another solid paragraph"],
      address: "東京都千代田区",
      coordinates: { lat: 35.68, lng: 139.76 },
      coordinate_precision: "exact",
      images: ["a.jpg"],
      schema_events: [{}],
      schema_places: [],
    };
    const r = scoreSpot(rich);
    expect(r.band).toBe("high");
    expect(r.score).toBe(1);
  });

  it("classifies a description-only spot as 'medium'", () => {
    // 0.20 (has_description) + 0.15 (length) = 0.35 → medium
    const r = scoreSpot({ ...empty, description: "x".repeat(200) });
    expect(r.band).toBe("medium");
    expect(r.score).toBeGreaterThanOrEqual(0.3);
    expect(r.score).toBeLessThan(0.65);
  });

  it("classifies a near-empty spot (only image) as 'low'", () => {
    // 0.10 < 0.30 → low
    expect(scoreSpot({ ...empty, images: ["a.jpg"] }).band).toBe("low");
  });
});

describe("bandFor — thresholds", () => {
  it("uses constants exposed from the module", () => {
    expect(QUALITY_BAND_THRESHOLDS.high).toBe(0.65);
    expect(QUALITY_BAND_THRESHOLDS.medium).toBe(0.3);
  });

  it("is inclusive at the boundaries", () => {
    expect(bandFor(0.65)).toBe("high");
    expect(bandFor(0.6499)).toBe("medium");
    expect(bandFor(0.3)).toBe("medium");
    expect(bandFor(0.2999)).toBe("low");
    expect(bandFor(0)).toBe("low");
  });
});

describe("scoreSpot — rounding", () => {
  it("rounds the final score to 3 decimal places", () => {
    const r = scoreSpot({ ...empty, description: "x".repeat(50) });
    // 0.2 + (50/120 * 0.15) = 0.2 + 0.0625 = 0.2625
    expect(r.score).toBe(0.263);
  });
});
