import { describe, it, expect } from "vitest";
import {
  pickStaleMunicipalities,
  baselineBatchSize,
  recommendBatchSize,
  TARGET_CYCLE_DAYS,
  SLA_DAYS,
  MIN_BATCH,
  MAX_BATCH,
  type ScraperState,
  type MunicipalityState,
} from "../../scrapers/lib/state.js";

function muniState(lastScrapedAt: string | null): MunicipalityState {
  return {
    last_scraped_at: lastScrapedAt,
    last_status: lastScrapedAt ? "success" : null,
    pages_fetched: 0,
    spots_found: 0,
    error_count: 0,
  };
}

function makeState(
  per: Record<string, MunicipalityState>,
): ScraperState {
  return {
    schema_version: 1,
    last_run_at: null,
    per_municipality: per,
    auto_stop: { triggered: false, reason: null, triggered_at: null },
  };
}

describe("pickStaleMunicipalities", () => {
  it("returns up to `count` codes, oldest first", () => {
    const state = makeState({
      A: muniState("2026-04-01T00:00:00Z"),
      B: muniState("2026-03-01T00:00:00Z"),
      C: muniState("2026-04-15T00:00:00Z"),
    });
    expect(pickStaleMunicipalities(state, ["A", "B", "C"], 2)).toEqual([
      "B",
      "A",
    ]);
  });

  it("never-scraped codes (no entry) sort first ahead of scraped ones", () => {
    const state = makeState({
      A: muniState("2026-04-01T00:00:00Z"),
      B: muniState("2026-04-15T00:00:00Z"),
    });
    expect(
      pickStaleMunicipalities(state, ["A", "B", "NEW1", "NEW2"], 3),
    ).toEqual(["NEW1", "NEW2", "A"]);
  });

  it("treats null last_scraped_at the same as never scraped", () => {
    const state = makeState({
      A: muniState(null),
      B: muniState("2026-04-15T00:00:00Z"),
    });
    expect(pickStaleMunicipalities(state, ["A", "B"], 2)).toEqual(["A", "B"]);
  });

  it("returns empty array when allCodes is empty", () => {
    expect(pickStaleMunicipalities(makeState({}), [], 5)).toEqual([]);
  });

  it("returns fewer than `count` when allCodes is smaller", () => {
    const state = makeState({});
    expect(pickStaleMunicipalities(state, ["X"], 5)).toEqual(["X"]);
  });
});

describe("baselineBatchSize", () => {
  it("covers every candidate within the target cycle", () => {
    // ceil(1938 / 28) = 70 — enough to touch all 1,938 in 28 days.
    expect(baselineBatchSize(1938)).toBe(Math.ceil(1938 / TARGET_CYCLE_DAYS));
    expect(baselineBatchSize(1938) * TARGET_CYCLE_DAYS).toBeGreaterThanOrEqual(1938);
  });

  it("scales up with data volume", () => {
    expect(baselineBatchSize(4000)).toBeGreaterThan(baselineBatchSize(1938));
  });

  it("clamps to the floor for tiny datasets and never returns 0", () => {
    expect(baselineBatchSize(10)).toBe(MIN_BATCH);
    expect(baselineBatchSize(0)).toBe(MIN_BATCH);
  });

  it("clamps to the ceiling for very large datasets", () => {
    expect(baselineBatchSize(1_000_000)).toBe(MAX_BATCH);
  });
});

describe("recommendBatchSize", () => {
  it("returns the baseline when the stalest candidate is within SLA", () => {
    const n = 1938;
    expect(recommendBatchSize(n, SLA_DAYS - 1)).toBe(baselineBatchSize(n));
    expect(recommendBatchSize(n, 1)).toBe(baselineBatchSize(n));
  });

  it("scales up proportionally once past the SLA, to clear the backlog", () => {
    const n = 1938;
    const base = baselineBatchSize(n);
    const behind = recommendBatchSize(n, SLA_DAYS * 1.5);
    expect(behind).toBeGreaterThan(base);
    expect(behind).toBeLessThanOrEqual(MAX_BATCH);
  });

  it("never recommends below the baseline", () => {
    const n = 1938;
    expect(recommendBatchSize(n, SLA_DAYS + 5)).toBeGreaterThanOrEqual(
      baselineBatchSize(n),
    );
  });

  it("pushes to the ceiling when some candidate has never been scraped", () => {
    expect(recommendBatchSize(1938, Infinity)).toBe(MAX_BATCH);
  });

  it("relaxes back to baseline once fresh again (no permanent ratchet)", () => {
    const n = 1938;
    // Simulate: was behind, now fresh — recommendation drops to baseline.
    const whenBehind = recommendBatchSize(n, SLA_DAYS * 2);
    const whenFresh = recommendBatchSize(n, 10);
    expect(whenFresh).toBe(baselineBatchSize(n));
    expect(whenFresh).toBeLessThan(whenBehind);
  });
});
