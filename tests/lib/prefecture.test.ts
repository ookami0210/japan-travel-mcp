import { describe, it, expect } from "vitest";
import {
  PREF_NAME_TO_CODE,
  PREF_CODE_TO_NAME,
  WIKIDATA_PREF_CORRECTIONS,
  inferPrefCode,
  applyWikidataPrefCorrections,
  type CorrectablePrefectureFile,
  type CorrectableAttraction,
} from "../../src/lib/prefecture.js";

// ─── Constant invariants ─────────────────────────────────────────────

describe("PREF_NAME_TO_CODE", () => {
  it("contains all 47 prefectures", () => {
    expect(Object.keys(PREF_NAME_TO_CODE)).toHaveLength(47);
  });

  it("uses 2-digit zero-padded JIS codes (01-47)", () => {
    const codes = Object.values(PREF_NAME_TO_CODE);
    for (const c of codes) expect(c).toMatch(/^\d{2}$/);
    const numeric = codes.map(Number).sort((a, b) => a - b);
    expect(numeric[0]).toBe(1);
    expect(numeric[46]).toBe(47);
    // Codes are unique.
    expect(new Set(codes).size).toBe(47);
  });

  it("matches the canonical JIS code anchors", () => {
    expect(PREF_NAME_TO_CODE["北海道"]).toBe("01");
    expect(PREF_NAME_TO_CODE["東京都"]).toBe("13");
    expect(PREF_NAME_TO_CODE["京都府"]).toBe("26");
    expect(PREF_NAME_TO_CODE["大阪府"]).toBe("27");
    expect(PREF_NAME_TO_CODE["沖縄県"]).toBe("47");
  });
});

describe("PREF_CODE_TO_NAME", () => {
  it("is the inverse of PREF_NAME_TO_CODE", () => {
    for (const [name, code] of Object.entries(PREF_NAME_TO_CODE)) {
      expect(PREF_CODE_TO_NAME[code]).toBe(name);
    }
  });

  it("has 47 entries", () => {
    expect(Object.keys(PREF_CODE_TO_NAME)).toHaveLength(47);
  });
});

// ─── inferPrefCode ───────────────────────────────────────────────────

describe("inferPrefCode", () => {
  it("returns null for null / undefined / empty input", () => {
    expect(inferPrefCode(null)).toBeNull();
    expect(inferPrefCode(undefined)).toBeNull();
    expect(inferPrefCode("")).toBeNull();
  });

  it("returns null when no prefecture name is present", () => {
    expect(inferPrefCode("just some text without a prefecture")).toBeNull();
    expect(inferPrefCode("東京 (without 都)")).toBeNull();
  });

  it("matches a prefecture by full Japanese name", () => {
    expect(inferPrefCode("京都府の有名な寺")).toBe("26");
    expect(inferPrefCode("北海道の冬")).toBe("01");
    expect(inferPrefCode("沖縄県の海")).toBe("47");
  });

  it("returns the FIRST match when text mentions multiple prefectures", () => {
    // 北海道 comes before 京都府 in PREF_NAME_TO_CODE iteration order.
    expect(inferPrefCode("北海道と京都府の旅行")).toBe("01");
  });

  it("matches anywhere in the string (no anchor)", () => {
    expect(inferPrefCode("traveling to 東京都 next week")).toBe("13");
  });
});

// ─── WIKIDATA_PREF_CORRECTIONS ───────────────────────────────────────

describe("WIKIDATA_PREF_CORRECTIONS", () => {
  it("uses Q-prefixed QID keys and 2-digit codes", () => {
    for (const [qid, code] of Object.entries(WIKIDATA_PREF_CORRECTIONS)) {
      expect(qid).toMatch(/^Q\d+$/);
      expect(code).toMatch(/^\d{2}$/);
    }
  });

  it("includes the documented Naoshima correction", () => {
    expect(WIKIDATA_PREF_CORRECTIONS.Q11337011).toBe("37");
  });
});

// ─── applyWikidataPrefCorrections ────────────────────────────────────

interface TestAttr extends CorrectableAttraction {
  qid: string;
  prefecture_code: string;
  /** Sentinel field so we can verify the same instance moved across. */
  _tag?: string;
}

function makePrefs(): CorrectablePrefectureFile<TestAttr>[] {
  return [
    {
      prefecture: { code: "33" }, // Okayama (where Q11337011 is mistakenly tagged)
      wikidata_attractions: [
        { qid: "Q11337011", prefecture_code: "33", _tag: "naoshima" },
        { qid: "Q-other-okayama", prefecture_code: "33", _tag: "stays" },
      ],
    },
    {
      prefecture: { code: "37" }, // Kagawa (correct destination)
      wikidata_attractions: [
        { qid: "Q-existing-kagawa", prefecture_code: "37", _tag: "neighbour" },
      ],
    },
  ];
}

describe("applyWikidataPrefCorrections", () => {
  it("moves a corrected entry from the wrong prefecture to the right one", () => {
    const prefs = makePrefs();
    applyWikidataPrefCorrections(prefs);

    const okayama = prefs.find((p) => p.prefecture.code === "33")!;
    const kagawa = prefs.find((p) => p.prefecture.code === "37")!;

    expect(okayama.wikidata_attractions!.map((a) => a.qid)).toEqual([
      "Q-other-okayama",
    ]);
    const moved = kagawa.wikidata_attractions!.find(
      (a) => a.qid === "Q11337011",
    )!;
    expect(moved).toBeDefined();
    expect(moved.prefecture_code).toBe("37");
    expect(moved._tag).toBe("naoshima"); // identity preserved
  });

  it("is a no-op when the QID is not present in any prefecture", () => {
    const prefs: CorrectablePrefectureFile<TestAttr>[] = [
      {
        prefecture: { code: "33" },
        wikidata_attractions: [
          { qid: "Q-something-else", prefecture_code: "33" },
        ],
      },
    ];
    applyWikidataPrefCorrections(prefs);
    expect(prefs[0].wikidata_attractions).toEqual([
      { qid: "Q-something-else", prefecture_code: "33" },
    ]);
  });

  it("drops the moved entry on the floor when the target prefecture is missing", () => {
    // No Kagawa (37) in the input — the correction layer removes the entry
    // from its wrong prefecture but has nowhere to put it.
    const prefs: CorrectablePrefectureFile<TestAttr>[] = [
      {
        prefecture: { code: "33" },
        wikidata_attractions: [
          { qid: "Q11337011", prefecture_code: "33" },
          { qid: "Q-keep", prefecture_code: "33" },
        ],
      },
    ];
    applyWikidataPrefCorrections(prefs);
    expect(prefs[0].wikidata_attractions!.map((a) => a.qid)).toEqual(["Q-keep"]);
  });

  it("creates the target's wikidata_attractions array when previously absent", () => {
    const prefs: CorrectablePrefectureFile<TestAttr>[] = [
      {
        prefecture: { code: "33" },
        wikidata_attractions: [
          { qid: "Q11337011", prefecture_code: "33" },
        ],
      },
      { prefecture: { code: "37" } /* no wikidata_attractions */ },
    ];
    applyWikidataPrefCorrections(prefs);
    expect(prefs[1].wikidata_attractions).toBeDefined();
    expect(prefs[1].wikidata_attractions!).toHaveLength(1);
    expect(prefs[1].wikidata_attractions![0].qid).toBe("Q11337011");
  });

  it("handles an empty input array", () => {
    expect(() => applyWikidataPrefCorrections([])).not.toThrow();
  });
});
