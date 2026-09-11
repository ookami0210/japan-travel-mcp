import { describe, it, expect } from "vitest";
import { hybridMergeSpots } from "../../scrapers/lib/crawl_merge.js";

const spot = (id: string, ts: string) => ({ id, last_scraped_at: ts });

describe("hybridMergeSpots", () => {
  it("unions existing and fresh by id — coverage grows, never drops", () => {
    const existing = [spot("a", "2026-01-01"), spot("b", "2026-01-01")];
    const fresh = [spot("c", "2026-02-01")]; // this window found a new page
    const out = hybridMergeSpots(existing, fresh, false, "2026-02-01");
    expect(out.map((s) => s.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("fresh wins on id conflict (re-crawled page gets the newer record)", () => {
    const existing = [spot("a", "2026-01-01")];
    const fresh = [spot("a", "2026-02-01")];
    const out = hybridMergeSpots(existing, fresh, false, "2026-02-01");
    expect(out).toHaveLength(1);
    expect(out[0].last_scraped_at).toBe("2026-02-01");
  });

  it("does NOT purge while the crawl is still in progress", () => {
    const existing = [spot("old", "2026-01-01")]; // from a previous cycle
    const fresh = [spot("new", "2026-02-01")];
    const out = hybridMergeSpots(existing, fresh, false, "2026-02-01");
    // Mid-crawl: keep everything so coverage never dips.
    expect(out.map((s) => s.id).sort()).toEqual(["new", "old"]);
  });

  it("on completion drops spots older than the cycle start (deleted pages)", () => {
    const cycleStart = "2026-02-01T00:00:00Z";
    const existing = [
      spot("kept", "2026-02-01T05:00:00Z"), // re-found earlier this cycle
      spot("removed", "2026-01-15T00:00:00Z"), // last cycle, not re-found → drop
    ];
    const fresh = [spot("newthisrun", "2026-02-02T00:00:00Z")];
    const out = hybridMergeSpots(existing, fresh, true, cycleStart);
    expect(out.map((s) => s.id).sort()).toEqual(["kept", "newthisrun"]);
  });

  it("keeps spots that lack a timestamp rather than dropping them", () => {
    const out = hybridMergeSpots(
      [{ id: "x", last_scraped_at: null }],
      [],
      true,
      "2026-02-01",
    );
    expect(out.map((s) => s.id)).toEqual(["x"]);
  });

  it("preserves spots without an id (can't dedup, must not lose)", () => {
    const out = hybridMergeSpots(
      [{ last_scraped_at: "2026-02-02" }],
      [{ id: "a", last_scraped_at: "2026-02-02" }],
      false,
      "2026-02-01",
    );
    expect(out).toHaveLength(2);
  });
});
