import { describe, it, expect } from "vitest";
import { shouldDropSeed } from "../../scrapers/lib/seed_filter.js";

describe("shouldDropSeed", () => {
  it("drops shared prefecture-wide portals by discovery source", () => {
    expect(shouldDropSeed("https://www.visit-hokkaido.jp/#122", "prefecture_portal")).toBe(true);
    expect(shouldDropSeed("https://www.my-kagawa.jp/course/list", "prefecture_portal")).toBe(true);
    expect(shouldDropSeed("https://maruchiba.jp/", "prefecture_portal")).toBe(true);
  });

  it("drops framework / standards / CDN hosts by domain", () => {
    expect(shouldDropSeed("https://www.drupal.org/ja/docs/", "city_hall_outbound")).toBe(true);
    expect(shouldDropSeed("https://schema.org/LocalBusiness", "city_hall_kanko")).toBe(true);
    expect(shouldDropSeed("https://ajax.googleapis.com/x.js", undefined)).toBe(true);
  });

  it("keeps real municipality-specific tourism sites", () => {
    expect(shouldDropSeed("http://www.furanotourism.com/jp/", "city_hall_outbound")).toBe(false);
    expect(shouldDropSeed("https://kimobetsu-kankou.com/", "city_hall_outbound")).toBe(false);
    expect(shouldDropSeed("https://www.ataminews.gr.jp/", "city_hall_outbound")).toBe(false);
  });

  it("keeps small operators on site builders (wixsite/jimdo are legitimate)", () => {
    expect(shouldDropSeed("https://sumita-kankou.wixsite.com/sumita", "city_hall_outbound")).toBe(false);
    expect(shouldDropSeed("https://example-town.jimdofree.com/", "city_hall_kanko")).toBe(false);
  });

  it("drops unparseable URLs", () => {
    expect(shouldDropSeed("not a url", undefined)).toBe(true);
  });
});
