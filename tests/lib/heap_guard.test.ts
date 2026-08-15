import { describe, it, expect, afterEach } from "vitest";
import {
  ensureHeapHeadroom,
  currentHeapLimitMb,
  MIN_HEAP_MB,
  RESPAWN_ENV,
} from "../../src/lib/heap_guard.js";

afterEach(() => {
  delete process.env[RESPAWN_ENV];
});

describe("heap guard", () => {
  it("reports a positive current heap limit", () => {
    expect(currentHeapLimitMb()).toBeGreaterThan(0);
  });

  it("never respawns twice (loop guard via env flag)", () => {
    process.env[RESPAWN_ENV] = "1";
    // Even if the limit were low, the flag short-circuits before any spawn.
    expect(ensureHeapHeadroom()).toBe(false);
  });

  it("does not respawn when the heap limit is already sufficient", () => {
    // vitest workers run without an explicit cap on dev machines; when the
    // limit is high this must be a no-op. When a CI runner happens to have a
    // small default heap the respawn path is covered by the E2E repro
    // instead, so only assert the no-op branch when it applies.
    if (currentHeapLimitMb() >= MIN_HEAP_MB) {
      expect(ensureHeapHeadroom()).toBe(false);
    }
  });
});
