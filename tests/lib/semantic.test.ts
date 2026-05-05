import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeSemanticEntry } from "./_helpers.js";

// ─── Mock @huggingface/transformers ──────────────────────────────────
//
// semantic.ts lazy-imports this module and runs a feature-extraction
// pipeline. We replace it with a deterministic stub so tests stay offline
// and finish in milliseconds.
//
// The mock returns whatever vector `mockState.queryVec` is set to, padded /
// truncated to DIM=384 dims. That lets every test pick its own query
// embedding to compute cosine scores against fixture entries.

const DIM = 384;

const mockState: {
  queryVec: Float32Array;
  pipelineCalls: number;
  extractorCalls: { input: unknown; opts: unknown }[];
} = {
  queryVec: new Float32Array(DIM),
  pipelineCalls: 0,
  extractorCalls: [],
};

vi.mock("@huggingface/transformers", () => ({
  env: { allowLocalModels: true }, // semantic.ts will set this to false
  pipeline: vi.fn(async () => {
    mockState.pipelineCalls++;
    return async (input: unknown, opts: unknown) => {
      mockState.extractorCalls.push({ input, opts });
      // Pad/truncate to DIM.
      const out = new Float32Array(DIM);
      const src = mockState.queryVec;
      for (let i = 0; i < Math.min(src.length, DIM); i++) out[i] = src[i];
      return { data: out, dims: [1, DIM] };
    };
  }),
}));

import {
  tryLoadSemanticIndex,
  semanticSearch,
} from "../../src/lib/semantic.js";

// ─── f16 fixture helpers ─────────────────────────────────────────────
//
// We don't reach into the f16ToF32 internals — instead we synthesise a
// .f16.bin from known half-float bit patterns and assert on the f32 matrix
// that tryLoadSemanticIndex materialises. That covers the conversion path
// table-style without exporting private helpers.
//
// Half-float bit patterns used here:
//   0x3c00 = +1.0,  0x4000 = +2.0,  0x4200 = +3.0
//   0xbc00 = -1.0,  0xc000 = -2.0,  0x3800 = +0.5
//   0x0000 = +0,    0x8000 = -0
//   0x7c00 = +Inf,  0xfc00 = -Inf
//   0x0001 = smallest positive subnormal (2^-24)

function buildBin(rows: number[][]): Buffer {
  const buf = Buffer.alloc(rows.length * DIM * 2);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    for (let j = 0; j < DIM; j++) {
      buf.writeUInt16LE(row[j] ?? 0x0000, (i * DIM + j) * 2);
    }
  }
  return buf;
}

async function writeFixture(
  dir: string,
  bin: Buffer,
  index: object,
): Promise<void> {
  await mkdir(join(dir, "embeddings"), { recursive: true });
  await writeFile(join(dir, "embeddings", "spots.f16.bin"), bin);
  await writeFile(
    join(dir, "embeddings", "spots.index.json"),
    JSON.stringify(index),
  );
}

// Alias for the shared builder so existing call sites stay short.
const fixtureEntry = makeSemanticEntry;

// ─── Module cache reset ──────────────────────────────────────────────
//
// semantic.ts caches both the loaded index (keyed by dataRoot) and the
// extractor (singleton). Each test uses a fresh tmp directory so the cache
// key always changes — we never read a stale cache.

let tmpRoots: string[] = [];

async function mkRoot(): Promise<string> {
  const d = await mkdtemp(join(tmpdir(), "jtm-semantic-"));
  tmpRoots.push(d);
  return d;
}

/**
 * Write a self-consistent embeddings fixture (`spots.f16.bin` +
 * `spots.index.json`) under a fresh tmp root and load it. Throws if the
 * loader rejects the fixture — tests of the failure path use writeFixture
 * directly instead.
 */
async function loadF16Fixture(rows: number[][]): Promise<NonNullable<Awaited<ReturnType<typeof tryLoadSemanticIndex>>>> {
  const root = await mkRoot();
  const entries = rows.map((_, i) => fixtureEntry({ key: `k${i}`, name: `n${i}` }));
  await writeFixture(root, buildBin(rows), {
    model: "x",
    dim: DIM,
    dtype: "f16",
    count: rows.length,
    built_at: "now",
    entries,
  });
  const idx = await tryLoadSemanticIndex(root);
  if (!idx) throw new Error("loadF16Fixture: tryLoadSemanticIndex returned null");
  return idx;
}

beforeEach(() => {
  mockState.queryVec = new Float32Array(DIM);
  mockState.pipelineCalls = 0;
  mockState.extractorCalls = [];
});

afterEach(async () => {
  for (const d of tmpRoots) {
    await rm(d, { recursive: true, force: true });
  }
  tmpRoots = [];
});

// ─── tryLoadSemanticIndex — file presence ────────────────────────────

describe("tryLoadSemanticIndex — file presence", () => {
  it("returns null when neither file exists", async () => {
    const root = await mkRoot();
    const r = await tryLoadSemanticIndex(root);
    expect(r).toBeNull();
  });

  it("returns null when the index json exists but the bin does not", async () => {
    const root = await mkRoot();
    await mkdir(join(root, "embeddings"), { recursive: true });
    await writeFile(
      join(root, "embeddings", "spots.index.json"),
      JSON.stringify({ model: "x", dim: DIM, dtype: "f16", count: 0, built_at: "", entries: [] }),
    );
    const r = await tryLoadSemanticIndex(root);
    expect(r).toBeNull();
  });

  it("returns null on a dim mismatch", async () => {
    const root = await mkRoot();
    await writeFixture(root, buildBin([[]]), {
      model: "x",
      dim: 999,
      dtype: "f16",
      count: 1,
      built_at: "now",
      entries: [fixtureEntry({ key: "k", name: "n" })],
    });
    expect(await tryLoadSemanticIndex(root)).toBeNull();
  });

  it("returns null on a bin/index count mismatch", async () => {
    const root = await mkRoot();
    // bin has 1 row but index claims 2
    await writeFixture(root, buildBin([[0x3c00]]), {
      model: "x",
      dim: DIM,
      dtype: "f16",
      count: 2,
      built_at: "now",
      entries: [
        fixtureEntry({ key: "k1", name: "n1" }),
        fixtureEntry({ key: "k2", name: "n2" }),
      ],
    });
    expect(await tryLoadSemanticIndex(root)).toBeNull();
  });

  it("returns null on malformed index json", async () => {
    const root = await mkRoot();
    await mkdir(join(root, "embeddings"), { recursive: true });
    await writeFile(
      join(root, "embeddings", "spots.index.json"),
      "{not-valid-json",
    );
    await writeFile(
      join(root, "embeddings", "spots.f16.bin"),
      Buffer.alloc(DIM * 2),
    );
    expect(await tryLoadSemanticIndex(root)).toBeNull();
  });
});

// ─── tryLoadSemanticIndex — f16 → f32 conversion table ───────────────
//
// Each pair is (half-float bit pattern → expected f32 value). Cases that
// need richer assertions (signed zero via Object.is, subnormal via
// toBeCloseTo) live in dedicated tests below.

const F16_NORMAL_CASES: ReadonlyArray<[label: string, hex: number, expected: number]> = [
  ["+1.0", 0x3c00, 1.0],
  ["+2.0", 0x4000, 2.0],
  ["+3.0", 0x4200, 3.0],
  ["-1.0", 0xbc00, -1.0],
  ["-2.0", 0xc000, -2.0],
  ["+0.5", 0x3800, 0.5],
  ["+Inf", 0x7c00, Infinity],
  ["-Inf", 0xfc00, -Infinity],
];

describe("tryLoadSemanticIndex — f16 → f32 conversion", () => {
  it.each(F16_NORMAL_CASES)("decodes %s (0x%i)", async (_label, hex, expected) => {
    const idx = await loadF16Fixture([[hex]]);
    expect(idx.matrix[0]).toBe(expected);
  });

  it("decodes signed zeros (+0, -0)", async () => {
    const idx = await loadF16Fixture([[0x0000, 0x8000]]);
    expect(Object.is(idx.matrix[0], 0)).toBe(true); // +0
    expect(Object.is(idx.matrix[1], -0)).toBe(true); // -0
  });

  it("decodes the smallest positive subnormal (0x0001 → 2^-24)", async () => {
    const idx = await loadF16Fixture([[0x0001]]);
    expect(idx.matrix[0]).toBeCloseTo(Math.pow(2, -24), 30);
  });

  it("populates count + builtAt from the index json", async () => {
    const root = await mkRoot();
    await writeFixture(root, buildBin([[0x3c00]]), {
      model: "x",
      dim: DIM,
      dtype: "f16",
      count: 1,
      built_at: "2026-05-05T00:00:00Z",
      entries: [fixtureEntry({ key: "k", name: "n" })],
    });
    const idx = await tryLoadSemanticIndex(root);
    expect(idx!.count).toBe(1);
    expect(idx!.builtAt).toBe("2026-05-05T00:00:00Z");
    expect(idx!.entries[0].name).toBe("n");
  });
});

// ─── tryLoadSemanticIndex — caching ──────────────────────────────────

describe("tryLoadSemanticIndex — caching", () => {
  it("returns the same instance on repeated calls with the same root", async () => {
    const root = await mkRoot();
    await writeFixture(root, buildBin([[0x3c00]]), {
      model: "x",
      dim: DIM,
      dtype: "f16",
      count: 1,
      built_at: "now",
      entries: [fixtureEntry({ key: "k", name: "n" })],
    });
    const a = await tryLoadSemanticIndex(root);
    const b = await tryLoadSemanticIndex(root);
    expect(a).toBe(b);
  });
});

// ─── semanticSearch ──────────────────────────────────────────────────

describe("semanticSearch — availability", () => {
  it("returns available:false when no index is present", async () => {
    const root = await mkRoot();
    const r = await semanticSearch(root, "tokyo", 5);
    expect(r.available).toBe(false);
    expect(r.reason).toBe("embeddings_not_built");
  });
});

describe("semanticSearch — ranking", () => {
  // Set up a tiny matrix where the first dim is the only signal:
  //   entry0 = [+1, 0, 0, ...]
  //   entry1 = [ 0, 0, 0, ...]
  //   entry2 = [-1, 0, 0, ...]
  // and query embedding = [+1, 0, 0, ...]. Then cosine scores are exactly
  // 1, 0, -1 — easy to assert on.
  async function setupRanking(): Promise<string> {
    const root = await mkRoot();
    await writeFixture(
      root,
      buildBin([
        [0x3c00], // 1.0
        [0x0000], // 0.0
        [0xbc00], // -1.0
      ]),
      {
        model: "x",
        dim: DIM,
        dtype: "f16",
        count: 3,
        built_at: "now",
        entries: [
          fixtureEntry({
            key: "pos",
            name: "positive",
            prefecture_code: "13",
            kind: "spot",
          }),
          fixtureEntry({
            key: "zero",
            name: "zero",
            prefecture_code: "26",
            kind: "wikidata",
          }),
          fixtureEntry({
            key: "neg",
            name: "negative",
            prefecture_code: "13",
            kind: "spot",
          }),
        ],
      },
    );
    const q = new Float32Array(DIM);
    q[0] = 1;
    mockState.queryVec = q;
    return root;
  }

  it("orders results by descending cosine score", async () => {
    const root = await setupRanking();
    const r = await semanticSearch(root, "anything", 3);
    expect(r.available).toBe(true);
    expect(r.results).toHaveLength(3);
    expect(r.results![0].entry.key).toBe("pos");
    expect(r.results![1].entry.key).toBe("zero");
    expect(r.results![2].entry.key).toBe("neg");
    expect(r.results![0].score).toBeCloseTo(1, 5);
    expect(r.results![1].score).toBeCloseTo(0, 5);
    expect(r.results![2].score).toBeCloseTo(-1, 5);
  });

  it("respects the k parameter (top-1 returns only the best hit)", async () => {
    const root = await setupRanking();
    const r = await semanticSearch(root, "anything", 1);
    expect(r.results).toHaveLength(1);
    expect(r.results![0].entry.key).toBe("pos");
  });

  it("returns count + built_at on every available response", async () => {
    const root = await setupRanking();
    const r = await semanticSearch(root, "anything", 1);
    expect(r.count).toBe(3);
    expect(r.built_at).toBe("now");
  });

  it("filters by prefecture_code (drops non-matching entries)", async () => {
    const root = await setupRanking();
    const r = await semanticSearch(root, "anything", 5, {
      prefecture_code: "13",
    });
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toEqual(["pos", "neg"]);
  });

  it("filters by kind", async () => {
    const root = await setupRanking();
    const r = await semanticSearch(root, "anything", 5, { kind: "wikidata" });
    const keys = r.results!.map((h) => h.entry.key);
    expect(keys).toEqual(["zero"]);
  });

  it("passes the query through the extractor with the e5 prompt prefix", async () => {
    const root = await setupRanking();
    await semanticSearch(root, "tokyo tower", 1);
    expect(mockState.extractorCalls.length).toBeGreaterThanOrEqual(1);
    const call = mockState.extractorCalls[mockState.extractorCalls.length - 1];
    expect(call.input).toEqual(["query: tokyo tower"]);
    expect(call.opts).toEqual({ pooling: "mean", normalize: true });
  });

  it("truncates long queries to 512 chars before sending to the extractor", async () => {
    const root = await setupRanking();
    const longQuery = "a".repeat(1000);
    await semanticSearch(root, longQuery, 1);
    const call = mockState.extractorCalls[mockState.extractorCalls.length - 1];
    const sent = (call.input as string[])[0];
    expect(sent.startsWith("query: ")).toBe(true);
    expect(sent.length).toBe("query: ".length + 512);
  });

  it("creates the extractor pipeline only once across multiple queries", async () => {
    // semantic.ts caches the extractor at module scope (singleton). Loading
    // the multilingual-e5 model is expensive in production, so this test
    // pins the cache contract.
    //
    // Note: the singleton survives across tests within this file. We assert
    // that pipeline is called *at most* once after this test runs — earlier
    // tests may have warmed the cache, which is exactly the contract we
    // want to verify.
    const root = await setupRanking();
    const before = mockState.pipelineCalls;
    await semanticSearch(root, "q1", 1);
    await semanticSearch(root, "q2", 1);
    await semanticSearch(root, "q3", 1);
    const delta = mockState.pipelineCalls - before;
    expect(delta).toBeLessThanOrEqual(1);
    // Three queries → three extractor calls regardless of pipeline reuse.
    expect(mockState.extractorCalls.length).toBeGreaterThanOrEqual(3);
  });
});
