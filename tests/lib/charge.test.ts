import { describe, it, expect } from "vitest";
import { parseCharge } from "../../scrapers/lib/charge.js";

describe("parseCharge", () => {
  it("parses '300 JPY'", () => {
    expect(parseCharge("300 JPY")).toEqual({ amount: 300, currency: "JPY" });
  });

  it("parses '300JPY' without a space", () => {
    expect(parseCharge("300JPY")).toEqual({ amount: 300, currency: "JPY" });
  });

  it("parses yen-symbol forms", () => {
    expect(parseCharge("¥500")).toEqual({ amount: 500, currency: "JPY" });
    expect(parseCharge("500 ¥")).toEqual({ amount: 500, currency: "JPY" });
    expect(parseCharge("500円")).toEqual({ amount: 500, currency: "JPY" });
  });

  it("keeps a per-unit qualifier", () => {
    expect(parseCharge("300 JPY/person")).toEqual({
      amount: 300,
      currency: "JPY",
      per: "person",
    });
  });

  it("refuses tiered lists rather than picking a tier (honest)", () => {
    expect(parseCharge("730 JPY/adult;0 JPY/child")).toBeNull();
    expect(parseCharge("520 JPY;310 JPY;200 JPY")).toBeNull();
    expect(parseCharge("2180 ¥;1440 ¥; 710 ¥")).toBeNull();
  });

  it("refuses non-numeric or foreign-currency strings", () => {
    expect(parseCharge("free")).toBeNull();
    expect(parseCharge("10 USD")).toBeNull();
    expect(parseCharge("")).toBeNull();
  });
});
