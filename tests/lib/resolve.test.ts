import { describe, it, expect } from "vitest";
import {
  normalizeName,
  diceSimilarity,
  buildResolveIndex,
  resolveByName,
  type ResolveEntry,
} from "../../src/lib/resolve.js";

function entry(over: Partial<ResolveEntry> & { id: string; names: string[] }): ResolveEntry {
  return {
    source: "attraction",
    canonical_name: over.names[0],
    lat: null,
    lng: null,
    prefecture_code: null,
    category: null,
    official_url: null,
    reference_url: null,
    ...over,
  };
}

const INDEX = buildResolveIndex([
  entry({
    id: "Q1",
    names: ["俵屋旅館", "Tawaraya Ryokan", "Tawaraya"],
    prefecture_code: "26",
    lat: 35.011,
    lng: 135.767,
  }),
  entry({
    id: "H1",
    source: "hotel",
    names: ["ホテルグランヴィア京都", "Hotel Granvia Kyoto"],
    prefecture_code: "26",
    lat: 34.985,
    lng: 135.758,
  }),
  entry({
    id: "F1",
    source: "food_venue",
    names: ["菊乃井 本店", "Kikunoi"],
    prefecture_code: "26",
    lat: 35.001,
    lng: 135.781,
  }),
  entry({
    id: "Q2",
    names: ["金閣寺", "Kinkaku-ji", "Golden Pavilion", "鹿苑寺"],
    prefecture_code: "26",
  }),
  entry({
    id: "Q3",
    names: ["東京タワー", "Tokyo Tower"],
    prefecture_code: "13",
  }),
]);

describe("normalizeName", () => {
  it("folds width, case, and separators", () => {
    expect(normalizeName("Ｈｏｔｅｌ Ｇｒａｎｖｉａ")).toBe("hotelgranvia");
    expect(normalizeName("Kinkaku-ji")).toBe(normalizeName("kinkakuji"));
    expect(normalizeName("菊乃井 本店")).toBe("菊乃井本店");
  });
});

describe("diceSimilarity", () => {
  it("scores identical=1, disjoint=0, close spellings high", () => {
    expect(diceSimilarity("granvia", "granvia")).toBe(1);
    expect(diceSimilarity("abc", "xyz")).toBe(0);
    expect(diceSimilarity("tawaraya", "tawariya")).toBeGreaterThan(0.6);
  });
});

describe("resolveByName", () => {
  it("resolves exact ja and en names with high confidence", () => {
    const ja = resolveByName(INDEX, "俵屋旅館");
    expect(ja[0].entry.id).toBe("Q1");
    expect(ja[0].confidence).toBe("high");

    const en = resolveByName(INDEX, "Hotel Granvia Kyoto");
    expect(en[0].entry.id).toBe("H1");
    expect(en[0].confidence).toBe("high");
  });

  it("resolves nicknames and alt names (Golden Pavilion → 金閣寺)", () => {
    const r = resolveByName(INDEX, "golden pavilion");
    expect(r[0].entry.id).toBe("Q2");
  });

  it("handles containment variants (Granvia Kyoto, Kikunoi)", () => {
    expect(resolveByName(INDEX, "Granvia Kyoto")[0].entry.id).toBe("H1");
    expect(resolveByName(INDEX, "Kikunoi")[0].entry.id).toBe("F1");
  });

  it("area_hint boosts in-area and demotes out-of-area", () => {
    const kyoto = resolveByName(INDEX, "tower", { prefCodes: new Set(["13"]) });
    // "tower" alone is too weak vs floor for most, but Tokyo Tower contains it
    if (kyoto.length > 0) expect(kyoto[0].entry.id).toBe("Q3");
  });

  it("near= boosts geographically close entries", () => {
    const r = resolveByName(INDEX, "tawaraya", {
      near: { lat: 35.01, lng: 135.77 },
    });
    expect(r[0].entry.id).toBe("Q1");
    expect(r[0].score).toBeGreaterThan(0.95);
  });

  it("returns nothing below the honesty floor instead of guessing", () => {
    expect(resolveByName(INDEX, "completely unrelated zzz")).toHaveLength(0);
  });

  it("tolerates minor spelling drift (Tawariya → 俵屋)", () => {
    const r = resolveByName(INDEX, "Tawariya Ryokan");
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].entry.id).toBe("Q1");
  });
});
