import { describe, it, expect } from "vitest";
import {
  pickR3Name,
  pickR3Description,
  r3Translation,
  type R3Translation,
} from "../../src/lib/r3.js";

function rec(over: Partial<R3Translation> = {}): R3Translation {
  return {
    key: "test:1",
    confidence: "high",
    source: "test",
    generated_at: "2026-05-05T00:00:00Z",
    ...over,
  };
}

// ─── pickR3Name ──────────────────────────────────────────────────────

describe("pickR3Name", () => {
  it("returns the translated name when lang exists in the record", () => {
    const r = rec({ name: { en: "Cat Island", fr: "Île aux chats" } });
    expect(pickR3Name("猫島", r, "en")).toBe("Cat Island");
    expect(pickR3Name("猫島", r, "fr")).toBe("Île aux chats");
  });

  it("falls back to the supplied fallback when lang is missing in the record", () => {
    const r = rec({ name: { en: "Cat Island" } });
    expect(pickR3Name("猫島", r, "fr")).toBe("猫島");
  });

  it("falls back when lang is undefined (no translation requested)", () => {
    const r = rec({ name: { en: "Cat Island" } });
    expect(pickR3Name("猫島", r, undefined)).toBe("猫島");
  });

  it("falls back when the record itself is undefined", () => {
    expect(pickR3Name("猫島", undefined, "en")).toBe("猫島");
  });

  it("falls back when the record has no name field at all", () => {
    expect(pickR3Name("猫島", rec(), "en")).toBe("猫島");
  });

  it("preserves null fallbacks", () => {
    expect(pickR3Name(null, undefined, "en")).toBeNull();
  });
});

// ─── pickR3Description ───────────────────────────────────────────────

describe("pickR3Description", () => {
  it("returns the translated description when present", () => {
    const r = rec({ description: { en: "Famous fishing port." } });
    expect(pickR3Description("有名な港", r, "en")).toBe(
      "Famous fishing port.",
    );
  });

  it("falls back to fallbackJa when lang is 'ja'", () => {
    const r = rec({ description: { en: "Famous fishing port." } });
    expect(pickR3Description("有名な港", r, "ja")).toBe("有名な港");
  });

  it("falls back to fallbackJa when lang is missing in the record", () => {
    const r = rec({ description: { en: "Famous fishing port." } });
    // This is the documented fallback path — "lang specified but not
    // translated" → return Japanese with translation_meta marker.
    expect(pickR3Description("有名な港", r, "fr")).toBe("有名な港");
  });

  it("falls back to fallbackJa when no record is supplied", () => {
    expect(pickR3Description("有名な港", undefined, "en")).toBe("有名な港");
  });

  it("falls back to fallbackJa when lang is undefined", () => {
    const r = rec({ description: { en: "Famous fishing port." } });
    expect(pickR3Description("有名な港", r, undefined)).toBe("有名な港");
  });

  it("preserves null fallbackJa", () => {
    expect(pickR3Description(null, undefined, "en")).toBeNull();
  });
});

// ─── r3Translation ───────────────────────────────────────────────────

describe("r3Translation", () => {
  it("returns 'official_translated' meta when description exists in lang", () => {
    const r = rec({
      description: { en: "Hello" },
      generated_at: "2026-05-05T00:00:00Z",
      confidence: "high",
    });
    expect(r3Translation(r, "en")).toEqual({
      source: "official_translated",
      generated_at: "2026-05-05T00:00:00Z",
      confidence: "high",
    });
  });

  it("returns 'official_only' meta when no translation is requested", () => {
    const r = rec({ description: { en: "Hello" } });
    expect(r3Translation(r, undefined)).toEqual({
      source: "official_only",
      generated_at: null,
      confidence: null,
    });
  });

  it("returns 'official_only' when lang isn't translated", () => {
    const r = rec({ description: { en: "Hello" } });
    expect(r3Translation(r, "fr")).toEqual({
      source: "official_only",
      generated_at: null,
      confidence: null,
    });
  });

  it("returns 'official_only' when no record is supplied", () => {
    expect(r3Translation(undefined, "en")).toEqual({
      source: "official_only",
      generated_at: null,
      confidence: null,
    });
  });

  it("propagates the record's confidence level", () => {
    const r = rec({
      description: { en: "Hello" },
      confidence: "medium",
    });
    expect(r3Translation(r, "en").confidence).toBe("medium");
  });

  it("emits null generated_at when the record didn't supply one", () => {
    const r: R3Translation = {
      key: "k",
      description: { en: "Hello" },
      // no generated_at
    };
    expect(r3Translation(r, "en").generated_at).toBeNull();
  });
});
