import { describe, it, expect } from "vitest";
import { isJrPassAccessible, classifyOperator } from "../../src/lib/transit.js";

describe("isJrPassAccessible — by operator name", () => {
  it("JR East 東日本旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "東日本旅客鉄道")).toBe(true);
  });
  it("JR West 西日本旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "西日本旅客鉄道")).toBe(true);
  });
  it("JR Central 東海旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "東海旅客鉄道")).toBe(true);
  });
  it("JR Kyushu 九州旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "九州旅客鉄道")).toBe(true);
  });
  it("JR Hokkaido 北海道旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "北海道旅客鉄道")).toBe(true);
  });
  it("JR Shikoku 四国旅客鉄道 → true", () => {
    expect(isJrPassAccessible(null, "四国旅客鉄道")).toBe(true);
  });
  it("JNR 日本国有鉄道 (legacy) → true", () => {
    expect(isJrPassAccessible(null, "日本国有鉄道")).toBe(true);
  });
  it("JR Freight 日本貨物鉄道 → false (no passengers)", () => {
    expect(isJrPassAccessible(null, "日本貨物鉄道")).toBe(false);
  });

  it("private railway 東武鉄道 → false", () => {
    expect(isJrPassAccessible(null, "東武鉄道")).toBe(false);
  });
  it("private railway 京阪電気鉄道 → false", () => {
    expect(isJrPassAccessible(null, "京阪電気鉄道")).toBe(false);
  });
  it("subway 東京地下鉄 → false", () => {
    expect(isJrPassAccessible(null, "東京地下鉄")).toBe(false);
  });
  it("municipal 東京都交通局 → false", () => {
    expect(isJrPassAccessible(null, "東京都交通局")).toBe(false);
  });
});

describe("isJrPassAccessible — by operator QID", () => {
  it("Q499071 (JR East) → true", () => {
    expect(isJrPassAccessible("Q499071", null)).toBe(true);
  });
  it("Q325098 (JR West) → true", () => {
    expect(isJrPassAccessible("Q325098", null)).toBe(true);
  });
  it("Q139936 (JR Freight) → false", () => {
    expect(isJrPassAccessible("Q139936", null)).toBe(false);
  });
  it("Q1321914 (Tobu) → false", () => {
    expect(isJrPassAccessible("Q1321914", null)).toBe(false);
  });
  it("null inputs → false", () => {
    expect(isJrPassAccessible(null, null)).toBe(false);
    expect(isJrPassAccessible(undefined, undefined)).toBe(false);
  });
});

describe("classifyOperator", () => {
  it("JR East → jr", () => {
    expect(classifyOperator(null, "東日本旅客鉄道")).toBe("jr");
  });
  it("Tokyo Metro 東京地下鉄 → public", () => {
    expect(classifyOperator(null, "東京地下鉄")).toBe("public");
  });
  it("Toei 東京都交通局 → public", () => {
    expect(classifyOperator(null, "東京都交通局")).toBe("public");
  });
  it("Tobu 東武鉄道 → private", () => {
    expect(classifyOperator(null, "東武鉄道")).toBe("private");
  });
  it("Keisei 京成電鉄 → private", () => {
    expect(classifyOperator(null, "京成電鉄")).toBe("private");
  });
  it("null inputs → unknown", () => {
    expect(classifyOperator(null, null)).toBe("unknown");
  });
});
