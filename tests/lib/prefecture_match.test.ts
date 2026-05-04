import { describe, it, expect, beforeAll } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  matchPrefecturesSync,
  matchPrefecturesByMunicipalitiesSync,
  extractPrefectureCodes,
} from "../../scrapers/lib/prefecture_match.js";

interface PrefectureRow {
  code: string;
  name_ja: string;
  name_en: string;
}

interface MunicipalityRow {
  code: string;
  prefecture_code: string;
  prefecture_name: string;
  name: string;
}

let prefs: PrefectureRow[];
let munis: MunicipalityRow[];

beforeAll(async () => {
  const prefsPath = fileURLToPath(
    new URL("../fixtures/prefectures.json", import.meta.url),
  );
  const munisPath = fileURLToPath(
    new URL("../fixtures/municipalities.json", import.meta.url),
  );
  const [prefsRaw, munisRaw] = await Promise.all([
    readFile(prefsPath, "utf8"),
    readFile(munisPath, "utf8"),
  ]);
  prefs = (JSON.parse(prefsRaw) as { prefectures: PrefectureRow[] }).prefectures;
  munis = (JSON.parse(munisRaw) as { municipalities: MunicipalityRow[] })
    .municipalities;
});

describe("matchPrefecturesSync", () => {
  it("returns empty for empty input", () => {
    expect(matchPrefecturesSync("", prefs)).toEqual([]);
  });

  it("matches the explicit prefecture suffix (青森県)", () => {
    expect(matchPrefecturesSync("青森県の特産品", prefs)).toEqual(["02"]);
  });

  it("matches the bare ○○ stem when the official form ends in 県", () => {
    expect(matchPrefecturesSync("青森のりんご", prefs)).toEqual(["02"]);
  });

  it("does NOT add bare stem for 京都府 (would over-match in 東京都)", () => {
    // 京都 occurs only inside 東京都 — but 京都府 itself is NOT in the text.
    // Expected: only Tokyo (13), NOT Kyoto (26).
    const got = matchPrefecturesSync("東京都の桜", prefs);
    expect(got).toEqual(["13"]);
    expect(got).not.toContain("26");
  });

  it("handles 北海道 as a single token (no bare stem)", () => {
    expect(matchPrefecturesSync("北海道の自然", prefs)).toEqual(["01"]);
  });

  it("returns codes ordered by first occurrence in text", () => {
    expect(matchPrefecturesSync("京都府と大阪府を旅する", prefs)).toEqual([
      "26",
      "27",
    ]);
    expect(matchPrefecturesSync("大阪府と京都府を旅する", prefs)).toEqual([
      "27",
      "26",
    ]);
  });

  it("deduplicates when a prefecture is mentioned multiple times", () => {
    expect(matchPrefecturesSync("京都府の話、また京都府の話", prefs)).toEqual([
      "26",
    ]);
  });
});

describe("matchPrefecturesByMunicipalitiesSync", () => {
  it("returns empty for empty input", () => {
    expect(matchPrefecturesByMunicipalitiesSync("", munis)).toEqual([]);
  });

  it("returns multiple prefecture codes for ambiguous municipality (府中市)", () => {
    const got = matchPrefecturesByMunicipalitiesSync("府中市の名所", munis);
    // 府中市 exists in both Tokyo (13) and Hiroshima (34)
    expect(got).toContain("13");
    expect(got).toContain("34");
  });

  it("prefers the longest municipality form (西置賜郡白鷹町 over 白鷹町)", () => {
    expect(
      matchPrefecturesByMunicipalitiesSync("西置賜郡白鷹町", munis),
    ).toEqual(["06"]);
  });
});

describe("extractPrefectureCodes (combined)", () => {
  it("uses prefecture-name match when available, ignoring municipality ambiguity", () => {
    // 日野町 exists in Tottori (31) AND Shiga (25).
    // The text explicitly says 滋賀県 — only [25] should be returned,
    // dropping the Tottori false positive.
    expect(extractPrefectureCodes("滋賀県蒲生郡日野町", prefs, munis)).toEqual([
      "25",
    ]);
  });

  it("falls back to municipality match when no prefecture name in text", () => {
    const got = extractPrefectureCodes("府中市", prefs, munis);
    // Both Tokyo and Hiroshima possible
    expect(new Set(got)).toEqual(new Set(["13", "34"]));
  });

  it("returns empty when the text contains neither prefecture nor known municipality", () => {
    expect(extractPrefectureCodes("xxxxxxxx", prefs, munis)).toEqual([]);
  });
});
