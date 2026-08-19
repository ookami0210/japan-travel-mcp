import { describe, it, expect } from "vitest";
import { parseOpeningHours } from "../../src/lib/opening_hours.js";

describe("parseOpeningHours", () => {
  it("parses 24/7", () => {
    const r = parseOpeningHours("24/7");
    expect(r).not.toBeNull();
    expect(r!.twenty_four_seven).toBe(true);
    expect(r!.partial).toBe(false);
    expect(r!.weekly.mo).toEqual([{ open: 0, close: 1440 }]);
    expect(r!.weekly.su).toEqual([{ open: 0, close: 1440 }]);
  });

  it("parses the most common Japanese POI form (Mo-Su HH:MM-HH:MM)", () => {
    const r = parseOpeningHours("Mo-Su 09:00-17:00");
    expect(r).not.toBeNull();
    expect(r!.twenty_four_seven).toBe(false);
    expect(r!.partial).toBe(false);
    for (const d of ["mo", "tu", "we", "th", "fr", "sa", "su"] as const) {
      expect(r!.weekly[d]).toEqual([{ open: 540, close: 1020 }]);
    }
  });

  it("applies a bare time spec to all seven days", () => {
    const r = parseOpeningHours("10:00-18:00");
    expect(r).not.toBeNull();
    expect(r!.weekly.we).toEqual([{ open: 600, close: 1080 }]);
    expect(Object.keys(r!.weekly)).toHaveLength(7);
  });

  it("parses multiple rules with day lists and overrides", () => {
    const r = parseOpeningHours("Mo-Fr 09:00-17:00; Sa,Su 10:00-16:00");
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(false);
    expect(r!.weekly.mo).toEqual([{ open: 540, close: 1020 }]);
    expect(r!.weekly.sa).toEqual([{ open: 600, close: 960 }]);
    expect(r!.weekly.su).toEqual([{ open: 600, close: 960 }]);
  });

  it("later rules override earlier ones for the same day", () => {
    const r = parseOpeningHours("Mo-Su 09:00-17:00; We 09:00-12:00");
    expect(r!.weekly.we).toEqual([{ open: 540, close: 720 }]);
    expect(r!.weekly.th).toEqual([{ open: 540, close: 1020 }]);
  });

  it("parses lunch-break style multiple intervals", () => {
    const r = parseOpeningHours("Mo-Fr 09:00-12:00,13:00-17:30");
    expect(r!.weekly.fr).toEqual([
      { open: 540, close: 720 },
      { open: 780, close: 1050 },
    ]);
  });

  it("parses explicit closed days", () => {
    const r = parseOpeningHours("Tu-Su 09:30-17:00; Mo off");
    expect(r!.weekly.mo).toEqual([]);
    expect(r!.weekly.tu).toEqual([{ open: 570, close: 1020 }]);
  });

  it("handles wrap-around day ranges (Fr-Mo)", () => {
    const r = parseOpeningHours("Fr-Mo 11:00-15:00");
    expect(r!.weekly.fr).toBeDefined();
    expect(r!.weekly.sa).toBeDefined();
    expect(r!.weekly.su).toBeDefined();
    expect(r!.weekly.mo).toBeDefined();
    expect(r!.weekly.tu).toBeUndefined();
  });

  it("encodes past-midnight windows with close > 1440", () => {
    const r = parseOpeningHours("Mo-Su 18:00-02:00");
    expect(r!.weekly.mo).toEqual([{ open: 1080, close: 1560 }]);
  });

  it("accepts 24:00 as end of day", () => {
    const r = parseOpeningHours("Mo-Su 06:00-24:00");
    expect(r!.weekly.mo).toEqual([{ open: 360, close: 1440 }]);
  });

  it("marks seasonal month rules as partial but keeps parseable rules", () => {
    const r = parseOpeningHours("Mo-Fr 09:00-17:00; Apr-Oct Sa 09:00-12:00");
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(true);
    expect(r!.weekly.mo).toEqual([{ open: 540, close: 1020 }]);
    expect(r!.weekly.sa).toBeUndefined();
  });

  it("drops PH from a day list but keeps the weekday schedule (partial)", () => {
    // Very common Japanese POI form: "Mo-Su,PH 09:30-18:00"
    const r = parseOpeningHours("Mo-Su,PH 09:30-18:00");
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(true); // holiday schedule unmodelled
    expect(r!.weekly.mo).toEqual([{ open: 570, close: 1080 }]);
    expect(r!.weekly.su).toEqual([{ open: 570, close: 1080 }]);
  });

  it("handles Tu-Su,PH day lists (closed Monday museums)", () => {
    const r = parseOpeningHours("Tu-Su,PH 10:00-16:30");
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(true);
    expect(r!.weekly.mo).toBeUndefined();
    expect(r!.weekly.tu).toEqual([{ open: 600, close: 990 }]);
  });

  it("marks PH (public holiday) rules as partial without inventing data", () => {
    const r = parseOpeningHours("Mo-Su 09:00-17:00; PH off");
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(true);
    expect(r!.weekly.su).toEqual([{ open: 540, close: 1020 }]);
  });

  it("returns null when nothing is parseable (honest null)", () => {
    expect(parseOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOpeningHours('"varies by season"')).toBeNull();
    expect(parseOpeningHours("")).toBeNull();
    expect(parseOpeningHours("by appointment")).toBeNull();
  });

  it("returns null rather than guessing on open-ended times", () => {
    expect(parseOpeningHours("Mo-Su 18:00+")).toBeNull();
  });

  it("treats '||' fallback rule sets as partial", () => {
    const r = parseOpeningHours('Mo-Fr 09:00-17:00 || "call ahead"');
    expect(r).not.toBeNull();
    expect(r!.partial).toBe(true);
    expect(r!.weekly.mo).toEqual([{ open: 540, close: 1020 }]);
  });
});
