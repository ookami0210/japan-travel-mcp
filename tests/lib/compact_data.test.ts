import { describe, it, expect } from "vitest";
import { compactPrefectureFile } from "../../src/lib/compact_data.js";

function sampleFile() {
  return {
    prefecture: { code: "34", name: "広島県", name_en: "hiroshima" },
    data_as_of: "2026-08-01T00:00:00Z",
    municipalities: [
      {
        municipality: { code: "34100", name: "広島市" },
        errors: [{ url: "https://example.com/x", reason: "timeout" }],
        spots: [
          {
            id: "s1",
            name: "原爆ドーム",
            description: "desc",
            body_paragraphs: ["p1", "p2"],
            images: ["https://a/1.jpg", "https://a/2.jpg", "https://a/3.jpg"],
          },
          { id: "s2", name: "縮景園", images: ["https://b/1.jpg"] },
          { id: "s3", name: "画像なし" },
        ],
      },
    ],
  };
}

describe("compactPrefectureFile", () => {
  it("drops municipality scrape errors entirely", () => {
    const f = sampleFile();
    compactPrefectureFile(f);
    expect("errors" in f.municipalities[0]).toBe(false);
  });

  it("truncates spot images to the first URL (presence bit preserved)", () => {
    const f = sampleFile();
    compactPrefectureFile(f);
    const spots = f.municipalities[0].spots;
    expect(spots[0].images).toEqual(["https://a/1.jpg"]);
    expect(spots[1].images).toEqual(["https://b/1.jpg"]); // single stays
    expect(spots[2].images).toBeUndefined(); // absent stays absent
  });

  it("keeps search-relevant fields untouched", () => {
    const f = sampleFile();
    compactPrefectureFile(f);
    const s = f.municipalities[0].spots[0];
    expect(s.name).toBe("原爆ドーム");
    expect(s.description).toBe("desc");
    expect(s.body_paragraphs).toEqual(["p1", "p2"]);
  });

  it("is safe on malformed shapes (missing fields, nulls)", () => {
    expect(() => compactPrefectureFile({} as never)).not.toThrow();
    expect(() =>
      compactPrefectureFile({ municipalities: [null, { spots: null }, { spots: [null] }] } as never),
    ).not.toThrow();
  });
});
