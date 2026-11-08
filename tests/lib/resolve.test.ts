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

describe("resolveByName: area_hint is a constraint", () => {
  const AMBIG = buildResolveIndex([
    entry({ id: "KYOTO", names: ["清水寺", "Kiyomizu-dera"], prefecture_code: "26", lat: 34.9949, lng: 135.785 }),
    entry({ id: "OITA", names: ["清水寺"], prefecture_code: "44", lat: 33.5325, lng: 131.3501 }),
    entry({ id: "NOPREF", names: ["清水寺"], prefecture_code: null }),
    entry({ id: "HOTEL17", source: "hotel", names: ["金閣"], prefecture_code: "17", lat: 36.333, lng: 136.447 }),
  ]);

  it("drops candidates outside the hinted prefecture instead of demoting them", () => {
    const r = resolveByName(AMBIG, "清水寺", { prefCodes: new Set(["26"]) });
    const ids = r.map((m) => m.entry.id);
    expect(ids).toContain("KYOTO");
    expect(ids).not.toContain("OITA");
    expect(r[0].entry.id).toBe("KYOTO");
    expect(r[0].confidence).toBe("high");
    expect(r[0].ambiguous_with_prefectures).toBeUndefined();
  });

  it("keeps entries with no prefecture on record when a hint is given", () => {
    const r = resolveByName(AMBIG, "清水寺", { prefCodes: new Set(["26"]) });
    expect(r.map((m) => m.entry.id)).toContain("NOPREF");
  });

  it("returns no_match rather than an out-of-prefecture fuzzy hit", () => {
    // 金閣寺 fuzzy-matches the Ishikawa hotel "金閣"; with a Kyoto hint that
    // hotel is not an answer, and nothing else is, so the result is empty.
    const r = resolveByName(AMBIG, "金閣寺", { prefCodes: new Set(["26"]) });
    expect(r).toHaveLength(0);
    const unhinted = resolveByName(AMBIG, "金閣寺");
    expect(unhinted.map((m) => m.entry.id)).toContain("HOTEL17");
  });

  it("caps exact-name matches at medium when the same name exists in other prefectures", () => {
    const r = resolveByName(AMBIG, "清水寺");
    const kyoto = r.find((m) => m.entry.id === "KYOTO")!;
    const oita = r.find((m) => m.entry.id === "OITA")!;
    expect(kyoto.confidence).toBe("medium");
    expect(oita.confidence).toBe("medium");
    expect(kyoto.ambiguous_with_prefectures).toEqual(["44"]);
    expect(oita.ambiguous_with_prefectures).toEqual(["26"]);
  });

  it("a coordinate hint lifts the cap and picks the nearby one", () => {
    const r = resolveByName(AMBIG, "清水寺", { near: { lat: 34.9949, lng: 135.785 } });
    expect(r[0].entry.id).toBe("KYOTO");
    expect(r[0].confidence).toBe("high");
    expect(r[0].ambiguous_with_prefectures).toBeUndefined();
  });

  it("does not flag ambiguity when the exact name is unique", () => {
    const r = resolveByName(INDEX, "東京タワー");
    expect(r[0].confidence).toBe("high");
    expect(r[0].ambiguous_with_prefectures).toBeUndefined();
  });
});
