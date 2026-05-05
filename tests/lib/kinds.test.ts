import { describe, it, expect } from "vitest";
import {
  WD_TYPE_KIND,
  NAME_KIND_RE,
  HERITAGE_QID_LABEL,
  KINDS_KEYWORD_RE,
  HERITAGE_KEYWORD_RE,
  nameKindEnrich,
  wikidataKinds,
  heritageLabels,
  kindsFromQuery,
  heritageQidsFromQuery,
} from "../../src/lib/kinds.js";

// ─── Constant invariants ─────────────────────────────────────────────
//
// These keep the QID maps self-consistent. If a future PR drops a value
// or adds a malformed entry, these tests fail loudly.

describe("WD_TYPE_KIND", () => {
  it("uses Q-prefixed Wikidata QID keys", () => {
    for (const k of Object.keys(WD_TYPE_KIND)) {
      expect(k).toMatch(/^Q\d+$/);
    }
  });

  it("maps every QID to a non-empty snake_case label", () => {
    for (const v of Object.values(WD_TYPE_KIND)) {
      expect(v.length).toBeGreaterThan(0);
      expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("includes the canonical Japanese tourism types", () => {
    expect(WD_TYPE_KIND.Q44613).toBe("buddhist_temple");
    expect(WD_TYPE_KIND.Q845945).toBe("shinto_shrine");
    expect(WD_TYPE_KIND.Q23413).toBe("castle");
    expect(WD_TYPE_KIND.Q22698).toBe("park");
    expect(WD_TYPE_KIND.Q34038).toBe("waterfall");
  });
});

describe("HERITAGE_QID_LABEL", () => {
  it("uses Q-prefixed Wikidata QID keys", () => {
    for (const k of Object.keys(HERITAGE_QID_LABEL)) {
      expect(k).toMatch(/^Q\d+$/);
    }
  });

  it("supplies both ja and en labels for every entry", () => {
    for (const [qid, label] of Object.entries(HERITAGE_QID_LABEL)) {
      expect(label.ja, qid).toBeTruthy();
      expect(label.en, qid).toBeTruthy();
    }
  });

  it("includes the four canonical heritage anchors", () => {
    expect(HERITAGE_QID_LABEL.Q9259.en).toMatch(/UNESCO/i);
    expect(HERITAGE_QID_LABEL.Q1139795.ja).toBe("国宝");
    expect(HERITAGE_QID_LABEL.Q1188622.ja).toBe("重要文化財");
    expect(HERITAGE_QID_LABEL.Q26764449.ja).toBe("国の特別史跡");
  });
});

describe("NAME_KIND_RE / KINDS_KEYWORD_RE / HERITAGE_KEYWORD_RE — shape", () => {
  it("each NAME_KIND_RE entry has a non-empty kinds list and a RegExp", () => {
    for (const e of NAME_KIND_RE) {
      expect(e.re).toBeInstanceOf(RegExp);
      expect(e.kinds.length).toBeGreaterThan(0);
    }
  });

  it("each KINDS_KEYWORD_RE entry has a non-empty kinds list and a RegExp", () => {
    for (const e of KINDS_KEYWORD_RE) {
      expect(e.re).toBeInstanceOf(RegExp);
      expect(e.kinds.length).toBeGreaterThan(0);
    }
  });

  it("each HERITAGE_KEYWORD_RE entry has a non-empty qids list and a RegExp", () => {
    for (const e of HERITAGE_KEYWORD_RE) {
      expect(e.re).toBeInstanceOf(RegExp);
      expect(e.qids.length).toBeGreaterThan(0);
      for (const q of e.qids) expect(q).toMatch(/^Q\d+$/);
    }
  });
});

// ─── nameKindEnrich ──────────────────────────────────────────────────

describe("nameKindEnrich", () => {
  it("is a no-op for null / undefined / empty name", () => {
    const dst: string[] = [];
    nameKindEnrich(null, dst);
    nameKindEnrich(undefined, dst);
    nameKindEnrich("", dst);
    expect(dst).toEqual([]);
  });

  it("appends the matching kind when the name contains a yokocho token", () => {
    const dst: string[] = [];
    nameKindEnrich("有楽町ガード下横丁", dst);
    expect(dst).toContain("yokocho");
  });

  it("dedupes against existing entries in dst", () => {
    const dst = ["yokocho"];
    nameKindEnrich("○○横丁", dst);
    expect(dst.filter((k) => k === "yokocho")).toHaveLength(1);
  });

  it("appends multiple kinds for a single match (machiya rule)", () => {
    const dst: string[] = [];
    nameKindEnrich("○○町並み保存地区", dst);
    expect(dst).toContain("machiya");
    expect(dst).toContain("preservation_district");
  });

  it("does NOT match 北海道 with the kaido rule (the iter68 false-positive)", () => {
    const dst: string[] = [];
    nameKindEnrich("北海道", dst);
    expect(dst).not.toContain("kaido");
  });

  it("matches 東海道 with the kaido rule", () => {
    const dst: string[] = [];
    nameKindEnrich("東海道五十三次", dst);
    expect(dst).toContain("kaido");
  });

  it("matches anchored volcano names exactly", () => {
    const dst1: string[] = [];
    nameKindEnrich("富士山", dst1);
    expect(dst1).toContain("active_volcano");
    expect(dst1).toContain("volcano");
    expect(dst1).toContain("mountain");

    // Anchored — appended suffix breaks the match.
    const dst2: string[] = [];
    nameKindEnrich("富士山世界遺産センター", dst2);
    expect(dst2).not.toContain("active_volcano");
  });

  it("matches local-railway names of 1-5 chars + 線 anchored", () => {
    const dst: string[] = [];
    nameKindEnrich("飯田線", dst);
    expect(dst).toContain("local_railway");
    expect(dst).toContain("railway_line");
  });

  it("recognises shinto / buddhist / pilgrimage suffix patterns", () => {
    const a: string[] = [];
    nameKindEnrich("八幡宮", a);
    expect(a).toContain("shinto_shrine");

    const b: string[] = [];
    nameKindEnrich("○○寺", b);
    expect(b).toContain("buddhist_temple");

    const c: string[] = [];
    nameKindEnrich("第八番札所", c);
    expect(c).toContain("pilgrimage_site");
    expect(c).toContain("buddhist_temple");
  });
});

// ─── wikidataKinds ───────────────────────────────────────────────────

describe("wikidataKinds", () => {
  it("returns an empty array when types is missing and names don't match", () => {
    expect(
      wikidataKinds({ name_ja: "Anonymous", name_en: "Anonymous" }),
    ).toEqual([]);
  });

  it("maps Wikidata type QIDs through WD_TYPE_KIND", () => {
    expect(
      wikidataKinds({
        types: ["Q44613"],
        name_ja: null,
        name_en: null,
      }),
    ).toEqual(["buddhist_temple"]);
  });

  it("dedupes when multiple type QIDs map to the same kind", () => {
    // Q44613 and Q5393308 both map to "buddhist_temple" — the dedup path
    // should fold them into a single entry.
    const out = wikidataKinds({
      types: ["Q44613", "Q5393308"],
      name_ja: null,
      name_en: null,
    });
    expect(out).toEqual(["buddhist_temple"]);
  });

  it("ignores unknown type QIDs (no entry in WD_TYPE_KIND)", () => {
    expect(
      wikidataKinds({
        types: ["Q99999999"],
        name_ja: null,
        name_en: null,
      }),
    ).toEqual([]);
  });

  it("enriches kinds via name regex (NAME_KIND_RE) on ja name", () => {
    const out = wikidataKinds({
      types: ["Q570116"],
      name_ja: "○○横丁",
      name_en: null,
    });
    expect(out).toContain("tourist_attraction");
    expect(out).toContain("yokocho");
  });

  it("enriches via name regex on en name (e.g. 'Tokaido')", () => {
    const out = wikidataKinds({
      name_ja: null,
      name_en: "東海道",
    });
    expect(out).toContain("kaido");
  });

  it("appends Wikipedia-derived kind tags", () => {
    const out = wikidataKinds({
      name_ja: null,
      name_en: null,
      wikipedia_kind_tags: ["sand_dune", "preservation_district"],
    });
    expect(out).toEqual(["sand_dune", "preservation_district"]);
  });

  it("dedupes wikipedia tags against type-derived kinds", () => {
    const out = wikidataKinds({
      types: ["Q22698"],          // → park
      name_ja: null,
      name_en: null,
      wikipedia_kind_tags: ["park", "garden"],
    });
    // park appears once, garden once.
    expect(out.filter((k) => k === "park")).toHaveLength(1);
    expect(out).toContain("garden");
  });
});

// ─── heritageLabels ──────────────────────────────────────────────────

describe("heritageLabels", () => {
  it("returns undefined for undefined / empty input", () => {
    expect(heritageLabels(undefined)).toBeUndefined();
    expect(heritageLabels([])).toBeUndefined();
  });

  it("maps known QIDs to their English label", () => {
    expect(heritageLabels(["Q9259"])).toEqual([
      "UNESCO World Heritage Site",
    ]);
    expect(heritageLabels(["Q1139795", "Q1188622"])).toEqual([
      "National Treasure of Japan",
      "Important Cultural Property of Japan",
    ]);
  });

  it("surfaces unmapped QIDs as raw strings (better than dropping)", () => {
    expect(heritageLabels(["Q9999999"])).toEqual(["Q9999999"]);
  });

  it("preserves input order", () => {
    const out = heritageLabels(["Q1188622", "Q9259", "Q1139795"]);
    expect(out).toEqual([
      "Important Cultural Property of Japan",
      "UNESCO World Heritage Site",
      "National Treasure of Japan",
    ]);
  });
});

// ─── kindsFromQuery ──────────────────────────────────────────────────

describe("kindsFromQuery", () => {
  it("returns an empty set for non-keyword queries", () => {
    expect(kindsFromQuery("hello world")).toEqual(new Set());
  });

  it("detects English keywords (case-insensitive, word-bounded)", () => {
    expect(kindsFromQuery("show me a temple")).toEqual(
      new Set(["buddhist_temple"]),
    );
    expect(kindsFromQuery("SHRINE")).toEqual(new Set(["shinto_shrine"]));
  });

  it("detects Japanese keywords without word boundaries", () => {
    expect(kindsFromQuery("京都の神社")).toEqual(new Set(["shinto_shrine"]));
    expect(kindsFromQuery("お寺")).toEqual(new Set()); // \bdera\b doesn't match here
  });

  it("expands castle queries to all castle subtypes", () => {
    const out = kindsFromQuery("matsumoto castle");
    expect(out.has("castle")).toBe(true);
    expect(out.has("japanese_castle")).toBe(true);
    expect(out.has("hilltop_castle")).toBe(true);
  });

  it("returns the union when the query mentions multiple kinds", () => {
    const out = kindsFromQuery("temple and shrine");
    expect(out).toEqual(new Set(["buddhist_temple", "shinto_shrine"]));
  });

  it("matches 'onsen' / 'hot spring' to both onsen_resort and hot_spring", () => {
    expect(kindsFromQuery("onsen")).toEqual(
      new Set(["onsen_resort", "hot_spring"]),
    );
    expect(kindsFromQuery("hot spring")).toEqual(
      new Set(["onsen_resort", "hot_spring"]),
    );
  });
});

// ─── heritageQidsFromQuery ───────────────────────────────────────────

describe("heritageQidsFromQuery", () => {
  it("returns empty when no heritage keywords are present", () => {
    expect(heritageQidsFromQuery("show me Kyoto")).toEqual(new Set());
  });

  it("detects 'UNESCO' / 'world heritage' / '世界遺産'", () => {
    expect(heritageQidsFromQuery("UNESCO sites")).toEqual(new Set(["Q9259"]));
    expect(heritageQidsFromQuery("世界遺産")).toEqual(new Set(["Q9259"]));
    expect(heritageQidsFromQuery("world heritage")).toEqual(
      new Set(["Q9259"]),
    );
  });

  it("national-treasure queries return both Q1139795 and Q1186017", () => {
    const out = heritageQidsFromQuery("国宝");
    expect(out).toEqual(new Set(["Q1139795", "Q1186017"]));
  });

  it("detects 'important cultural property' / '重要文化財' → Q1188622", () => {
    expect(heritageQidsFromQuery("Important Cultural Property")).toEqual(
      new Set(["Q1188622"]),
    );
    expect(heritageQidsFromQuery("重要文化財")).toEqual(new Set(["Q1188622"]));
  });

  it("returns the union when the query mentions multiple heritage classes", () => {
    const out = heritageQidsFromQuery("UNESCO and ramsar wetlands");
    expect(out).toEqual(new Set(["Q9259", "Q19683138"]));
  });
});
