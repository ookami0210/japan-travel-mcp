import { describe, it, expect } from "vitest";
import {
  stableStringify,
  hashSource,
  isStale,
  mergeRows,
  type ExistingRow,
} from "../../scrapers/translate/lib/incremental.js";

const LANGS = ["en", "ja", "zh"] as const;

function row(qid: string, langs: string[], hash?: string): ExistingRow {
  return {
    qid,
    descriptions: Object.fromEntries(langs.map((l) => [l, `${qid}-${l}`])),
    source_hash: hash,
  };
}

describe("stableStringify / hashSource", () => {
  it("is independent of key order", () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
    expect(hashSource({ a: 1, b: [2, 3] })).toBe(hashSource({ b: [2, 3], a: 1 }));
  });

  it("changes when a value changes", () => {
    expect(hashSource({ name: "A" })).not.toBe(hashSource({ name: "B" }));
  });

  it("distinguishes null from missing", () => {
    expect(hashSource({ x: null })).not.toBe(hashSource({}));
  });

  it("is stable across calls (deterministic)", () => {
    const f = { names: { en: "Kyoto", ja: "京都" }, types: ["city"] };
    expect(hashSource(f)).toBe(hashSource({ ...f }));
  });
});

describe("isStale", () => {
  it("new entity (no prior row) → translate", () => {
    expect(isStale("h1", undefined, LANGS)).toBe(true);
  });

  it("complete row, matching hash → skip", () => {
    expect(isStale("h1", row("Q1", ["en", "ja", "zh"], "h1"), LANGS)).toBe(false);
  });

  it("complete row, changed hash → translate", () => {
    expect(isStale("h2", row("Q1", ["en", "ja", "zh"], "h1"), LANGS)).toBe(true);
  });

  it("row missing a required language → translate (repair)", () => {
    expect(isStale("h1", row("Q1", ["en", "ja"], "h1"), LANGS)).toBe(true);
  });

  it("legacy complete row (no stored hash) → skip (backfill only, no spend)", () => {
    expect(isStale("h1", row("Q1", ["en", "ja", "zh"], undefined), LANGS)).toBe(false);
  });

  it("legacy row that is also incomplete → translate", () => {
    expect(isStale("h1", row("Q1", ["en"], undefined), LANGS)).toBe(true);
  });
});

interface OutRow {
  qid: string;
  descriptions: Record<string, string>;
  source_hash?: string;
  generated_at?: string;
}

describe("mergeRows", () => {
  it("preserves untouched rows (no truncation) and applies fresh ones", () => {
    const existing = new Map<string, OutRow>([
      ["Q1", { qid: "Q1", descriptions: { en: "old1" }, source_hash: "a" }],
      ["Q2", { qid: "Q2", descriptions: { en: "old2" }, source_hash: "b" }],
    ]);
    const fresh: OutRow[] = [
      { qid: "Q2", descriptions: { en: "new2" }, source_hash: "b2" },
      { qid: "Q3", descriptions: { en: "new3" }, source_hash: "c" },
    ];
    const hashByQid = new Map([
      ["Q1", "a"],
      ["Q2", "b2"],
      ["Q3", "c"],
    ]);
    const merged = mergeRows(existing, fresh, hashByQid);
    const byQid = Object.fromEntries(merged.map((r) => [r.qid, r]));
    expect(merged).toHaveLength(3); // Q1 kept, not dropped
    expect(byQid.Q1.descriptions.en).toBe("old1"); // untouched
    expect(byQid.Q2.descriptions.en).toBe("new2"); // fresh wins
    expect(byQid.Q3.descriptions.en).toBe("new3"); // added
  });

  it("backfills source_hash on legacy rows without re-translating them", () => {
    const existing = new Map<string, OutRow>([
      ["Q1", { qid: "Q1", descriptions: { en: "legacy" } }], // no source_hash
    ]);
    const hashByQid = new Map([["Q1", "computed-hash"]]);
    const merged = mergeRows(existing, [], hashByQid);
    expect(merged).toHaveLength(1);
    expect(merged[0].source_hash).toBe("computed-hash");
    expect(merged[0].descriptions.en).toBe("legacy"); // content untouched
  });

  it("emits rows sorted by qid for stable diffs", () => {
    const existing = new Map<string, OutRow>([
      ["Q3", { qid: "Q3", descriptions: {}, source_hash: "x" }],
      ["Q1", { qid: "Q1", descriptions: {}, source_hash: "x" }],
    ]);
    const merged = mergeRows(existing, [], new Map());
    expect(merged.map((r) => r.qid)).toEqual(["Q1", "Q3"]);
  });
});
