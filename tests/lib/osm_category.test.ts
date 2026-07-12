import { describe, it, expect } from "vitest";
import { categorizeFromOsmTags } from "../../scrapers/lib/osm_category.js";

describe("categorizeFromOsmTags", () => {
  it("classifies eateries as food (the primary consumer contract)", () => {
    expect(categorizeFromOsmTags({ amenity: "restaurant" })).toBe("food");
    expect(categorizeFromOsmTags({ amenity: "cafe" })).toBe("food");
    expect(categorizeFromOsmTags({ amenity: "fast_food" })).toBe("food");
    expect(categorizeFromOsmTags({ shop: "bakery" })).toBe("food");
  });

  it("treats a cuisine tag as a food signal", () => {
    expect(categorizeFromOsmTags({ cuisine: "ramen" })).toBe("food");
  });

  it("food wins over co-present weaker signals (first match)", () => {
    expect(
      categorizeFromOsmTags({ amenity: "restaurant", tourism: "attraction" }),
    ).toBe("food");
  });

  it("classifies markets separately from food", () => {
    expect(categorizeFromOsmTags({ amenity: "marketplace" })).toBe("market");
  });

  it("classifies lodging", () => {
    expect(categorizeFromOsmTags({ tourism: "hotel" })).toBe("lodging");
    expect(categorizeFromOsmTags({ tourism: "guest_house" })).toBe("lodging");
    expect(categorizeFromOsmTags({ tourism: "camp_site" })).toBe("lodging");
  });

  it("classifies Japanese baths / hot springs as onsen", () => {
    expect(categorizeFromOsmTags({ amenity: "public_bath" })).toBe("onsen");
    expect(categorizeFromOsmTags({ "bath:type": "onsen" })).toBe("onsen");
  });

  it("classifies shrines and temples as worship", () => {
    expect(categorizeFromOsmTags({ amenity: "place_of_worship" })).toBe(
      "worship",
    );
  });

  it("classifies museums and galleries as culture", () => {
    expect(categorizeFromOsmTags({ tourism: "museum" })).toBe("culture");
    expect(categorizeFromOsmTags({ tourism: "gallery" })).toBe("culture");
  });

  it("classifies parks and natural features as nature", () => {
    expect(categorizeFromOsmTags({ leisure: "park" })).toBe("nature");
    expect(categorizeFromOsmTags({ natural: "waterfall" })).toBe("nature");
  });

  it("classifies attractions / viewpoints / historic as sightseeing", () => {
    expect(categorizeFromOsmTags({ tourism: "attraction" })).toBe(
      "sightseeing",
    );
    expect(categorizeFromOsmTags({ tourism: "viewpoint" })).toBe("sightseeing");
    expect(categorizeFromOsmTags({ historic: "castle" })).toBe("sightseeing");
  });

  it("returns null when no rule matches (honest null, not a guess)", () => {
    expect(categorizeFromOsmTags({})).toBeNull();
    expect(categorizeFromOsmTags({ name: "somewhere" })).toBeNull();
    expect(categorizeFromOsmTags({ amenity: "parking" })).toBeNull();
    expect(categorizeFromOsmTags({ tourism: "information" })).toBeNull();
  });
});
