import { describe, it, expect } from "vitest";
import { spendGuardDecision } from "../../scrapers/lib/spend_guard.js";

describe("spendGuardDecision", () => {
  it("allows normal incremental batches", () => {
    expect(spendGuardDecision(0, 100, false)).toBe("ok");
    expect(spendGuardDecision(5, 100, false)).toBe("ok");
    expect(spendGuardDecision(100, 100, false)).toBe("ok"); // at the cap
  });

  it("blocks a batch that exceeds the cap (broken-premise signature)", () => {
    expect(spendGuardDecision(101, 100, false)).toBe("block");
    expect(spendGuardDecision(175, 100, false)).toBe("block"); // the real incident size
    expect(spendGuardDecision(13985, 1000, false)).toBe("block"); // full-corpus burn
  });

  it("explicit full-rebuild consent bypasses the guard", () => {
    expect(spendGuardDecision(13985, 1000, true)).toBe("ok");
  });

  it("a non-positive or invalid cap disables the guard", () => {
    expect(spendGuardDecision(5000, 0, false)).toBe("ok");
    expect(spendGuardDecision(5000, -1, false)).toBe("ok");
    expect(spendGuardDecision(5000, NaN, false)).toBe("ok");
  });
});
