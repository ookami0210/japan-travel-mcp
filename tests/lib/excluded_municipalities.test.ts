import { describe, it, expect } from "vitest";
import {
  EXCLUDED_MUNICIPALITY_CODES,
  isExcludedMunicipality,
} from "../../scrapers/lib/excluded_municipalities.js";

describe("excluded municipalities", () => {
  it("excludes the six Nemuro Subprefecture disputed-islands villages", () => {
    for (const code of ["016951", "016969", "016977", "016985", "016993", "017001"]) {
      expect(isExcludedMunicipality(code)).toBe(true);
    }
    expect(EXCLUDED_MUNICIPALITY_CODES.size).toBe(6);
  });

  it("does not exclude ordinary municipality codes", () => {
    expect(isExcludedMunicipality("104493")).toBe(false); // みなかみ町
    expect(isExcludedMunicipality("011002")).toBe(false); // 札幌市
  });
});
