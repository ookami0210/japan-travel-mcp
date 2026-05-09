import { describe, it, expect } from "vitest";
import {
  enrichKindsDefaults,
  passesPriceBandCap,
  passesIndoorFilter,
} from "../../src/lib/kinds_defaults.js";

describe("enrichKindsDefaults — empty input", () => {
  it("returns no_signal when kinds is empty", () => {
    const r = enrichKindsDefaults([]);
    expect(r).toEqual({
      typical_visit_minutes: null,
      price_band: null,
      suitable_for: null,
      indoor_capable: null,
      source: "no_signal",
    });
  });

  it("returns no_signal even when osmFee is provided but kinds is empty", () => {
    const r = enrichKindsDefaults([], "yes");
    expect(r.source).toBe("no_signal");
    expect(r.price_band).toBeNull();
  });
});

describe("enrichKindsDefaults — single kind lookup", () => {
  it("returns the table values for a known kind", () => {
    const r = enrichKindsDefaults(["museum"]);
    expect(r.typical_visit_minutes).toBe(120);
    expect(r.price_band).toBe("low");
    expect(r.suitable_for).toEqual(
      expect.arrayContaining(["family", "couple", "solo", "group"]),
    );
    expect(r.source).toBe("kinds_default");
  });

  it("expands suitable_for 'all' to the four party tags", () => {
    const r = enrichKindsDefaults(["buddhist_temple"]);
    expect(r.suitable_for).toEqual(
      expect.arrayContaining(["family", "couple", "solo", "group"]),
    );
    expect(r.suitable_for).toHaveLength(4);
  });

  it("returns nulls for unknown kinds (no minutes/price/suitable in table)", () => {
    const r = enrichKindsDefaults(["something_completely_unknown"]);
    expect(r.typical_visit_minutes).toBeNull();
    expect(r.price_band).toBeNull();
    expect(r.suitable_for).toBeNull();
    expect(r.source).toBe("kinds_default");
  });

  it("kinds with minutes 0 (airport) propagates correctly", () => {
    const r = enrichKindsDefaults(["airport"]);
    expect(r.typical_visit_minutes).toBe(0);
    expect(r.price_band).toBe("free");
  });
});

describe("enrichKindsDefaults — multi-kind aggregation", () => {
  it("picks the maximum minutes across kinds", () => {
    // monument=20, sacred_mountain=240 → max 240
    const r = enrichKindsDefaults(["monument", "sacred_mountain"]);
    expect(r.typical_visit_minutes).toBe(240);
  });

  it("picks the highest price tier (castle in preservation district keeps 'low')", () => {
    // preservation_district=free, castle=low → max=low
    const r = enrichKindsDefaults(["preservation_district", "castle"]);
    expect(r.price_band).toBe("low");
  });

  it("picks the highest tier across many bands", () => {
    // park=free, garden=low, onsen_resort=mid, ski_resort=high
    const r = enrichKindsDefaults([
      "park",
      "garden",
      "onsen_resort",
      "ski_resort",
    ]);
    expect(r.price_band).toBe("high");
  });

  it("computes the union of suitable_for tags (and dedups)", () => {
    // pilgrimage_site=[solo,group], theater=[couple,group]
    const r = enrichKindsDefaults(["pilgrimage_site", "theater"]);
    expect(r.suitable_for).toEqual(
      expect.arrayContaining(["solo", "group", "couple"]),
    );
    expect(r.suitable_for).toHaveLength(3);
  });

  it("'all' expansion unions correctly with explicit lists", () => {
    // garden=[all], theater=[couple,group] → union = all party tags
    const r = enrichKindsDefaults(["garden", "theater"]);
    expect(r.suitable_for).toEqual(
      expect.arrayContaining(["family", "couple", "solo", "group"]),
    );
    expect(r.suitable_for).toHaveLength(4);
  });
});

describe("enrichKindsDefaults — osmFee overrides", () => {
  it("'no' forces price_band to free and source to osm_override", () => {
    const r = enrichKindsDefaults(["onsen_resort"], "no");
    expect(r.price_band).toBe("free");
    expect(r.source).toBe("osm_override");
    // minutes still come from the kinds default
    expect(r.typical_visit_minutes).toBe(180);
  });

  it("'donation' forces price_band to free", () => {
    const r = enrichKindsDefaults(["castle"], "donation");
    expect(r.price_band).toBe("free");
    expect(r.source).toBe("osm_override");
  });

  it("'yes' lifts a free band up to low", () => {
    const r = enrichKindsDefaults(["buddhist_temple"], "yes");
    expect(r.price_band).toBe("low");
    expect(r.source).toBe("osm_override");
  });

  it("'yes' lifts a null band up to low", () => {
    const r = enrichKindsDefaults(["unknown_kind"], "yes");
    expect(r.price_band).toBe("low");
    expect(r.source).toBe("osm_override");
  });

  it("'yes' does NOT downgrade an existing higher band", () => {
    const r = enrichKindsDefaults(["ski_resort"], "yes");
    expect(r.price_band).toBe("high");
    expect(r.source).toBe("osm_override");
  });

  it("falsy osmFee leaves source as kinds_default", () => {
    const r = enrichKindsDefaults(["museum"], null);
    expect(r.source).toBe("kinds_default");
    const r2 = enrichKindsDefaults(["museum"], undefined);
    expect(r2.source).toBe("kinds_default");
    const r3 = enrichKindsDefaults(["museum"], "");
    expect(r3.source).toBe("kinds_default");
  });

  it("unrecognised osmFee value still flips source but does not change price", () => {
    const r = enrichKindsDefaults(["museum"], "weird");
    expect(r.source).toBe("osm_override");
    expect(r.price_band).toBe("low"); // unchanged from museum default
  });
});

describe("enrichKindsDefaults — partial information", () => {
  it("a kind with minutes but no price/suitable returns minutes only", () => {
    // 'mountain' has minutes=180, no price_band entry, no suitable_for entry
    const r = enrichKindsDefaults(["mountain"]);
    expect(r.typical_visit_minutes).toBe(180);
    expect(r.price_band).toBeNull();
    expect(r.suitable_for).toBeNull();
  });

  it("ignores unknown kinds when aggregating with known ones", () => {
    const r = enrichKindsDefaults(["unknown_kind", "museum"]);
    expect(r.typical_visit_minutes).toBe(120);
    expect(r.price_band).toBe("low");
  });
});

describe("enrichKindsDefaults — indoor_capable classification", () => {
  it("museum is indoor", () => {
    expect(enrichKindsDefaults(["museum"]).indoor_capable).toBe("indoor");
  });

  it("aquarium is indoor", () => {
    expect(enrichKindsDefaults(["aquarium"]).indoor_capable).toBe("indoor");
  });

  it("waterfall is outdoor", () => {
    expect(enrichKindsDefaults(["waterfall"]).indoor_capable).toBe("outdoor");
  });

  it("national_park is outdoor", () => {
    expect(enrichKindsDefaults(["national_park"]).indoor_capable).toBe("outdoor");
  });

  it("buddhist_temple is mixed (indoor halls + outdoor grounds)", () => {
    expect(enrichKindsDefaults(["buddhist_temple"]).indoor_capable).toBe("mixed");
  });

  it("indoor + outdoor in same record resolves to mixed", () => {
    // museum=indoor, garden=outdoor → mixed
    expect(enrichKindsDefaults(["museum", "garden"]).indoor_capable).toBe("mixed");
  });

  it("unknown kinds yield null indoor_capable", () => {
    expect(enrichKindsDefaults(["unknown_xyz"]).indoor_capable).toBeNull();
  });

  it("unknown + known indoor still resolves to indoor", () => {
    expect(enrichKindsDefaults(["unknown_xyz", "museum"]).indoor_capable).toBe("indoor");
  });
});

describe("passesPriceBandCap", () => {
  it("free cap accepts only free", () => {
    expect(passesPriceBandCap("free", "free")).toBe(true);
    expect(passesPriceBandCap("low", "free")).toBe(false);
    expect(passesPriceBandCap("luxury", "free")).toBe(false);
  });
  it("low cap accepts free and low", () => {
    expect(passesPriceBandCap("free", "low")).toBe(true);
    expect(passesPriceBandCap("low", "low")).toBe(true);
    expect(passesPriceBandCap("mid", "low")).toBe(false);
  });
  it("mid cap accepts free / low / mid", () => {
    expect(passesPriceBandCap("mid", "mid")).toBe(true);
    expect(passesPriceBandCap("high", "mid")).toBe(false);
  });
  it("null record fails strict caps but passes permissive ones", () => {
    expect(passesPriceBandCap(null, "free")).toBe(false);
    expect(passesPriceBandCap(null, "low")).toBe(false);
    expect(passesPriceBandCap(null, "mid")).toBe(true);
    expect(passesPriceBandCap(null, "luxury")).toBe(true);
  });
});

describe("themed kinds (2026-05-09 multi-judge follow-up)", () => {
  it("lavender_field has outdoor + low price defaults", () => {
    const r = enrichKindsDefaults(["lavender_field"]);
    expect(r.indoor_capable).toBe("outdoor");
    expect(r.price_band).toBe("low");
    expect(r.typical_visit_minutes).toBe(90);
  });
  it("kabuki_theater is indoor + high price", () => {
    const r = enrichKindsDefaults(["kabuki_theater"]);
    expect(r.indoor_capable).toBe("indoor");
    expect(r.price_band).toBe("high");
  });
  it("dark_sky is outdoor + free", () => {
    const r = enrichKindsDefaults(["dark_sky"]);
    expect(r.indoor_capable).toBe("outdoor");
    expect(r.price_band).toBe("free");
  });
  it("pilgrimage_route minutes saturate at 480 (multi-day)", () => {
    expect(enrichKindsDefaults(["pilgrimage_route"]).typical_visit_minutes).toBe(480);
  });
  it("chashitsu / tea_ceremony land at indoor + mid", () => {
    expect(enrichKindsDefaults(["chashitsu"]).indoor_capable).toBe("indoor");
    expect(enrichKindsDefaults(["tea_ceremony"]).indoor_capable).toBe("mixed");
    expect(enrichKindsDefaults(["chashitsu"]).price_band).toBe("mid");
  });
});

describe("passesIndoorFilter", () => {
  it("want=indoor accepts indoor + mixed", () => {
    expect(passesIndoorFilter("indoor", "indoor")).toBe(true);
    expect(passesIndoorFilter("mixed", "indoor")).toBe(true);
    expect(passesIndoorFilter("outdoor", "indoor")).toBe(false);
  });
  it("want=outdoor accepts outdoor + mixed", () => {
    expect(passesIndoorFilter("outdoor", "outdoor")).toBe(true);
    expect(passesIndoorFilter("mixed", "outdoor")).toBe(true);
    expect(passesIndoorFilter("indoor", "outdoor")).toBe(false);
  });
  it("null record fails both", () => {
    expect(passesIndoorFilter(null, "indoor")).toBe(false);
    expect(passesIndoorFilter(null, "outdoor")).toBe(false);
  });
});
