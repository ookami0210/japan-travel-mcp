import { describe, it, expect } from "vitest";
import {
  mergePrefectureFile,
  blockRecency,
  stampAreaIds,
  type PrefFileMuniBlock,
  type PrefFileShape,
} from "../../scrapers/lib/pref_file.js";

function block(
  code: string,
  scrapedAt: string,
  spotIds: string[] = ["a"],
): PrefFileMuniBlock {
  return {
    municipality: { code, name: `muni-${code}` },
    spots: spotIds.map((id) => ({ id, last_scraped_at: scrapedAt })),
  };
}

describe("mergePrefectureFile", () => {
  it("preserves every existing top-level field (wikidata_attractions etc.)", () => {
    const existing: PrefFileShape = {
      prefecture: { code: "27", name: "大阪府", name_en: "osaka" },
      data_as_of: "2026-05-01T00:00:00Z",
      municipalities: [block("27100", "2026-05-01T00:00:00Z")],
      wikidata_attractions: [{ qid: "Q1" }, { qid: "Q2" }],
      custom_future_field: { keep: true },
    };
    const merged = mergePrefectureFile(existing, {
      prefCode: "27",
      prefName: "大阪府",
      slug: "osaka",
      results: [block("27102", "2026-08-14T00:00:00Z")],
    });
    expect(merged.wikidata_attractions).toEqual([{ qid: "Q1" }, { qid: "Q2" }]);
    expect(merged.custom_future_field).toEqual({ keep: true });
    expect(merged.municipalities?.map((m) => m.municipality.code)).toEqual([
      "27100",
      "27102",
    ]);
  });

  it("keeps municipality blocks not scraped tonight (no more collapse)", () => {
    const existing: PrefFileShape = {
      prefecture: { code: "34", name: "広島県", name_en: "hiroshima" },
      municipalities: [
        block("34100", "2026-04-26T00:00:00Z"),
        block("34202", "2026-04-26T00:00:00Z"),
      ],
    };
    const merged = mergePrefectureFile(existing, {
      prefCode: "34",
      prefName: "広島県",
      slug: "hiroshima",
      results: [block("34100", "2026-08-14T00:00:00Z", ["fresh"])],
    });
    const codes = merged.municipalities?.map((m) => m.municipality.code);
    expect(codes).toEqual(["34100", "34202"]); // 34202 survived
    expect(merged.municipalities?.[0].spots?.[0].id).toBe("fresh"); // 34100 updated
  });

  it("newest-wins: replaying an OLD block never clobbers a newer one", () => {
    const existing: PrefFileShape = {
      prefecture: { code: "13", name: "東京都", name_en: "tokyo" },
      municipalities: [block("13101", "2026-08-14T00:00:00Z", ["new"])],
    };
    const merged = mergePrefectureFile(existing, {
      prefCode: "13",
      prefName: "東京都",
      slug: "tokyo",
      results: [block("13101", "2026-05-01T00:00:00Z", ["old"])],
    });
    expect(merged.municipalities?.[0].spots?.[0].id).toBe("new");
  });

  it("stamps area_id on incoming spots", () => {
    const merged = mergePrefectureFile(null, {
      prefCode: "27",
      prefName: "大阪府",
      slug: "osaka",
      results: [block("27100", "2026-08-14T00:00:00Z", ["s1", "s2"])],
    });
    for (const s of merged.municipalities?.[0].spots ?? []) {
      expect(s.area_id).toBe("27100");
    }
  });

  it("works from scratch (no existing file)", () => {
    const merged = mergePrefectureFile(null, {
      prefCode: "31",
      prefName: "鳥取県",
      slug: "tottori",
      results: [block("31201", "2026-08-14T00:00:00Z")],
    });
    expect(merged.prefecture?.code).toBe("31");
    expect(merged.municipalities).toHaveLength(1);
    expect(typeof merged.disclaimer).toBe("string");
  });
});

describe("helpers", () => {
  it("blockRecency picks the newest spot timestamp", () => {
    const b = block("01100", "2026-01-01T00:00:00Z");
    b.spots!.push({ id: "z", last_scraped_at: "2026-06-01T00:00:00Z" });
    expect(blockRecency(b)).toBe("2026-06-01T00:00:00Z");
  });

  it("stampAreaIds never overwrites an existing area_id", () => {
    const b = block("27100", "2026-08-14T00:00:00Z");
    b.spots![0].area_id = "27999";
    stampAreaIds(b);
    expect(b.spots![0].area_id).toBe("27999");
  });
});
