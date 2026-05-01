import { describe, it, expect } from "vitest";
import { ErrorCounter } from "../../scrapers/lib/fetcher.js";
import { DEFAULT_OPTIONS, type ScrapeOptions } from "../../scrapers/lib/types.js";

function withAbortThresholds(
  consecutive5xxAbort: number,
  consecutive4xxAbort: number,
): ScrapeOptions {
  return { ...DEFAULT_OPTIONS, consecutive5xxAbort, consecutive4xxAbort };
}

describe("ErrorCounter — initial state", () => {
  it("starts with all counters at zero", () => {
    const c = new ErrorCounter();
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
    expect(c.total5xx).toBe(0);
    expect(c.total4xx).toBe(0);
    expect(c.totalNetworkErrors).toBe(0);
    expect(c.totalSuccess).toBe(0);
  });

  it("summary() reflects the initial zeros", () => {
    expect(new ErrorCounter().summary()).toEqual({
      success: 0,
      fivexx: 0,
      fourxx: 0,
      network_errors: 0,
    });
  });
});

describe("ErrorCounter.record — status classification", () => {
  it("counts 2xx as success and resets consecutive 5xx/4xx streaks", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(500, false);
    expect(c.consecutive5xx).toBe(2);
    c.record(200, false);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
    expect(c.totalSuccess).toBe(1);
  });

  it("counts 3xx like 2xx (not an error) — only ≥400 is failure", () => {
    // The classifier uses `>= 500` and `>= 400`, so anything < 400 falls
    // through to the success branch. Pin that — a future refactor that
    // routes 3xx differently would change auto-stop semantics.
    const c = new ErrorCounter();
    c.record(304, false);
    expect(c.totalSuccess).toBe(1);
    expect(c.total4xx).toBe(0);
    expect(c.total5xx).toBe(0);
  });

  it("treats 5xx as a 5xx-streak and resets the 4xx streak", () => {
    const c = new ErrorCounter();
    c.record(404, false);
    c.record(404, false);
    expect(c.consecutive4xx).toBe(2);
    c.record(503, false);
    expect(c.consecutive5xx).toBe(1);
    expect(c.consecutive4xx).toBe(0);
    expect(c.total5xx).toBe(1);
    expect(c.total4xx).toBe(2);
  });

  it("treats 4xx as a 4xx-streak and resets the 5xx streak", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(500, false);
    expect(c.consecutive5xx).toBe(2);
    c.record(404, false);
    expect(c.consecutive4xx).toBe(1);
    expect(c.consecutive5xx).toBe(0);
    expect(c.total5xx).toBe(2);
    expect(c.total4xx).toBe(1);
  });

  it("accumulates total5xx / total4xx across non-consecutive runs", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(200, false); // resets consecutive 5xx
    c.record(502, false);
    c.record(404, false); // resets consecutive 5xx
    c.record(500, false); // resets consecutive 4xx
    expect(c.total5xx).toBe(3);
    expect(c.total4xx).toBe(1);
    expect(c.totalSuccess).toBe(1);
    expect(c.consecutive5xx).toBe(1);
    expect(c.consecutive4xx).toBe(0);
  });
});

describe("ErrorCounter.record — network errors", () => {
  it("network errors increment totalNetworkErrors only", () => {
    // hadError=true means a fetch-level failure (timeout, DNS, abort).
    // Per fetcher.ts:27 we deliberately do NOT touch consecutive5xx /
    // consecutive4xx — network errors are tracked separately so a flapping
    // network doesn't trip the HTTP-error abort heuristics.
    const c = new ErrorCounter();
    c.record(0, true);
    c.record(0, true);
    expect(c.totalNetworkErrors).toBe(2);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
    expect(c.total5xx).toBe(0);
    expect(c.total4xx).toBe(0);
    expect(c.totalSuccess).toBe(0);
  });

  it("a network error in the middle of a 5xx streak does NOT reset the streak", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(500, false);
    c.record(0, true); // network error — pass-through
    c.record(500, false);
    expect(c.consecutive5xx).toBe(3);
    expect(c.totalNetworkErrors).toBe(1);
  });

  it("ignores the status argument when hadError is true", () => {
    const c = new ErrorCounter();
    c.record(200, true); // status is irrelevant — error short-circuits
    expect(c.totalSuccess).toBe(0);
    expect(c.totalNetworkErrors).toBe(1);
  });
});

describe("ErrorCounter.shouldAbort", () => {
  it("does not abort when both streaks are below thresholds", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(404, false);
    const out = c.shouldAbort(withAbortThresholds(3, 3));
    expect(out.abort).toBe(false);
    expect(out.reason).toBe("");
  });

  it("aborts when consecutive 5xx reaches the threshold", () => {
    const c = new ErrorCounter();
    c.record(500, false);
    c.record(502, false);
    c.record(503, false);
    const out = c.shouldAbort(withAbortThresholds(3, 100));
    expect(out.abort).toBe(true);
    expect(out.reason).toContain("3");
    expect(out.reason).toContain("5xx");
  });

  it("aborts when consecutive 4xx reaches the threshold", () => {
    const c = new ErrorCounter();
    c.record(404, false);
    c.record(403, false);
    const out = c.shouldAbort(withAbortThresholds(100, 2));
    expect(out.abort).toBe(true);
    expect(out.reason).toContain("4xx");
  });

  it("network errors alone never trigger abort", () => {
    const c = new ErrorCounter();
    for (let i = 0; i < 100; i++) c.record(0, true);
    const out = c.shouldAbort(withAbortThresholds(3, 3));
    expect(out.abort).toBe(false);
  });
});

describe("ErrorCounter.summary", () => {
  it("reports a snapshot of all totals", () => {
    const c = new ErrorCounter();
    c.record(200, false);
    c.record(200, false);
    c.record(500, false);
    c.record(404, false);
    c.record(0, true);
    expect(c.summary()).toEqual({
      success: 2,
      fivexx: 1,
      fourxx: 1,
      network_errors: 1,
    });
  });
});
