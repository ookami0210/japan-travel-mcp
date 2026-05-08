import { describe, it, expect } from "vitest";
import { scoreSpotQuality } from "../../src/lib/spot_quality.js";

// The runtime scoreSpotQuality function MUST stay in lock-step with
// scrapers/lib/quality_score.ts. The scrapers-side rubric has its own
// pinning suite (tests/lib/quality_score.test.ts); this file pins the
// runtime side independently so a future drift between the two is
// caught by either suite.

describe("scoreSpotQuality — additive rubric", () => {
  it("scores an empty record as 0", () => {
    expect(scoreSpotQuality({})).toBe(0);
  });

  it("description alone contributes 0.2 + length boost", () => {
    // Short description → 0.2 (presence) + tiny length contribution.
    const short = scoreSpotQuality({ description: "a" });
    expect(short).toBeGreaterThan(0.2);
    expect(short).toBeLessThan(0.21);

    // 120-char description hits the length cap.
    const long = scoreSpotQuality({ description: "x".repeat(120) });
    expect(long).toBeCloseTo(0.35, 5); // 0.2 + 0.15
  });

  it("body_paragraphs contribute up to 0.2 (capped at 2 paragraphs)", () => {
    expect(scoreSpotQuality({ body_paragraphs: [] })).toBe(0);
    expect(scoreSpotQuality({ body_paragraphs: ["one"] })).toBeCloseTo(0.1, 5);
    expect(scoreSpotQuality({ body_paragraphs: ["one", "two"] })).toBeCloseTo(
      0.2,
      5,
    );
    // Cap holds at 4 / 8 paragraphs.
    expect(
      scoreSpotQuality({ body_paragraphs: ["a", "b", "c", "d"] }),
    ).toBeCloseTo(0.2, 5);
  });

  it("address contributes 0.1", () => {
    expect(scoreSpotQuality({ address: "Tokyo, Japan" })).toBe(0.1);
  });

  it("coordinate precision drives the geo bonus", () => {
    const coords = { lat: 35.0, lng: 139.0 };
    expect(
      scoreSpotQuality({
        coordinates: coords,
        coordinate_precision: "exact",
      }),
    ).toBe(0.1);
    expect(
      scoreSpotQuality({
        coordinates: coords,
        coordinate_precision: "address_geocoded",
      }),
    ).toBe(0.07);
    // Anything else (e.g. municipality_centroid, null) → 0.04.
    expect(
      scoreSpotQuality({
        coordinates: coords,
        coordinate_precision: "municipality_centroid",
      }),
    ).toBe(0.04);
    expect(scoreSpotQuality({ coordinates: coords })).toBe(0.04);
  });

  it("schema_events / schema_places contribute 0.15 when either is non-empty", () => {
    expect(scoreSpotQuality({ schema_events: [{}] })).toBe(0.15);
    expect(scoreSpotQuality({ schema_places: [{}] })).toBe(0.15);
    // Both → still just 0.15 (single bonus).
    expect(
      scoreSpotQuality({ schema_events: [{}], schema_places: [{}, {}] }),
    ).toBe(0.15);
  });

  it("images contribute 0.1 when ≥ 1 image is present", () => {
    expect(scoreSpotQuality({ images: ["a.jpg"] })).toBe(0.1);
    expect(scoreSpotQuality({ images: ["a.jpg", "b.jpg"] })).toBe(0.1);
    expect(scoreSpotQuality({ images: [] })).toBe(0);
  });
});

describe("scoreSpotQuality — composition", () => {
  it("a maximally-rich record scores 1.0", () => {
    const score = scoreSpotQuality({
      description: "x".repeat(200),
      body_paragraphs: ["a", "b"],
      address: "Tokyo",
      coordinates: { lat: 35, lng: 139 },
      coordinate_precision: "exact",
      images: ["a.jpg"],
      schema_events: [{}],
      schema_places: [{}],
    });
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("is monotonic: adding signals never lowers the score", () => {
    const base = scoreSpotQuality({ description: "test" });
    const plus = scoreSpotQuality({
      description: "test",
      address: "Kyoto",
    });
    expect(plus).toBeGreaterThanOrEqual(base);
  });
});
