import { describe, it, expect, beforeEach } from "vitest";
import { ErrorCounter } from "../../scrapers/lib/fetcher.js";
import { DEFAULT_OPTIONS } from "../../scrapers/lib/types.js";

let c: ErrorCounter;

beforeEach(() => {
  c = new ErrorCounter();
});

describe("ErrorCounter — record", () => {
  it("starts with zeroed counters", () => {
    expect(c.summary()).toEqual({
      success: 0,
      fivexx: 0,
      fourxx: 0,
      network_errors: 0,
    });
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
  });

  it("counts 2xx success and resets both consecutive counters", () => {
    c.record(503, false);
    c.record(404, false);
    expect(c.consecutive5xx).toBe(0); // 404 reset 5xx counter
    expect(c.consecutive4xx).toBe(1);
    c.record(200, false);
    expect(c.totalSuccess).toBe(1);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
  });

  it("increments consecutive5xx and resets consecutive4xx on 5xx", () => {
    c.record(404, false);
    c.record(404, false);
    expect(c.consecutive4xx).toBe(2);
    c.record(500, false);
    expect(c.consecutive4xx).toBe(0);
    expect(c.consecutive5xx).toBe(1);
    expect(c.total5xx).toBe(1);
    expect(c.total4xx).toBe(2);
  });

  it("increments consecutive4xx and resets consecutive5xx on 4xx", () => {
    c.record(500, false);
    c.record(503, false);
    expect(c.consecutive5xx).toBe(2);
    c.record(404, false);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(1);
  });

  it.each([
    [500, "consecutive5xx", "total5xx"],
    [403, "consecutive4xx", "total4xx"],
  ] as const)(
    "accumulates a run of %d responses (%s)",
    (status, consecutiveField, totalField) => {
      const N = 5;
      for (let i = 0; i < N; i++) c.record(status, false);
      expect(c[consecutiveField]).toBe(N);
      expect(c[totalField]).toBe(N);
    },
  );

  it("network errors do not affect consecutive 5xx/4xx", () => {
    c.record(500, false);
    c.record(0, true); // network error
    expect(c.consecutive5xx).toBe(1); // unchanged
    expect(c.totalNetworkErrors).toBe(1);
    expect(c.total5xx).toBe(1);
  });

  it("ignores status when hadError is true (only network counter increments)", () => {
    c.record(200, true);
    expect(c.totalSuccess).toBe(0);
    expect(c.totalNetworkErrors).toBe(1);
  });

  it("treats 3xx (which the fetcher follows) as success bucket", () => {
    // The fetcher follows redirects so we don't see 3xx, but the contract
    // says "<400 = success".
    c.record(301, false);
    expect(c.totalSuccess).toBe(1);
  });
});

describe("ErrorCounter — shouldAbort", () => {
  it("returns false when below both thresholds", () => {
    expect(c.shouldAbort(DEFAULT_OPTIONS)).toEqual({
      abort: false,
      reason: "",
    });
  });

  it("returns true when consecutive 5xx hits the threshold", () => {
    const opts = { ...DEFAULT_OPTIONS, consecutive5xxAbort: 3 };
    c.record(500, false);
    c.record(502, false);
    expect(c.shouldAbort(opts).abort).toBe(false);
    c.record(503, false);
    expect(c.shouldAbort(opts)).toEqual({
      abort: true,
      reason: expect.stringMatching(/3 consecutive 5xx/),
    });
  });

  it("returns true when consecutive 4xx hits the threshold", () => {
    const opts = {
      ...DEFAULT_OPTIONS,
      consecutive5xxAbort: 9999,
      consecutive4xxAbort: 2,
    };
    c.record(404, false);
    c.record(403, false);
    expect(c.shouldAbort(opts)).toEqual({
      abort: true,
      reason: expect.stringMatching(/2 consecutive 4xx/),
    });
  });

  it("does not abort when 4xx run is broken by a success", () => {
    const opts = { ...DEFAULT_OPTIONS, consecutive4xxAbort: 2 };
    c.record(404, false);
    c.record(200, false);
    c.record(404, false);
    expect(c.shouldAbort(opts).abort).toBe(false);
  });

  it("checks the 5xx threshold before the 4xx threshold", () => {
    const opts = {
      ...DEFAULT_OPTIONS,
      consecutive5xxAbort: 1,
      consecutive4xxAbort: 1,
    };
    c.record(500, false);
    expect(c.shouldAbort(opts).reason).toMatch(/5xx/);
  });
});

describe("ErrorCounter — summary", () => {
  it("renames internal fields to public summary keys", () => {
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
