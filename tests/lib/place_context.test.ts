/**
 * What a coordinate alone can say about a campground
 * (scrapers/lib/place_context.ts).
 */

import { describe, expect, it } from "vitest";
import {
  nearest,
  nearestFew,
  nearestPark,
  osmFacilityFacts,
  type NamedPlace,
} from "../../scrapers/lib/place_context.js";

/** A campground in the Iya valley, and places at known distances from it. */
const CAMP = { lat: 33.9359593, lng: 133.6812294 };

function place(name: string, lat: number, lng: number, qid?: string): NamedPlace {
  return { name_ja: name, name_en: null, coordinates: { lat, lng }, qid: qid ?? null };
}

describe("nearest", () => {
  const stations = [
    place("小歩危駅", 33.9808, 133.6433, "Q900985"),
    place("阿波池田駅", 34.0219, 133.8019),
    place("高知駅", 33.5675, 133.5497),
  ];

  it("picks the closest and reports the straight-line distance", () => {
    const got = nearest(CAMP, stations)!;
    expect(got.name_ja).toBe("小歩危駅");
    expect(got.qid).toBe("Q900985");
    // ~6.1 km for the coordinates in this fixture, rounded to 100 m so the
    // field never pretends to metre precision.
    expect(got.straight_line_m).toBeGreaterThan(5_500);
    expect(got.straight_line_m).toBeLessThan(6_500);
    expect(got.straight_line_m % 100).toBe(0);
  });

  it("says nothing rather than something useless past the cap", () => {
    expect(nearest(CAMP, stations, 1_000)).toBeNull();
  });

  it("is null for an empty world", () => {
    expect(nearest(CAMP, [])).toBeNull();
  });
});

describe("nearestFew", () => {
  const spots = [
    place("遠い神社", 34.2, 133.9),
    place("近い神社", 33.94, 133.69),
    place("中くらいの滝", 33.96, 133.70),
  ];

  it("returns the closest few, nearest first", () => {
    const got = nearestFew(CAMP, spots, 2);
    expect(got.map((g) => g.name_ja)).toEqual(["近い神社", "中くらいの滝"]);
    expect(got[0].straight_line_m).toBeLessThan(got[1].straight_line_m);
  });

  it("honours the cap and the count", () => {
    expect(nearestFew(CAMP, spots, 5, 3_000)).toHaveLength(1);
    expect(nearestFew(CAMP, spots, 1)).toHaveLength(1);
  });

  it("is an empty list, not null, when nothing is near", () => {
    expect(nearestFew(CAMP, spots, 3, 10)).toEqual([]);
  });
});

describe("nearestPark", () => {
  const parks = [
    {
      ...place("剣山国定公園", 33.85, 134.09, "Q1072878"),
      park_kind: "quasi_national_park",
      area_km2: 209.61,
    },
    { ...place("瀬戸内海国立公園", 34.35, 133.9), park_kind: "national_park", area_km2: 669.34 },
  ];

  it("hands back the park's own size so the reader can judge containment", () => {
    const got = nearestPark(CAMP, parks, 60_000)!;
    expect(got.name_ja).toBe("剣山国定公園");
    expect(got.park_kind).toBe("quasi_national_park");
    expect(got.park_area_km2).toBe(209.61);
    // The field is a distance from the park's recorded point — never a claim
    // that the campground is inside it.
    expect(got).not.toHaveProperty("inside");
  });

  it("withholds a park too far away to be context", () => {
    expect(nearestPark(CAMP, parks, 5_000)).toBeNull();
  });
});

describe("osmFacilityFacts", () => {
  it("keeps the tags a camper books on, exactly as tagged", () => {
    const got = osmFacilityFacts({
      fee: "yes",
      "capacity:tents": "30",
      toilets: "yes",
      drinking_water: "yes",
      power_supply: "no",
      opening_hours: "Apr-Nov",
      operator: "三好市",
      tourism: "camp_site",
      name: "塩塚高原キャンプ場",
    });
    expect(got).toEqual({
      fee: "yes",
      capacity_tents: "30",
      toilets: "yes",
      drinking_water: "yes",
      power_supply: "no",
      opening_hours: "Apr-Nov",
      operator: "三好市",
    });
  });

  it("does not interpret — fee=no stays no, not 'free'", () => {
    expect(osmFacilityFacts({ fee: "no" }).fee).toBe("no");
  });

  it("assembles an address from addr:* parts in Japanese order", () => {
    expect(
      osmFacilityFacts({
        "addr:province": "徳島県",
        "addr:city": "三好市",
        "addr:street": "山城町平野",
        "addr:housenumber": "205",
      }).address,
    ).toBe("徳島県三好市山城町平野205");
  });

  it("prefers addr:full when the contributor wrote one", () => {
    expect(
      osmFacilityFacts({ "addr:full": "徳島県三好市山城町平野205", "addr:city": "三好市" }).address,
    ).toBe("徳島県三好市山城町平野205");
  });

  it("is empty for a campground OSM says nothing about", () => {
    expect(osmFacilityFacts({ tourism: "camp_site" })).toEqual({});
    expect(osmFacilityFacts(null)).toEqual({});
  });

  it("ignores a tag present but blank", () => {
    expect(osmFacilityFacts({ fee: "   ", toilets: "yes" })).toEqual({ toilets: "yes" });
  });
});
