import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import type { SemanticEntry } from "../../src/lib/semantic.js";
import { makeSemanticEntry } from "./_helpers.js";

// ─── Mock the semantic module ────────────────────────────────────────
//
// hybridSearch composes BM25 (real, exercised here) with vector search
// (mocked). We control:
//   - tryLoadSemanticIndex: returns the entries the BM25 side will index, or
//     null to simulate "embeddings_not_built".
//   - semanticSearch: returns whichever ranked entries we want fused in.
//
// The BM25 index in hybrid.ts has its own module-level cache keyed by
// dataRoot — every test mints a unique dataRoot string so we never reuse a
// cached index across tests.

const semanticState: {
  index: { entries: SemanticEntry[] } | null;
  semantic: {
    available: boolean;
    results?: { score: number; entry: SemanticEntry }[];
  };
} = {
  index: null,
  semantic: { available: false },
};

vi.mock("../../src/lib/semantic.js", () => ({
  tryLoadSemanticIndex: vi.fn(async () => semanticState.index),
  semanticSearch: vi.fn(async () => semanticState.semantic),
}));

import { tryLoadBm, hybridSearch } from "../../src/lib/hybrid.js";

function uniqRoot(): string {
  return `/tmp/hybrid-test-${randomUUID()}`;
}

const entry = makeSemanticEntry;

beforeEach(() => {
  semanticState.index = null;
  semanticState.semantic = { available: false };
});

// ─── tryLoadBm ────────────────────────────────────────────────────────

describe("tryLoadBm", () => {
  it("returns null when the underlying semantic index is missing", async () => {
    semanticState.index = null;
    const bm = await tryLoadBm(uniqRoot());
    expect(bm).toBeNull();
  });

  it("builds a BM index from the semantic entries", async () => {
    semanticState.index = {
      entries: [
        entry({ key: "k1", name: "Tokyo Tower" }),
        entry({ key: "k2", name: "Kyoto Imperial Palace" }),
      ],
    };
    const bm = await tryLoadBm(uniqRoot());
    expect(bm).not.toBeNull();
    expect(bm!.N).toBe(2);
    expect(bm!.entries.length).toBe(2);
    // Lowercased Latin tokens land in the postings list.
    expect(bm!.postings.has("tokyo")).toBe(true);
    expect(bm!.postings.has("kyoto")).toBe(true);
    expect(bm!.avgLength).toBeGreaterThan(0);
    expect(typeof bm!.builtAt).toBe("string");
  });

  it("caches the BM index per dataRoot (same root → same instance)", async () => {
    semanticState.index = {
      entries: [entry({ key: "k1", name: "Sapporo Snow Festival" })],
    };
    const root = uniqRoot();
    const a = await tryLoadBm(root);
    const b = await tryLoadBm(root);
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });

  it("rebuilds when called against a different dataRoot", async () => {
    semanticState.index = {
      entries: [entry({ key: "k1", name: "Sapporo" })],
    };
    const a = await tryLoadBm(uniqRoot());
    semanticState.index = {
      entries: [
        entry({ key: "k1", name: "Sapporo" }),
        entry({ key: "k2", name: "Hakodate" }),
      ],
    };
    const b = await tryLoadBm(uniqRoot());
    expect(a).not.toBe(b);
    expect(b!.N).toBe(2);
  });
});

// ─── hybridSearch — availability ─────────────────────────────────────

describe("hybridSearch — availability", () => {
  it("returns available:false with reason embeddings_not_built when index missing", async () => {
    semanticState.index = null;
    const r = await hybridSearch(uniqRoot(), "Tokyo", 5);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("embeddings_not_built");
    expect(r.results).toBeUndefined();
    expect(r.query).toBe("Tokyo");
    expect(r.k).toBe(5);
  });
});

// ─── hybridSearch — BM25 only (semantic empty) ───────────────────────

describe("hybridSearch — BM25 dominates when vector side is empty", () => {
  it("returns documents ranked by BM25 with rank_bm set, rank_vec null", async () => {
    semanticState.index = {
      entries: [
        entry({ key: "match1", name: "Tokyo Tower observation deck" }),
        entry({ key: "match2", name: "Tokyo Skytree" }),
        entry({ key: "irrelevant", name: "Sapporo Snow Festival" }),
      ],
    };
    semanticState.semantic = { available: false };
    const r = await hybridSearch(uniqRoot(), "tokyo", 3);
    expect(r.available).toBe(true);
    expect(r.bm_count).toBe(2); // only the two Tokyo entries match
    expect(r.vec_count).toBe(0);
    expect(r.results).toBeDefined();
    expect(r.results!.length).toBe(2);
    for (const hit of r.results!) {
      expect(hit.rank_bm).not.toBeNull();
      expect(hit.rank_vec).toBeNull();
      expect(hit.score).toBeGreaterThan(0);
    }
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toContain("match1");
    expect(keys).toContain("match2");
    expect(keys).not.toContain("irrelevant");
  });

  it("respects the k parameter (top-k bounding)", async () => {
    semanticState.index = {
      entries: Array.from({ length: 10 }, (_, i) =>
        entry({ key: `k${i}`, name: `tokyo place ${i}` }),
      ),
    };
    const r = await hybridSearch(uniqRoot(), "tokyo", 3);
    expect(r.results!.length).toBe(3);
  });

  it("rounds score to 5 decimals", async () => {
    semanticState.index = {
      entries: [entry({ key: "k1", name: "Kyoto" })],
    };
    const r = await hybridSearch(uniqRoot(), "kyoto", 1);
    const s = r.results![0].score;
    // toFixed(5) → at most 5 decimal digits
    const decimals = (s.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(5);
  });
});

// ─── hybridSearch — semantic-only ────────────────────────────────────

describe("hybridSearch — semantic dominates when BM25 has no matches", () => {
  it("returns vector-ranked entries with rank_vec set, rank_bm null", async () => {
    const e1 = entry({ key: "vec1", name: "失われゆく職人技" });
    const e2 = entry({ key: "vec2", name: "伝統工芸" });
    semanticState.index = { entries: [e1, e2] };
    semanticState.semantic = {
      available: true,
      results: [
        { score: 0.9, entry: e1 },
        { score: 0.8, entry: e2 },
      ],
    };
    // Query tokens won't match either Japanese name in BM25.
    const r = await hybridSearch(uniqRoot(), "losing tradition", 5);
    expect(r.available).toBe(true);
    expect(r.bm_count).toBe(0);
    expect(r.vec_count).toBe(2);
    expect(r.results).toHaveLength(2);
    expect(r.results![0].rank_vec).toBe(1);
    expect(r.results![0].rank_bm).toBeNull();
    expect(r.results![1].rank_vec).toBe(2);
    // Higher rank_vec → higher RRF score → comes first.
    expect(r.results![0].score).toBeGreaterThan(r.results![1].score);
  });
});

// ─── hybridSearch — RRF fusion ───────────────────────────────────────

describe("hybridSearch — RRF fusion", () => {
  it("entries appearing in both retrievers outrank entries in only one", async () => {
    const both = entry({ key: "both", name: "tokyo edo museum" });
    const bmOnly = entry({ key: "bmOnly", name: "tokyo metro" });
    const vecOnly = entry({ key: "vecOnly", name: "samurai armour" });
    semanticState.index = { entries: [both, bmOnly, vecOnly] };
    semanticState.semantic = {
      available: true,
      results: [
        { score: 0.99, entry: both },
        { score: 0.7, entry: vecOnly },
      ],
    };
    const r = await hybridSearch(uniqRoot(), "tokyo", 5);
    expect(r.available).toBe(true);
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys[0]).toBe("both"); // appears in both → highest RRF score
    // Both single-source candidates should still appear, just lower.
    expect(keys).toContain("bmOnly");
    expect(keys).toContain("vecOnly");
    const bothHit = r.results!.find((h) => h.entry.key === "both")!;
    expect(bothHit.rank_bm).not.toBeNull();
    expect(bothHit.rank_vec).not.toBeNull();
  });

  it("RRF score for a both-source rank-1 hit equals 2 / (RRF_K + 1)", async () => {
    const e = entry({ key: "x", name: "kyoto temple" });
    semanticState.index = { entries: [e] };
    semanticState.semantic = {
      available: true,
      results: [{ score: 0.9, entry: e }],
    };
    const r = await hybridSearch(uniqRoot(), "kyoto", 1);
    expect(r.results).toHaveLength(1);
    const expected = Number((2 / (60 + 1)).toFixed(5));
    expect(r.results![0].score).toBeCloseTo(expected, 5);
    expect(r.results![0].rank_bm).toBe(1);
    expect(r.results![0].rank_vec).toBe(1);
  });

  it("ignores semantic results whose key is not in the BM index", async () => {
    const inBm = entry({ key: "in-bm", name: "kyoto" });
    const ghost = entry({ key: "ghost", name: "ghost-not-in-bm" });
    semanticState.index = { entries: [inBm] }; // ghost intentionally absent
    semanticState.semantic = {
      available: true,
      results: [
        { score: 0.9, entry: ghost },
        { score: 0.8, entry: inBm },
      ],
    };
    const r = await hybridSearch(uniqRoot(), "kyoto", 5);
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toEqual(["in-bm"]);
  });
});

// ─── hybridSearch — filters ──────────────────────────────────────────

describe("hybridSearch — filter by prefecture_code", () => {
  it("excludes BM25 candidates whose prefecture_code does not match the filter", async () => {
    semanticState.index = {
      entries: [
        entry({
          key: "tokyo-edo",
          name: "edo museum",
          prefecture_code: "13",
        }),
        entry({
          key: "kyoto-edo",
          name: "edo exhibit",
          prefecture_code: "26",
        }),
      ],
    };
    const r = await hybridSearch(uniqRoot(), "edo", 5, {
      prefecture_code: "13",
    });
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toEqual(["tokyo-edo"]);
    expect(r.bm_count).toBe(1);
  });

  it("does not exclude entries with null prefecture_code (filter is not strict)", async () => {
    semanticState.index = {
      entries: [
        entry({ key: "no-pref", name: "edo museum", prefecture_code: null }),
        entry({
          key: "wrong-pref",
          name: "edo exhibit",
          prefecture_code: "26",
        }),
      ],
    };
    const r = await hybridSearch(uniqRoot(), "edo", 5, {
      prefecture_code: "13",
    });
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toContain("no-pref");
    expect(keys).not.toContain("wrong-pref");
  });
});

describe("hybridSearch — filter by kind", () => {
  it("keeps only entries whose kind matches", async () => {
    semanticState.index = {
      entries: [
        entry({ key: "spot1", name: "Edo Museum", kind: "spot" }),
        entry({ key: "wd1", name: "Edo Exhibit", kind: "wikidata" }),
      ],
    };
    const r = await hybridSearch(uniqRoot(), "edo", 5, { kind: "spot" });
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toEqual(["spot1"]);
  });
});

// ─── BM25 ranking sanity ─────────────────────────────────────────────

describe("BM25 ranking (via hybridSearch)", () => {
  it("ranks an exact-name match above a generic term match", async () => {
    semanticState.index = {
      entries: [
        entry({
          key: "specific",
          name: "金閣寺", // contains 金閣
          description: "京都の有名なお寺",
        }),
        entry({
          key: "generic",
          name: "京都のお寺",
          description: "観光地",
        }),
      ],
    };
    const r = await hybridSearch(uniqRoot(), "金閣寺", 5);
    expect(r.results![0].entry.key).toBe("specific");
  });

  it("indexes name + description + prefecture_name + municipality", async () => {
    semanticState.index = {
      entries: [
        entry({
          key: "via-muni",
          name: "City Hall",
          municipality: "Sapporo",
        }),
        entry({
          key: "via-pref",
          name: "Tower",
          prefecture_name: "Hokkaido",
        }),
        entry({
          key: "via-desc",
          name: "Park",
          description: "famous tokyo park",
        }),
      ],
    };
    const sapporo = await hybridSearch(uniqRoot(), "sapporo", 5);
    expect(sapporo.results!.map((h) => h.entry.key)).toContain("via-muni");

    const hokkaido = await hybridSearch(uniqRoot(), "hokkaido", 5);
    expect(hokkaido.results!.map((h) => h.entry.key)).toContain("via-pref");

    const tokyo = await hybridSearch(uniqRoot(), "tokyo", 5);
    expect(tokyo.results!.map((h) => h.entry.key)).toContain("via-desc");
  });
});

