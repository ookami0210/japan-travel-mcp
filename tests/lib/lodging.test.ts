import { describe, it, expect } from "vitest";
import {
  classifyLodging,
  type LodgingType,
  type LodgingInput,
} from "../../src/lib/lodging.js";

function input(over: Partial<LodgingInput> = {}): LodgingInput {
  return {
    name: null,
    name_en: null,
    type: null,
    ...over,
  };
}

// Order in `classifyLodging` is "most specific first" — these tests pin
// that order so a future re-ordering doesn't quietly change which bucket
// a hotel falls into.

describe("classifyLodging — JA-name match", () => {
  it.each<[label: string, name: string, expected: LodgingType]>([
    ["shukubo (宿坊)", "高野山○○宿坊", "shukubo"],
    ["kominka (古民家)", "○○古民家ステイ", "kominka"],
    ["machiya → kominka", "京都町家ホテル", "kominka"],
    ["onsen + ryokan → onsen_ryokan", "草津温泉旅館", "onsen_ryokan"],
    ["ryokan only", "○○旅館", "ryokan"],
    ["minshuku", "○○民宿", "minshuku"],
    ["onsen alone → onsen_ryokan", "○○温泉ホテル", "onsen_ryokan"],
  ])("classifies %s", (_label, name, expected) => {
    expect(classifyLodging(input({ name }))).toBe(expected);
  });
});

describe("classifyLodging — EN-name match (case-insensitive)", () => {
  it.each<[name_en: string, expected: LodgingType]>([
    ["Mt Koya Shukubo Stay", "shukubo"],
    ["Temple Lodging Experience", "shukubo"],
    ["Kominka Stay Kyoto", "kominka"],
    ["Machiya Townhouse", "kominka"],
    ["Onsen Ryokan Kusatsu", "onsen_ryokan"],
    ["Famous Ryokan", "ryokan"],
    ["Family Minshuku", "minshuku"],
    ["Onsen Resort", "onsen_ryokan"],
  ])("'%s' → %s", (name_en, expected) => {
    expect(classifyLodging(input({ name_en }))).toBe(expected);
  });

  it("upper-case EN tokens still match (the implementation lower-cases)", () => {
    expect(classifyLodging(input({ name_en: "RYOKAN" }))).toBe("ryokan");
    expect(classifyLodging(input({ name_en: "ONSEN RYOKAN" }))).toBe(
      "onsen_ryokan",
    );
  });

  it("EN-only token in the name field (not name_en) still matches", () => {
    // Defensive: the original implementation composes `(h.name ?? "") + " "
    // + (h.name_en ?? "").toLowerCase()` — only `name_en` is pre-lowered.
    // The subsequent comparisons all use `name.toLowerCase().includes(...)`
    // for ASCII tokens, so an EN word in `name` (case-mixed or upper) still
    // matches via the second pass.
    expect(classifyLodging(input({ name: "Ryokan Suzuki" }))).toBe("ryokan");
    expect(classifyLodging(input({ name: "MINSHUKU Tanaka" }))).toBe(
      "minshuku",
    );
  });
});

describe("classifyLodging — specificity order", () => {
  it("shukubo wins over ryokan when both tokens are present", () => {
    expect(
      classifyLodging(input({ name: "○○旅館宿坊" })),
    ).toBe("shukubo");
  });

  it("kominka wins over onsen+ryokan when kominka token is present", () => {
    expect(
      classifyLodging(input({ name: "○○温泉旅館 (古民家)" })),
    ).toBe("kominka");
  });

  it("onsen_ryokan wins over plain ryokan when both tokens are present", () => {
    expect(
      classifyLodging(input({ name: "○○温泉旅館" })),
    ).toBe("onsen_ryokan");
  });
});

describe("classifyLodging — fallback to OSM `type` field", () => {
  it.each<[type: string, expected: LodgingType]>([
    ["hostel", "hostel"],
    ["guest_house", "guest_house"],
    ["apartment", "apartment"],
    ["motel", "motel"],
    ["hotel", "hotel"],
  ])("preserves OSM type '%s'", (type, expected) => {
    expect(classifyLodging(input({ type }))).toBe(expected);
  });

  it("falls back to 'hotel' when type is null and no name tokens match", () => {
    expect(classifyLodging(input({ name: "Random Name" }))).toBe("hotel");
  });

  it("falls back to 'hotel' when the OSM type is unrecognised", () => {
    expect(classifyLodging(input({ type: "bungalow" }))).toBe("hotel");
  });

  it("falls back to 'hotel' when both name fields are null and type is null", () => {
    expect(classifyLodging(input())).toBe("hotel");
  });
});
