/**
 * Identity across sources (scrapers/lib/campground_identity.ts).
 *
 * Every case here is a failure this module was written to stop. They are kept
 * as tests because each one produced a plausible-looking number before it was
 * caught: the NFD comparison made a directory look 95% new, the generic-name
 * matches made it look almost entirely held.
 */

import { describe, expect, it } from "vitest";
import {
  buildIdentityIndex,
  facilityNameCore,
  isGenericName,
  matchHeld,
  normalizeFacilityName,
  operatorDomain,
  possibleDuplicates,
  type HeldRecord,
} from "../../scrapers/lib/campground_identity.js";

const held: HeldRecord[] = [
  { source_ref: "osm:node/1", name: "城峯公園キャンプ場", name_en: null, website: null, prefecture_code: "11" },
  { source_ref: "osm:node/2", name: "うさぎの森オートキャンプ場", name_en: null, website: null, prefecture_code: "07" },
  { source_ref: "osm:node/3", name: "キャンプ場", name_en: null, website: null, prefecture_code: "20" },
  { source_ref: "osm:node/4", name: "オートキャンプ", name_en: null, website: null, prefecture_code: "20" },
  { source_ref: "osm:node/5", name: "レスパール藤ヶ鳴", name_en: null, website: "https://resparle.jp/", prefecture_code: "03" },
  { source_ref: "osm:node/6", name: "A", name_en: null, website: "https://www.qkamura.or.jp/miyako/", prefecture_code: "03" },
  { source_ref: "osm:node/7", name: "B", name_en: null, website: "https://www.qkamura.or.jp/other/", prefecture_code: "03" },
];
const index = buildIdentityIndex(held);

describe("normalizeFacilityName", () => {
  it("reads decomposed kana as the same name as composed kana", () => {
    // The directory served NFD: プ as フ + ゚. Comparing that to our NFC name
    // matched nothing, which made the whole inventory look missing.
    const nfd = "城峯公園キャンプ場";
    expect(normalizeFacilityName(nfd)).toBe(normalizeFacilityName("城峯公園キャンプ場"));
  });

  it("ignores the punctuation and width the two sides disagree on", () => {
    expect(normalizeFacilityName("ビオトピア　オートキャンプ")).toBe(
      normalizeFacilityName("ビオトピア オートキャンプ"),
    );
    expect(normalizeFacilityName("ＡＣＮあぶくま")).toBe(normalizeFacilityName("ACNあぶくま"));
  });
});

describe("facilityNameCore and isGenericName", () => {
  it("keeps what identifies the place and drops what it is", () => {
    expect(facilityNameCore("城峯公園キャンプ場")).toBe("城峯公園");
    expect(facilityNameCore("うさぎの森オートキャンプ場")).toBe("うさぎの森");
  });

  it("calls a name that is only generic words generic", () => {
    for (const n of ["キャンプ場", "オートキャンプ", "キャンプサイト", "野営場", "camping", "RVパーク"]) {
      expect(isGenericName(n), `"${n}" should be generic`).toBe(true);
    }
    expect(isGenericName("戸隠キャンプ場")).toBe(false);
  });
});

describe("operatorDomain", () => {
  it("is the operator's own host", () => {
    expect(operatorDomain("https://www.camp-kurumi.com/")).toBe("camp-kurumi.com");
  });

  it("is empty for a host that covers many places", () => {
    for (const u of [
      "https://www.facebook.com/somecamp",
      "https://www.instagram.com/somecamp",
      "https://www.nap-camp.com/nagasaki/12127",
      "https://sites.google.com/view/x",
      "https://www.qkamura.or.jp/miyako/",
    ]) {
      expect(operatorDomain(u), `${u} should not identify an operator`).toBe("");
    }
  });
});

describe("matchHeld", () => {
  it("matches on a domain that exactly one held row uses", () => {
    const got = matchHeld({ name: "藤ヶ鳴キャンプ場", website: "https://resparle.jp/camp", prefecture_code: "03" }, index);
    expect(got).toEqual({ source_ref: "osm:node/5", how: "operator domain" });
  });

  it("matches the same name in the same prefecture", () => {
    expect(matchHeld({ name: "城峯公園キャンプ場", website: null, prefecture_code: "11" }, index)?.how)
      .toBe("name in prefecture");
  });

  it("matches on the name core, which is how a prefix hid a duplicate", () => {
    // The directory calls it 会津山村道場 うさぎの森オートキャンプ場.
    expect(
      matchHeld({ name: "会津山村道場 うさぎの森オートキャンプ場", website: null, prefecture_code: "07" }, index),
    ).toBeNull();
    // Core equality is what catches the plain form.
    expect(matchHeld({ name: "うさぎの森キャンプ場", website: null, prefecture_code: "07" }, index)?.how)
      .toBe("name core in prefecture");
  });

  it("never matches a row whose whole name is a generic word", () => {
    // This is the failure that made 22 unrelated facilities look held.
    for (const name of ["ペンギン村オートキャンプ場", "戸隠キャンプ場", "蛙の駅キャンプ場"]) {
      expect(matchHeld({ name, website: null, prefecture_code: "20" }, index), name).toBeNull();
    }
  });

  it("does not match across prefectures", () => {
    expect(matchHeld({ name: "城峯公園キャンプ場", website: null, prefecture_code: "20" }, index)).toBeNull();
  });

  it("says nothing when it knows nothing", () => {
    expect(matchHeld({ name: null, website: null, prefecture_code: "11" }, index)).toBeNull();
    expect(matchHeld({ name: "新しいキャンプ場", website: null, prefecture_code: null }, index)).toBeNull();
  });
});

describe("possibleDuplicates", () => {
  it("offers a prefix-different row as a candidate, not a match", () => {
    const got = possibleDuplicates(
      { name: "会津山村道場 うさぎの森オートキャンプ場", website: null, prefecture_code: "07" },
      held,
    );
    expect(got).toHaveLength(1);
    expect(got[0].source_ref).toBe("osm:node/2");
    // The point of the function: it is a question for a person, not a merge.
    expect(got[0].how).toMatch(/contains/);
  });

  it("never offers a generic row as a candidate", () => {
    // The failure this prevents: 22 unrelated facilities "matching" オートキャンプ.
    expect(
      possibleDuplicates({ name: "ペンギン村オートキャンプ場", website: null, prefecture_code: "20" }, held),
    ).toEqual([]);
  });

  it("stays inside the prefecture", () => {
    expect(
      possibleDuplicates({ name: "会津山村道場 うさぎの森オートキャンプ場", website: null, prefecture_code: "20" }, held),
    ).toEqual([]);
  });

  it("does not repeat a row an exact core already matched", () => {
    expect(possibleDuplicates({ name: "うさぎの森キャンプ場", website: null, prefecture_code: "07" }, held)).toEqual([]);
  });
});
