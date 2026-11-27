import { describe, it, expect } from "vitest";
import {
  ATTRACTION_TYPES,
  ATTRACTION_TYPE_QIDS,
  REMOVED_TYPE_QIDS,
} from "../../scrapers/lib/wikidata_attraction_types.js";
import { WD_TYPE_KIND } from "../../src/lib/kinds.js";

describe("wikidata attraction type list", () => {
  it("has well-formed, unique QIDs with a label each", () => {
    expect(ATTRACTION_TYPES.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const t of ATTRACTION_TYPES) {
      expect(t.qid).toMatch(/^Q\d+$/);
      expect(t.label.trim().length).toBeGreaterThan(0);
      expect(seen.has(t.qid)).toBe(false);
      seen.add(t.qid);
    }
    expect(ATTRACTION_TYPE_QIDS).toEqual(ATTRACTION_TYPES.map((t) => t.qid));
  });

  it("does not fetch any class that was removed on purpose", () => {
    for (const q of REMOVED_TYPE_QIDS) {
      expect(ATTRACTION_TYPE_QIDS).not.toContain(q);
    }
  });

  it("gives every fetched class a kind tag on the server side", () => {
    const missing = ATTRACTION_TYPE_QIDS.filter((q) => !WD_TYPE_KIND[q]);
    expect(missing).toEqual([]);
  });

  it("keeps the server map free of the QIDs that pointed at the wrong thing", () => {
    // People, an insect, a continent, a caliphate: none of these are places.
    for (const q of ["Q4087053", "Q14888011", "Q3960", "Q12536", "Q1370978", "Q488205", "Q635155", "Q830356", "Q11197", "Q39614", "Q15303351", "Q1542076", "Q1496967", "Q1500350"]) {
      expect(WD_TYPE_KIND[q]).toBeUndefined();
    }
  });
});

describe("town-district classes reach search", async () => {
  const { enrichKindsDefaults, passesPriceBandCap } = await import("../../src/lib/kinds_defaults.js");
  const { extractTravelIntent } = await import("../../src/lib/intent.js");

  it("gives each town-district tag a visit time and a price band", () => {
    for (const q of ["Q202509", "Q96288605", "Q66364404", "Q11374182", "Q676050", "Q11166728"]) {
      const r = enrichKindsDefaults([WD_TYPE_KIND[q]]);
      expect(r.typical_visit_minutes, q).not.toBeNull();
      expect(r.price_band, q).not.toBeNull();
    }
    // A free-only search keeps an old town; a null band would fail closed.
    expect(passesPriceBandCap(enrichKindsDefaults(["old_town"]).price_band, "free")).toBe(true);
  });

  it("files television towers under observation", () => {
    expect(WD_TYPE_KIND.Q11166728).toBe("observation");
  });

  it("points townscape, chinatown, geisha and nightlife queries at the new tags", () => {
    const kinds = (q: string) => extractTravelIntent(q).recommended_kinds;
    expect(kinds("古い町並みを歩きたい").has("old_town")).toBe(true);
    expect(kinds("横浜中華街で食べ歩き").has("chinatown")).toBe(true);
    expect(kinds("祇園で舞妓さんを見たい").has("kagai")).toBe(true);
    expect(kinds("nightlife in Osaka").has("entertainment_district")).toBe(true);
    expect(kinds("machiya stay").has("old_town")).toBe(true);
  });
});
