import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock semantic.js BEFORE importing hybrid.ts so that hybrid's internal
// imports of tryLoadSemanticIndex / semanticSearch resolve to our stubs.
// vi.mock is hoisted to the top of the module by vitest.
vi.mock("../../src/lib/semantic.js", () => ({
  tryLoadSemanticIndex: vi.fn(),
  semanticSearch: vi.fn(),
}));

import { tokenize, hybridSearch } from "../../src/lib/hybrid.js";
import {
  tryLoadSemanticIndex,
  semanticSearch,
  type SemanticEntry,
} from "../../src/lib/semantic.js";

const mockedLoad = vi.mocked(tryLoadSemanticIndex);
const mockedSearch = vi.mocked(semanticSearch);

// Each test uses a unique dataRoot so hybrid's per-root BM cache never
// leaks state between tests. (Module-level `cachedBm` is keyed by root.)
let rootCounter = 0;
function uniqueRoot(): string {
  rootCounter += 1;
  return `/tmp/jtm-hybrid-test-${rootCounter}`;
}

function entry(
  key: string,
  name: string,
  extras: Partial<SemanticEntry> = {},
): SemanticEntry {
  return {
    key,
    kind: "spot",
    source: "test",
    name,
    description: null,
    prefecture_code: null,
    prefecture_name: null,
    municipality: null,
    url: null,
    ...extras,
  };
}

// Build a SemanticIndex-shaped payload for tryLoadSemanticIndex's mock.
// Hybrid only reads `entries` from this object; matrix / count / builtAt
// are filled with placeholder values that satisfy the structural type.
function loadedIndex(entries: SemanticEntry[]) {
  return {
    entries,
    matrix: new Float32Array(0),
    count: entries.length,
    builtAt: "2026-05-01T00:00:00Z",
  };
}

const NO_VECTOR_RESULTS = { available: true as const, results: [] };

beforeEach(() => {
  mockedLoad.mockReset();
  mockedSearch.mockReset();
});

// ─── tokenize ─────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("returns empty array for empty / falsy input", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("lowercases and splits Latin words on non-alnum", () => {
    expect(tokenize("Tokyo Tower")).toEqual(["tokyo", "tower"]);
    expect(tokenize("KYOTO-station")).toEqual(["kyoto", "station"]);
  });

  it("drops Latin tokens shorter than 2 chars", () => {
    // "a b c" — every word is length 1 → filtered.
    expect(tokenize("a b c")).toEqual([]);
    // "ab" stays; "x" drops; "yz" stays.
    expect(tokenize("ab x yz")).toEqual(["ab", "yz"]);
  });

  it("keeps alphanumeric runs as a single token", () => {
    expect(tokenize("test123")).toEqual(["test123"]);
    expect(tokenize("R2-D2")).toEqual(["r2", "d2"]);
  });

  it("emits CJK unigrams + bigrams for hiragana / katakana / kanji", () => {
    // 5 CJK chars → 5 unigrams + 4 bigrams, interleaved as
    // [c0, c0c1, c1, c1c2, c2, c2c3, c3, c3c4, c4]
    expect(tokenize("東京タワー")).toEqual([
      "東",
      "東京",
      "京",
      "京タ",
      "タ",
      "タワ",
      "ワ",
      "ワー",
      "ー",
    ]);
  });

  it("emits unigram only for a 1-char CJK run", () => {
    expect(tokenize("祭")).toEqual(["祭"]);
  });

  it("handles mixed Latin + CJK in document order", () => {
    expect(tokenize("Tokyo東京")).toEqual(["tokyo", "東", "東京", "京"]);
    expect(tokenize("東京Tower")).toEqual(["東", "東京", "京", "tower"]);
  });

  it("ignores characters outside CJK and Latin alnum (e.g. Hangul)", () => {
    // Hangul block (0xAC00-0xD7AF) is intentionally NOT in isCjk(); those
    // chars should be skipped entirely. Only the Latin survives here.
    expect(tokenize("Tokyo 한국")).toEqual(["tokyo"]);
  });

  it("breaks CJK runs on ASCII punctuation", () => {
    // ASCII comma is neither CJK nor [a-z0-9] → drops it, ends one run and
    // starts another. Each run produces unigrams + intra-run bigrams; no
    // bigram crosses the boundary.
    expect(tokenize("東京,京都")).toEqual([
      "東",
      "東京",
      "京",
      "京",
      "京都",
      "都",
    ]);
  });

  it("treats KATAKANA MIDDLE DOT (U+30FB) as part of the CJK run", () => {
    // "・" sits inside the 0x3040–0x30FF block that isCjk() accepts, so the
    // tokenizer doesn't split on it — it forms bigrams with its neighbours.
    // Documenting current behavior; if the tokenizer is upgraded (e.g. to
    // kuromoji.js in Phase 3-full), this test will tell us.
    expect(tokenize("東京・京都")).toEqual([
      "東",
      "東京",
      "京",
      "京・",
      "・",
      "・京",
      "京",
      "京都",
      "都",
    ]);
  });
});

// ─── hybridSearch: degraded mode ──────────────────────────────────────

describe("hybridSearch — embeddings unavailable", () => {
  it("reports embeddings_not_built when semantic index is missing", async () => {
    const root = uniqueRoot();
    mockedLoad.mockResolvedValueOnce(null);

    const out = await hybridSearch(root, "祭", 5);

    expect(out.available).toBe(false);
    expect(out.reason).toBe("embeddings_not_built");
    expect(out.query).toBe("祭");
    expect(out.k).toBe(5);
    // Index load happens once for this root; no fallback duplicate calls.
    expect(mockedLoad).toHaveBeenCalledTimes(1);
    expect(mockedLoad).toHaveBeenCalledWith(root);
    // Vector retriever must NOT be consulted when BM build failed.
    expect(mockedSearch).not.toHaveBeenCalled();
  });
});

// ─── hybridSearch: end-to-end with mocked semantic backend ────────────

describe("hybridSearch — RRF fusion", () => {
  it("returns top-k merged by reciprocal rank fusion", async () => {
    const entries: SemanticEntry[] = [
      entry("spot:a", "東京タワー", { prefecture_code: "13" }),
      entry("spot:b", "京都駅", { prefecture_code: "26" }),
      entry("spot:c", "大阪城", { prefecture_code: "27" }),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    // Vector retriever ranks: c, a, b
    mockedSearch.mockResolvedValueOnce({
      available: true,
      results: [
        { score: 0.9, entry: entries[2] },
        { score: 0.8, entry: entries[0] },
        { score: 0.1, entry: entries[1] },
      ],
    });

    const out = await hybridSearch(uniqueRoot(), "京都", 3);

    expect(out.available).toBe(true);
    // Query "京都" tokenizes to 京 / 京都 / 都. Only "東京タワー" (via 京)
    // and "京都駅" (via all three) hit the BM postings. "大阪城" has no
    // overlap → BM returns 2, vector returns 3, RRF union returns 3.
    expect(out.bm_count).toBe(2);
    expect(out.vec_count).toBe(3);
    expect(out.results).toHaveLength(3);
    // 京都駅 should win because it's BM rank 1 (only doc with bigram "京都")
    // AND it's also in the vector list.
    const top = out.results![0];
    expect(top.entry.key).toBe("spot:b");
    expect(top.rank_bm).toBe(1);
    expect(top.rank_vec).toBe(3);
  });

  it("merges entries that appear in only one retriever", async () => {
    const entries: SemanticEntry[] = [
      entry("spot:onlyBm", "祭祭祭"),
      entry("spot:onlyVec", "irrelevant"),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    mockedSearch.mockResolvedValueOnce({
      available: true,
      results: [{ score: 0.5, entry: entries[1] }],
    });

    const out = await hybridSearch(uniqueRoot(), "祭", 5);

    const keys = (out.results ?? []).map((r) => r.entry.key);
    expect(keys).toContain("spot:onlyBm");
    expect(keys).toContain("spot:onlyVec");

    const bmOnly = out.results!.find((r) => r.entry.key === "spot:onlyBm")!;
    expect(bmOnly.rank_bm).toBe(1);
    expect(bmOnly.rank_vec).toBeNull();

    const vecOnly = out.results!.find((r) => r.entry.key === "spot:onlyVec")!;
    expect(vecOnly.rank_bm).toBeNull();
    expect(vecOnly.rank_vec).toBe(1);
  });

  it("respects the k limit on the merged result", async () => {
    const entries: SemanticEntry[] = Array.from({ length: 6 }, (_, i) =>
      entry(`spot:${i}`, `祭${i}`),
    );
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const out = await hybridSearch(uniqueRoot(), "祭", 2);

    expect(out.results!.length).toBe(2);
  });

  it("survives when the vector retriever is unavailable", async () => {
    const entries: SemanticEntry[] = [
      entry("spot:a", "東京タワー"),
      entry("spot:b", "京都駅"),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    // semanticSearch may return unavailable independently of the index load.
    mockedSearch.mockResolvedValueOnce({
      available: false,
      reason: "extractor_unavailable",
    });

    const out = await hybridSearch(uniqueRoot(), "京都", 5);

    expect(out.available).toBe(true);
    expect(out.vec_count).toBe(0);
    // BM still produces a result.
    expect(out.results!.length).toBeGreaterThan(0);
    expect(out.results![0].rank_vec).toBeNull();
  });
});

// ─── hybridSearch: filters ────────────────────────────────────────────

describe("hybridSearch — filters", () => {
  it("filters BM candidates by prefecture_code", async () => {
    const entries: SemanticEntry[] = [
      entry("spot:tokyo", "京都パーク", { prefecture_code: "13" }),
      entry("spot:kyoto", "京都駅", { prefecture_code: "26" }),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const out = await hybridSearch(uniqueRoot(), "京都", 5, {
      prefecture_code: "26",
    });

    const keys = (out.results ?? []).map((r) => r.entry.key);
    expect(keys).toEqual(["spot:kyoto"]);
  });

  it("filters BM candidates by kind", async () => {
    const entries: SemanticEntry[] = [
      entry("spot:s", "京都駅", { kind: "spot" }),
      entry("wd:Q1", "京都駅", { kind: "wikidata" }),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const out = await hybridSearch(uniqueRoot(), "京都", 5, {
      kind: "wikidata",
    });

    const keys = (out.results ?? []).map((r) => r.entry.key);
    expect(keys).toEqual(["wd:Q1"]);
  });

  it("keeps entries with null prefecture_code through the prefecture filter", async () => {
    // Per hybrid.ts:203 — `e.prefecture_code &&` short-circuit means entries
    // missing a prefecture_code are NOT dropped (we don't have a strong reason
    // to exclude them). Pin that behavior.
    const entries: SemanticEntry[] = [
      entry("spot:nullPref", "京都駅", { prefecture_code: null }),
      entry("spot:wrongPref", "京都駅", { prefecture_code: "13" }),
    ];
    mockedLoad.mockResolvedValueOnce(loadedIndex(entries));
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const out = await hybridSearch(uniqueRoot(), "京都", 5, {
      prefecture_code: "26",
    });

    const keys = (out.results ?? []).map((r) => r.entry.key);
    expect(keys).toContain("spot:nullPref");
    expect(keys).not.toContain("spot:wrongPref");
  });

  it("forwards filter to the vector retriever", async () => {
    mockedLoad.mockResolvedValueOnce(
      loadedIndex([entry("spot:a", "京都駅", { prefecture_code: "26" })]),
    );
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const filter = { prefecture_code: "26" };
    await hybridSearch(uniqueRoot(), "京都", 5, filter);

    expect(mockedSearch).toHaveBeenCalledTimes(1);
    const args = mockedSearch.mock.calls[0];
    expect(args[1]).toBe("京都");
    expect(args[3]).toEqual(filter);
  });
});

// ─── hybridSearch: result shape ───────────────────────────────────────

describe("hybridSearch — result shape", () => {
  it("rounds the RRF score to exactly 5 decimal places", async () => {
    // One entry, BM rank 1, no vector contribution → RRF = 1 / (60 + 1) = 1/61.
    // After Number(score.toFixed(5)) the value must be exactly 0.01639.
    mockedLoad.mockResolvedValueOnce(loadedIndex([entry("spot:a", "祭")]));
    mockedSearch.mockResolvedValueOnce(NO_VECTOR_RESULTS);

    const out = await hybridSearch(uniqueRoot(), "祭", 1);

    expect(out.results![0].score).toBe(0.01639);
  });
});
