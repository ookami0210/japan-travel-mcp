import { describe, it, expect } from "vitest";
import {
  TRAVEL_CONCEPTS,
  extractTravelIntent,
  buildRoutingHint,
  renderQueryIntent,
} from "../../src/lib/intent.js";
import { assertDefined } from "./_helpers.js";

type RenderedConcept = {
  id: string;
  matched_text: string;
  rationale_en: string;
  polarity: "boost" | "demote";
  routing_tool?: string;
  target_kinds?: string[];
  target_heritage_qids?: string[];
};

/** Type-narrowing accessor for renderQueryIntent's `detected_concepts`. */
function detectedFrom(out: Record<string, unknown>): RenderedConcept[] {
  return out.detected_concepts as RenderedConcept[];
}

describe("extractTravelIntent — empty / no-match", () => {
  it("returns empty result for empty query", () => {
    const r = extractTravelIntent("");
    expect(r.concepts).toEqual([]);
    expect(r.recommended_kinds.size).toBe(0);
    expect(r.recommended_heritage_qids.size).toBe(0);
    expect(r.semantic_tags).toEqual([]);
    expect(r.preferred_tool).toBeUndefined();
  });

  it("returns empty result for query that matches no concept", () => {
    const r = extractTravelIntent("just some random sentence about nothing");
    expect(r.concepts).toEqual([]);
    expect(r.preferred_tool).toBeUndefined();
  });
});

describe("extractTravelIntent — single concept", () => {
  it("matches shukubo and aggregates kinds + routing_tool", () => {
    const r = extractTravelIntent("高野山で宿坊に泊まりたい");
    expect(r.concepts).toHaveLength(1);
    expect(r.concepts[0]).toMatchObject({
      id: "shukubo",
      matched_text: "宿坊",
      polarity: "boost",
    });
    expect(r.recommended_kinds).toEqual(
      new Set(["buddhist_temple", "buddhist_monastery", "pilgrimage_site"]),
    );
    expect(r.semantic_tags).toEqual(
      expect.arrayContaining(["temple lodging", "shukubo"]),
    );
    expect(r.preferred_tool).toBe("get_hotels");
  });

  it("matches kominka with target_heritage_qids", () => {
    const r = extractTravelIntent("古民家に泊まる");
    expect(r.concepts[0].id).toBe("kominka");
    expect(r.recommended_heritage_qids.has("Q850649")).toBe(true);
  });

  it("matches English alias 'temple lodging'", () => {
    const r = extractTravelIntent("looking for temple lodging in Koyasan");
    expect(r.concepts.map((c) => c.id)).toContain("shukubo");
  });

  it("matches matsuri and proposes get_events", () => {
    const r = extractTravelIntent("夏祭りを見たい");
    expect(r.concepts[0].id).toBe("matsuri");
    expect(r.preferred_tool).toBe("get_events");
  });
});

describe("extractTravelIntent — multiple concepts & ordering", () => {
  it("captures multiple concepts in declaration order", () => {
    // shukubo is declared before ryokan in TRAVEL_CONCEPTS
    const ids = extractTravelIntent("旅館か宿坊に泊まりたい").concepts.map(
      (c) => c.id,
    );
    expect(ids).toContain("shukubo");
    expect(ids).toContain("ryokan");
    expect(ids.indexOf("shukubo")).toBeLessThan(ids.indexOf("ryokan"));
  });

  it("first preferred_tool wins when multiple concepts have routing_tool", () => {
    // Both shukubo (get_hotels) and matsuri (get_events) match; shukubo
    // is declared first → preferred_tool stays at get_hotels.
    expect(extractTravelIntent("宿坊と祭りに行きたい").preferred_tool).toBe(
      "get_hotels",
    );
  });

  it("aggregates heritage_qids and kinds across concepts", () => {
    const r = extractTravelIntent("武家屋敷と古民家を巡る");
    expect(r.recommended_heritage_qids.has("Q850649")).toBe(true);
    expect(r.recommended_heritage_qids.has("Q1188622")).toBe(true);
    expect(r.recommended_kinds.has("preservation_district")).toBe(true);
  });
});

describe("extractTravelIntent — polarity", () => {
  it("boost is the default polarity", () => {
    expect(extractTravelIntent("旅館").concepts[0].polarity).toBe("boost");
  });

  it("explicit boost on hidden onsen still aggregates kinds", () => {
    const r = extractTravelIntent("秘湯に泊まりたい");
    expect(r.concepts[0]).toMatchObject({
      id: "secret_hidden_onsen",
      polarity: "boost",
    });
    expect(r.recommended_kinds.has("hot_spring")).toBe(true);
  });
});

describe("buildRoutingHint", () => {
  it("returns undefined when current tool already matches preferred_tool", () => {
    const r = extractTravelIntent("宿坊に泊まる");
    expect(buildRoutingHint("get_hotels", r)).toBeUndefined();
  });

  it("returns undefined when no preferred_tool detected", () => {
    const r = extractTravelIntent("just a benign query");
    expect(buildRoutingHint("get_hotels", r)).toBeUndefined();
  });

  it("returns hint with concept arg overrides for shukubo", () => {
    const r = extractTravelIntent("宿坊に泊まりたい");
    const hint = buildRoutingHint("get_spots", r);
    assertDefined(hint);
    expect(hint).toMatchObject({
      suggested_tool: "get_hotels",
      matched_concept: "shukubo",
      matched_text: "宿坊",
      arg_template: { prefecture: "<pref>", hotel_type: "shukubo" },
    });
  });

  it("uses base args when concept-specific overrides are absent", () => {
    // ukiyoe routes to get_traditional_arts and the concept maps keyword:浮世絵
    const r = extractTravelIntent("浮世絵の美術館を見たい");
    const hint = buildRoutingHint("get_spots", r);
    assertDefined(hint);
    expect(hint).toMatchObject({
      suggested_tool: "get_traditional_arts",
      arg_template: { prefecture: "<pref>", keyword: "浮世絵" },
    });
  });

  it("includes both rationale_en and rationale_ja", () => {
    const r = extractTravelIntent("宿坊に泊まりたい");
    const hint = buildRoutingHint("get_spots", r);
    assertDefined(hint);
    expect(hint.reason_en).toEqual(expect.any(String));
    expect(hint.reason_ja).toEqual(expect.any(String));
    expect(String(hint.reason_en).length).toBeGreaterThan(0);
    expect(String(hint.reason_ja).length).toBeGreaterThan(0);
  });
});

describe("renderQueryIntent", () => {
  it("returns undefined when no concepts matched", () => {
    expect(renderQueryIntent(extractTravelIntent(""))).toBeUndefined();
  });

  it("returns object with detected_concepts and suggested_tool when present", () => {
    const out = renderQueryIntent(extractTravelIntent("宿坊に泊まりたい"));
    assertDefined(out);
    expect(out.suggested_tool).toBe("get_hotels");
    const detected = detectedFrom(out);
    expect(detected).toHaveLength(1);
    expect(detected[0]).toMatchObject({
      id: "shukubo",
      matched_text: "宿坊",
      polarity: "boost",
      routing_tool: "get_hotels",
    });
    expect(detected[0].target_kinds).toEqual(
      expect.arrayContaining(["buddhist_temple"]),
    );
  });

  it("omits empty target_kinds / target_heritage_qids fields", () => {
    // ryokan has only routing_tool, no target_kinds / no target_heritage_qids
    const out = renderQueryIntent(extractTravelIntent("旅館に泊まりたい"));
    assertDefined(out);
    const [first] = detectedFrom(out);
    expect(first.id).toBe("ryokan");
    expect(first.target_kinds).toBeUndefined();
    expect(first.target_heritage_qids).toBeUndefined();
    expect(first.routing_tool).toBe("get_hotels");
  });

  it("omits suggested_tool when no concept supplies routing_tool", () => {
    // shotengai has no routing_tool
    const out = renderQueryIntent(extractTravelIntent("商店街を歩く"));
    assertDefined(out);
    expect(out.suggested_tool).toBeUndefined();
  });
});

describe("extractTravelIntent — budget cap detection", () => {
  it("detects '無料' as free cap", () => {
    expect(extractTravelIntent("無料で楽しめる京都の観光").price_band_cap).toBe("free");
  });
  it("detects 'free admission' as free cap", () => {
    expect(extractTravelIntent("things in Tokyo with free admission").price_band_cap).toBe("free");
  });
  it("detects '安い' as low cap", () => {
    expect(extractTravelIntent("安い宿で大阪を旅行").price_band_cap).toBe("low");
  });
  it("detects 'budget' as low cap", () => {
    expect(extractTravelIntent("budget friendly things to do in Osaka").price_band_cap).toBe("low");
  });
  it("detects 'リーズナブル' as low cap", () => {
    expect(extractTravelIntent("リーズナブルに楽しめる").price_band_cap).toBe("low");
  });
  it("detects '高級' as luxury floor", () => {
    expect(extractTravelIntent("高級ホテルに泊まりたい").price_band_floor).toBe("luxury");
  });
  it("detects 'luxury' as luxury floor", () => {
    expect(extractTravelIntent("luxury onsen ryokan").price_band_floor).toBe("luxury");
  });
  it("plain query has no budget signal", () => {
    const r = extractTravelIntent("京都の寺");
    expect(r.price_band_cap).toBeUndefined();
    expect(r.price_band_floor).toBeUndefined();
  });
});

describe("extractTravelIntent — weather constraint detection", () => {
  it("detects 'rainy day' as indoor", () => {
    expect(extractTravelIntent("things to do on a rainy day in Kyoto").weather_constraint).toBe("indoor");
  });
  it("detects '雨の日' as indoor", () => {
    expect(extractTravelIntent("雨の日に楽しめる東京").weather_constraint).toBe("indoor");
  });
  it("detects '室内' as indoor", () => {
    expect(extractTravelIntent("室内で楽しめるアクティビティ").weather_constraint).toBe("indoor");
  });
  it("detects 'outdoors' as outdoor", () => {
    expect(extractTravelIntent("outdoors activities in Hokkaido").weather_constraint).toBe("outdoor");
  });
  it("plain query has no weather signal", () => {
    expect(extractTravelIntent("京都の寺").weather_constraint).toBeUndefined();
  });
  it("does not falsely fire on '雨天中止' policy text", () => {
    // 雨天中止 = "cancelled in rain" — event policy, not a "rainy day
    // filter" query. The regex's negative lookahead excludes this.
    expect(extractTravelIntent("雨天中止のイベント").weather_constraint).toBeUndefined();
  });
});

describe("TRAVEL_CONCEPTS — invariants", () => {
  it("ids are unique", () => {
    const ids = TRAVEL_CONCEPTS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every concept has non-empty rationale_en and rationale_ja", () => {
    for (const c of TRAVEL_CONCEPTS) {
      expect(c.rationale_en.length).toBeGreaterThan(0);
      expect(c.rationale_ja.length).toBeGreaterThan(0);
    }
  });

  it("every concept regex executes without throwing", () => {
    // Sanity check: concept regexes are user-authored and need to be
    // valid. We don't require each to match anything specific — that is
    // covered by the extractTravelIntent tests above.
    for (const c of TRAVEL_CONCEPTS) {
      expect(() => "x".match(c.re)).not.toThrow();
    }
  });
});
