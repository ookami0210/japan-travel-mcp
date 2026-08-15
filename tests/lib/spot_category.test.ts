import { describe, it, expect } from "vitest";
import { classifySpot } from "../../scrapers/lib/spot_category.js";

describe("classifySpot", () => {
  it("classifies common Japanese official-page names", () => {
    expect(classifySpot("出雲大社")).toBe("shrine_temple");
    expect(classifySpot("清水寺")).toBe("shrine_temple");
    expect(classifySpot("松本城")).toBe("castle");
    expect(classifySpot("下呂温泉")).toBe("onsen");
    expect(classifySpot("県立美術館")).toBe("museum_gallery");
    expect(classifySpot("偕楽園")).toBe("park_garden");
    expect(classifySpot("白浜海水浴場")).toBe("beach_coast");
    expect(classifySpot("輪島朝市")).toBe("market_shopping");
    expect(classifySpot("袋田の滝")).toBe("nature");
    expect(classifySpot("阿波おどり")).toBe("festival_event");
    expect(classifySpot("城ヶ崎展望台")).toBe("viewpoint");
    expect(classifySpot("武家屋敷通り")).toBe("historic_site");
  });

  it("name beats description (a shrine mentioning festivals stays a shrine)", () => {
    expect(classifySpot("八坂神社", "祇園祭りで有名")).toBe("shrine_temple");
  });

  it("falls back to description when the name is opaque", () => {
    expect(classifySpot("ふれあいの里", "露天風呂と大浴場を備えた日帰り入浴施設")).toBe("onsen");
  });

  it("returns null when nothing matches (honest null, no guessing)", () => {
    expect(classifySpot("さくらプラザ")).toBeNull();
    expect(classifySpot("")).toBeNull();
    expect(classifySpot(null)).toBeNull();
  });
});
