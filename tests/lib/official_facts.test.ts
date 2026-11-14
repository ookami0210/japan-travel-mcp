import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyOfficialFactsToAttractions,
  applyOfficialFactsToFood,
  applyOfficialFactsToHotels,
  clearOfficialFactsCache,
  factsBlock,
  loadOfficialFacts,
  type OfficialFactsRecord,
} from "../../src/lib/official_facts.js";

function rec(over: Partial<OfficialFactsRecord>): OfficialFactsRecord {
  return {
    id: "wd:Q1",
    layer: "attraction",
    url: "https://example.jp/",
    final_url: "https://example.jp/info",
    fetched_at: "2026-11-14T00:00:00Z",
    method: "rule",
    opening_hours: null,
    hours_partial: false,
    closed_days: [],
    open_every_day: false,
    hours_evidence: [],
    price_range_raw: null,
    price: null,
    price_evidence: [],
    lodging: null,
    ...over,
  };
}

afterEach(() => clearOfficialFactsCache());

describe("loadOfficialFacts", () => {
  it("reads a jsonl file and tolerates an absent one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "facts-"));
    const path = join(dir, "facts.jsonl");
    await writeFile(path, `${JSON.stringify(rec({ opening_hours: "09:00-17:00" }))}\n{torn\n`, "utf8");
    const map = await loadOfficialFacts(path);
    expect(map.size).toBe(1);
    clearOfficialFactsCache();
    expect((await loadOfficialFacts(join(dir, "missing.jsonl"))).size).toBe(0);
  });
});

describe("overlays", () => {
  it("fills attraction hours only when OSM has none, and attaches the block", () => {
    const facts = new Map([
      ["wd:Q1", rec({ opening_hours: "09:00-17:00; Mo off", closed_days: ["Mo"], hours_evidence: ["開館時間 9:00〜17:00"] })],
      ["wd:Q2", rec({ id: "wd:Q2", opening_hours: "10:00-18:00" })],
    ]);
    type Carrier = Parameters<typeof applyOfficialFactsToAttractions>[0][number];
    const a1: Carrier = { qid: "Q1" };
    const a2: Carrier = { qid: "Q2", opening_hours: "Mo-Su 08:00-20:00" };
    const n = applyOfficialFactsToAttractions([a1, a2], facts);
    expect(n).toBe(2);
    expect(a1.opening_hours).toBe("09:00-17:00; Mo off");
    expect(a1.opening_hours_structured).toBeTruthy();
    expect((a1.official_facts as { source_url: string }).source_url).toBe("https://example.jp/info");
    expect(a2.opening_hours).toBe("Mo-Su 08:00-20:00");
  });

  it("fills food hours_raw and hotel check-in/out", () => {
    const facts = new Map([
      ["osm:node/1", rec({ id: "osm:node/1", layer: "food", opening_hours: "11:00-22:00" })],
      ["hotel:abc", rec({ id: "hotel:abc", layer: "hotel", lodging: { checkin: "15:00", checkout: "10:00" }, price: { adult_jpy: null, child_jpy: null, free: false, from_jpy: 9800 } })],
    ]);
    const v: Parameters<typeof applyOfficialFactsToFood>[0][number] = { id: "osm:node/1", hours_raw: null };
    applyOfficialFactsToFood([v], facts);
    expect(v.hours_raw).toBe("11:00-22:00");
    expect(v.opening_hours_structured).toBeTruthy();
    const h: Parameters<typeof applyOfficialFactsToHotels>[0][number] = { id: "abc" };
    applyOfficialFactsToHotels([h], facts);
    expect(h.official_facts?.checkin).toBe("15:00");
    expect(h.official_facts?.price?.from_jpy).toBe(9800);
  });

  it("returns no block for a record that states nothing", () => {
    expect(factsBlock(rec({}))).toBeNull();
  });
});
