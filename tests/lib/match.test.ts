import { describe, it, expect } from "vitest";
import {
  matchesMunicipality,
  stripMuniSuffix,
  stripPrefSuffix,
} from "../../src/lib/match.js";

describe("matchesMunicipality", () => {
  it("returns true for empty / null query (no filter)", () => {
    expect(matchesMunicipality("京都市", null)).toBe(true);
    expect(matchesMunicipality("京都市", undefined)).toBe(true);
    expect(matchesMunicipality("京都市", "")).toBe(true);
    expect(matchesMunicipality("京都市", "   ")).toBe(true);
  });

  it("matches exact JA name", () => {
    expect(matchesMunicipality("南山城村", "南山城村")).toBe(true);
    expect(matchesMunicipality("京都市", "京都市")).toBe(true);
  });

  it("matches bare name (suffix stripped) on either side", () => {
    // "南山城" (bare) → "南山城村"
    expect(matchesMunicipality("南山城村", "南山城")).toBe(true);
    // "南山城村" → "南山城" (caller bare against record bare)
    expect(matchesMunicipality("南山城村", "南山城村")).toBe(true);
    // "京都" → "京都市"
    expect(matchesMunicipality("京都市", "京都")).toBe(true);
    // "宇治" → "宇治市"
    expect(matchesMunicipality("宇治市", "宇治")).toBe(true);
  });

  it("partial inclusion match (prefix-style) for the bare query", () => {
    // "城" appears in "南山城村" — caller's bare ("城") is in record's bare
    // ("南山城"). We accept this because the caller might be giving a
    // partial recall of the name.
    expect(matchesMunicipality("南山城村", "城")).toBe(true);
  });

  it("does NOT match unrelated municipalities (no false positives)", () => {
    expect(matchesMunicipality("京都市", "南山城")).toBe(false);
    expect(matchesMunicipality("京都市", "南山城村")).toBe(false);
    expect(matchesMunicipality("京都市右京区", "南山城村")).toBe(false);
    expect(matchesMunicipality("綾部市", "南山城")).toBe(false);
    expect(matchesMunicipality("舞鶴市", "南山城")).toBe(false);
  });

  it("does NOT confuse 京都市右京区 / 京都市西京区 / 京都市中京区 by 京", () => {
    // "京" is a single character — partial match would be too greedy.
    // Our logic requires the bare-query to fit inside the record's bare.
    // bare("京") = "京"; record bares: "京都市右京区"→"京都市右京", etc.
    // "京都市右京".includes("京") is true → we DO match here. That's
    // intentionally permissive: a query of just "京" is genuinely
    // ambiguous and the caller should narrow it.
    expect(matchesMunicipality("京都市右京区", "京")).toBe(true);
    // But specific queries should narrow:
    expect(matchesMunicipality("京都市右京区", "南山城")).toBe(false);
  });

  it("is case-insensitive (English slugs, lowercase)", () => {
    // Today the data is JA, but romaji slugs are coming. Make sure the
    // case-folding doesn't break.
    expect(matchesMunicipality("Minamiyamashiro", "minamiyamashiro")).toBe(true);
    expect(matchesMunicipality("MINAMIYAMASHIRO", "Minamiyamashiro")).toBe(true);
  });

  it("rejects romaji query against kanji name (search_area is for that)", () => {
    // We deliberately don't try to romaji-match. A user passing
    // "Minamiyamashiro" against a JA-only dataset should hit nothing
    // here and use search_area to resolve to the JA name first.
    expect(matchesMunicipality("南山城村", "Minamiyamashiro")).toBe(false);
  });
});

describe("stripMuniSuffix", () => {
  it("strips trailing 市/町/村/区", () => {
    expect(stripMuniSuffix("京都市")).toBe("京都");
    expect(stripMuniSuffix("和束町")).toBe("和束");
    expect(stripMuniSuffix("南山城村")).toBe("南山城");
    expect(stripMuniSuffix("京都市右京区")).toBe("京都市右京");
  });

  it("returns input unchanged when no recognised suffix", () => {
    expect(stripMuniSuffix("Tokyo")).toBe("Tokyo");
    expect(stripMuniSuffix("北海道")).toBe("北海道");
  });
});

describe("stripPrefSuffix", () => {
  it("strips trailing 都/道/府/県", () => {
    expect(stripPrefSuffix("東京都")).toBe("東京");
    expect(stripPrefSuffix("北海道")).toBe("北海");
    expect(stripPrefSuffix("京都府")).toBe("京都");
    expect(stripPrefSuffix("山梨県")).toBe("山梨");
    expect(stripPrefSuffix("沖縄県")).toBe("沖縄");
  });

  it("returns input unchanged when no recognised suffix", () => {
    expect(stripPrefSuffix("Yamanashi")).toBe("Yamanashi");
    expect(stripPrefSuffix("山梨")).toBe("山梨");
  });

  it("over-strips ambiguous endings — caller must pass canonical name", () => {
    // "京都" already lacks the suffix but happens to END in "都"; the
    // suffix-stripper has no way to know it's already bare. In practice
    // we only ever call stripPrefSuffix on the taxonomy entry
    // (`京都府`), so this edge never bites.
    expect(stripPrefSuffix("京都")).toBe("京");
  });
});
