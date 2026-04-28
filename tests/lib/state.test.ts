import { describe, it, expect } from "vitest";
import {
  pickStaleMunicipalities,
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
