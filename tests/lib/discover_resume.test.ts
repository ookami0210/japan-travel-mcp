import { describe, it, expect } from "vitest";
import { discoverTourismPages } from "../../scrapers/lib/discover.js";
import { DEFAULT_OPTIONS } from "../../scrapers/lib/types.js";

// These cases exercise the resume / deadline / cap CLASSIFICATION added for the
// resumable crawl without any network: each is crafted so the BFS loop body
// never runs (deadline already passed, empty frontier, or cap already hit), so
// the fetch is never reached. The actual crawling is covered elsewhere.

const seed = "https://example.lg.jp/";

describe("discoverTourismPages — resumable classification", () => {
  it("stops immediately when the window deadline has already passed", async () => {
    const res = await discoverTourismPages(
      seed,
      DEFAULT_OPTIONS,
      undefined,
      null,
      Date.now() - 1000, // deadline in the past
    );
    expect(res.complete).toBe(false); // not done — resume next window
    expect(res.truncated_at_cap).toBe(false);
    expect(res.remaining_frontier).toBeGreaterThan(0); // seeds still queued
    expect(res.checkpoint.frontier.length).toBe(res.remaining_frontier);
    expect(res.pages).toEqual([]);
  });

  it("resumes from a checkpoint and reports complete when the frontier is drained", async () => {
    const pages = [{ url: "https://example.lg.jp/kanko/a", title: "A" }];
    const res = await discoverTourismPages(seed, DEFAULT_OPTIONS, undefined, {
      visited: ["https://example.lg.jp/kanko/a"],
      frontier: [], // nothing left to crawl
      pages,
    });
    expect(res.complete).toBe(true);
    expect(res.truncated_at_cap).toBe(false);
    expect(res.remaining_frontier).toBe(0);
    expect(res.pages).toEqual(pages); // prior-window output preserved
  });

  it("flags truncated_at_cap when the page cap is hit with URLs still queued", async () => {
    const opts = { ...DEFAULT_OPTIONS, maxPagesPerMunicipality: 2 };
    const res = await discoverTourismPages(seed, opts, undefined, {
      visited: [],
      frontier: [{ url: "https://example.lg.jp/kanko/more", depth: 1 }],
      pages: [
        { url: "https://example.lg.jp/kanko/a", title: "A" },
        { url: "https://example.lg.jp/kanko/b", title: "B" }, // at cap (2)
      ],
    });
    expect(res.complete).toBe(true); // done for our purposes (cap reached)
    expect(res.truncated_at_cap).toBe(true); // site is larger than the cap
    expect(res.remaining_frontier).toBeGreaterThan(0);
  });
});
