import { describe, it, expect } from "vitest";
import {
  nearestPrefecture,
  MAX_NEAREST_PREFECTURE_M,
} from "../../scrapers/matcher/match_hotels.js";

// A tiny synthetic centroid set: just enough to prove the function picks
// the closest one and returns null when nothing is within the threshold.
// Prefecture codes are the first two digits of a 5-digit municipality code:
//   "13" = Tōkyō, "27" = Ōsaka, "01" = Hokkaidō.
const CENTROIDS: [string, { lat: number; lng: number }][] = [
  ["13101", { lat: 35.6895, lng: 139.6917 }],   // Tōkyō (Chiyoda)
  ["27100", { lat: 34.6937, lng: 135.5023 }],   // Ōsaka
  ["01100", { lat: 43.0642, lng: 141.3469 }],   // Sapporo
];

describe("nearestPrefecture", () => {
  it("returns the prefecture code of the nearest centroid for a Japan coordinate", () => {
    // Shinjuku — about 5 km from the Tōkyō centroid.
    const shinjuku = { lat: 35.6938, lng: 139.7036 };
    expect(nearestPrefecture(shinjuku, CENTROIDS)).toBe("13");
  });

  it("returns null for a Korean coordinate (Seoul) — outside Japan", () => {
    const seoul = { lat: 37.5665, lng: 126.978 };
    expect(nearestPrefecture(seoul, CENTROIDS)).toBeNull();
  });

  it("returns null for a coordinate in the open Pacific Ocean", () => {
    const pacific = { lat: 35, lng: 160 };
    expect(nearestPrefecture(pacific, CENTROIDS)).toBeNull();
  });

  it("exposes the threshold as a module constant for transparency", () => {
    expect(MAX_NEAREST_PREFECTURE_M).toBe(30_000);
  });
});
