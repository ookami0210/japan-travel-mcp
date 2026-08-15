import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  loadFoodLayer,
  filterFoodVenues,
  clearFoodLayerCache,
  type FoodVenue,
} from "../../src/lib/food_layer.js";

afterEach(() => clearFoodLayerCache());

function venue(over: Partial<FoodVenue>): FoodVenue {
  return {
    id: "osm:node/1",
    names: { default: "店", ja: "店", en: null },
    geo: { lat: 34.7, lng: 135.5, address: null },
    amenity: "restaurant",
    cuisine: [],
    hours_raw: null,
    official_url: null,
    wheelchair: null,
    takeaway: null,
    prefecture_code: "27",
    area_id: null,
    source: "osm",
    last_verified: "2026-08-15T00:00:00Z",
    ...over,
  };
}

describe("filterFoodVenues", () => {
  it("matches q against names, cuisine, and amenity", () => {
    const entries = [
      venue({ id: "a", names: { default: "すし処 大和", ja: "すし処 大和", en: null }, cuisine: ["sushi"] }),
      venue({ id: "b", names: { default: "Cafe Blue", ja: null, en: "Cafe Blue" }, amenity: "cafe" }),
      venue({ id: "c", names: { default: "焼肉苑", ja: "焼肉苑", en: null }, cuisine: ["yakiniku"] }),
    ];
    expect(filterFoodVenues(entries, { q: "sushi", limit: 10 }).map((e) => e.id)).toEqual(["a"]);
    expect(filterFoodVenues(entries, { q: "すし", limit: 10 }).map((e) => e.id)).toEqual(["a"]);
    expect(filterFoodVenues(entries, { q: "cafe", limit: 10 }).map((e) => e.id)).toEqual(["b"]);
  });

  it("ranks completeness first: hours + official_url beat bare records", () => {
    const entries = [
      venue({ id: "bare" }),
      venue({ id: "rich", hours_raw: "Mo-Su 11:00-22:00", official_url: "https://x", cuisine: ["ramen"] }),
      venue({ id: "hours-only", hours_raw: "Mo-Fr 10:00-20:00" }),
    ];
    const out = filterFoodVenues(entries, { limit: 3 });
    expect(out.map((e) => e.id)).toEqual(["rich", "hours-only", "bare"]);
  });

  it("applies the limit after ranking", () => {
    const entries = Array.from({ length: 10 }, (_, i) => venue({ id: `v${i}` }));
    expect(filterFoodVenues(entries, { limit: 4 })).toHaveLength(4);
  });
});

describe("loadFoodLayer", () => {
  it("loads entries from a valid file and caches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "food-"));
    const p = join(dir, "osaka.json");
    await writeFile(p, JSON.stringify({ entries: [venue({ id: "x" })] }), "utf8");
    const first = await loadFoodLayer(p, "osaka");
    expect(first).toHaveLength(1);
    // Cache hit: file content change is not re-read for the same key.
    await writeFile(p, JSON.stringify({ entries: [] }), "utf8");
    const second = await loadFoodLayer(p, "osaka");
    expect(second).toHaveLength(1);
  });

  it("returns empty for a missing file (coverage gap, not an error)", async () => {
    const out = await loadFoodLayer("/nonexistent/nowhere.json", "none");
    expect(out).toEqual([]);
  });
});
