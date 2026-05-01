import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { f16ToF32, tryLoadSemanticIndex } from "../../src/lib/semantic.js";

// ─── f16ToF32: IEEE 754 half-precision reference values ───────────────
//
// These bit patterns come straight from the IEEE 754 binary16 spec.
// f16ToF32 is hot-path code that runs once per stored vector at load
// time (~70k * 384 = ~27M values), so a silent bug here would corrupt
// the entire embedding index.

describe("f16ToF32 — special values", () => {
  it("decodes positive zero", () => {
    const v = f16ToF32(0x0000);
    expect(v).toBe(0);
    // +0 vs -0: 1/+0 === +Infinity
    expect(1 / v).toBe(Infinity);
  });

  it("decodes negative zero (preserves the sign bit)", () => {
    const v = f16ToF32(0x8000);
    expect(Object.is(v, -0)).toBe(true);
    expect(1 / v).toBe(-Infinity);
  });

  it("decodes positive infinity", () => {
    expect(f16ToF32(0x7c00)).toBe(Infinity);
  });

  it("decodes negative infinity", () => {
    expect(f16ToF32(0xfc00)).toBe(-Infinity);
  });

  it("decodes NaN (any non-zero mantissa with exp = 0x1f)", () => {
    expect(Number.isNaN(f16ToF32(0x7e00))).toBe(true);
    expect(Number.isNaN(f16ToF32(0x7c01))).toBe(true);
    expect(Number.isNaN(f16ToF32(0xffff))).toBe(true);
  });
});

describe("f16ToF32 — normal values", () => {
  it("decodes 1.0", () => {
    expect(f16ToF32(0x3c00)).toBe(1.0);
  });

  it("decodes -1.0", () => {
    expect(f16ToF32(0xbc00)).toBe(-1.0);
  });

  it("decodes 0.5 and 2.0 (powers of two)", () => {
    expect(f16ToF32(0x3800)).toBe(0.5);
    expect(f16ToF32(0x4000)).toBe(2.0);
    expect(f16ToF32(0xc000)).toBe(-2.0);
  });

  it("decodes the largest finite half (65504)", () => {
    expect(f16ToF32(0x7bff)).toBe(65504);
    expect(f16ToF32(0xfbff)).toBe(-65504);
  });

  it("decodes intermediate values exactly", () => {
    // 0x3555 = 0 01101 0101010101 → 1.333...×2^(13-15) = 0.333251953125
    expect(f16ToF32(0x3555)).toBeCloseTo(0.333251953125, 10);
    // 0x3C01 = 0 01111 0000000001 → (1 + 1/1024) * 2^0 = 1.0009765625
    expect(f16ToF32(0x3c01)).toBe(1.0009765625);
  });
});

describe("f16ToF32 — subnormal (denormal) values", () => {
  it("decodes the smallest positive subnormal (2^-24)", () => {
    // 0x0001 = 1 * 2^-24 ≈ 5.96e-8
    expect(f16ToF32(0x0001)).toBe(Math.pow(2, -24));
  });

  it("decodes 2^-23 (next subnormal)", () => {
    expect(f16ToF32(0x0002)).toBe(Math.pow(2, -23));
  });

  it("decodes the largest subnormal (just below the smallest normal)", () => {
    // 0x03FF = 1023 * 2^-24
    expect(f16ToF32(0x03ff)).toBe(1023 * Math.pow(2, -24));
  });

  it("decodes negative subnormals with the correct sign", () => {
    expect(f16ToF32(0x8001)).toBe(-Math.pow(2, -24));
    expect(f16ToF32(0x83ff)).toBe(-1023 * Math.pow(2, -24));
  });

  it("decodes the smallest normal (2^-14) via the normal-exp branch", () => {
    // 0x0400 = 0 00001 0000000000 → 1 * 2^-14
    expect(f16ToF32(0x0400)).toBe(Math.pow(2, -14));
  });
});

// ─── tryLoadSemanticIndex: integration paths ──────────────────────────

// Must match the DIM constant in src/lib/semantic.ts. The model is
// multilingual-e5-small (384 dims). If the model changes, this and
// semantic.ts both need to update.
const DIM = 384;

const entry = (key: string) => ({
  key,
  kind: "spot" as const,
  source: "test",
  name: key,
});

async function withTempRoot(fn: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "jtm-semantic-test-"));
  try {
    await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeIndex(
  root: string,
  index: unknown,
  bin: Uint16Array,
): Promise<void> {
  const dir = resolve(root, "embeddings");
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, "spots.index.json"), JSON.stringify(index));
  await writeFile(
    resolve(dir, "spots.f16.bin"),
    Buffer.from(bin.buffer, bin.byteOffset, bin.byteLength),
  );
}

describe("tryLoadSemanticIndex — error paths", () => {
  it("returns null when the embeddings dir does not exist", () =>
    withTempRoot(async (root) => {
      expect(await tryLoadSemanticIndex(root)).toBeNull();
    }));

  it("returns null when the JSON declares a wrong dim", () =>
    withTempRoot(async (root) => {
      await writeIndex(
        root,
        {
          model: "x",
          dim: 256, // ← wrong
          dtype: "f16",
          count: 1,
          built_at: "now",
          entries: [entry("a")],
        },
        new Uint16Array(256),
      );
      expect(await tryLoadSemanticIndex(root)).toBeNull();
    }));

  it("returns null when bin and idx counts don't match", () =>
    withTempRoot(async (root) => {
      await writeIndex(
        root,
        {
          model: "x",
          dim: DIM,
          dtype: "f16",
          count: 2, // claims 2
          built_at: "now",
          entries: [entry("a"), entry("b")],
        },
        new Uint16Array(DIM), // but only 1 vector worth of u16
      );
      expect(await tryLoadSemanticIndex(root)).toBeNull();
    }));

  it("returns null when the JSON is malformed", () =>
    withTempRoot(async (root) => {
      const dir = resolve(root, "embeddings");
      await mkdir(dir, { recursive: true });
      await writeFile(resolve(dir, "spots.index.json"), "{not json");
      await writeFile(resolve(dir, "spots.f16.bin"), Buffer.alloc(0));
      expect(await tryLoadSemanticIndex(root)).toBeNull();
    }));
});

describe("tryLoadSemanticIndex — happy path", () => {
  it("loads the index, decodes f16 → f32, and reports the metadata", () =>
    withTempRoot(async (root) => {
      // 1 entry with a full DIM-vector. Most cells are 0; a few have known
      // f16 patterns so we can verify the f16→f32 path end-to-end.
      const buf = new Uint16Array(DIM);
      buf[0] = 0x3c00; // 1.0
      buf[1] = 0xbc00; // -1.0
      buf[2] = 0x3800; // 0.5
      buf[3] = 0x0001; // smallest subnormal
      buf[4] = 0x7c00; // +Infinity
      await writeIndex(
        root,
        {
          model: "Xenova/multilingual-e5-small",
          dim: DIM,
          dtype: "f16",
          count: 1,
          built_at: "2026-05-01T00:00:00Z",
          entries: [entry("spot:a")],
        },
        buf,
      );

      const out = await tryLoadSemanticIndex(root);
      expect(out).not.toBeNull();
      expect(out!.count).toBe(1);
      expect(out!.builtAt).toBe("2026-05-01T00:00:00Z");
      expect(out!.entries).toHaveLength(1);
      expect(out!.entries[0].key).toBe("spot:a");
      expect(out!.matrix).toHaveLength(DIM);
      expect(out!.matrix[0]).toBe(1.0);
      expect(out!.matrix[1]).toBe(-1.0);
      expect(out!.matrix[2]).toBe(0.5);
      expect(out!.matrix[3]).toBe(Math.pow(2, -24));
      expect(out!.matrix[4]).toBe(Infinity);
      // Untouched cells decode to +0.
      expect(out!.matrix[5]).toBe(0);
    }));

  it("caches by dataRoot — second call returns the same object", () =>
    withTempRoot(async (root) => {
      await writeIndex(
        root,
        {
          model: "x",
          dim: DIM,
          dtype: "f16",
          count: 0,
          built_at: "now",
          entries: [],
        },
        new Uint16Array(0),
      );
      const a = await tryLoadSemanticIndex(root);
      const b = await tryLoadSemanticIndex(root);
      expect(a).not.toBeNull();
      expect(b).toBe(a); // identity, not just equality
    }));

  it("does not return a stale cached index when called with a different root", () =>
    withTempRoot(async (rootA) =>
      withTempRoot(async (rootB) => {
        // Each root has 1 entry with a different key. The cache is keyed
        // by dataRoot, so calling with rootB after rootA must NOT return
        // rootA's cached payload.
        const binA = new Uint16Array(DIM);
        const binB = new Uint16Array(DIM);
        await writeIndex(
          rootA,
          {
            model: "x",
            dim: DIM,
            dtype: "f16",
            count: 1,
            built_at: "now",
            entries: [entry("spot:from-A")],
          },
          binA,
        );
        await writeIndex(
          rootB,
          {
            model: "x",
            dim: DIM,
            dtype: "f16",
            count: 1,
            built_at: "now",
            entries: [entry("spot:from-B")],
          },
          binB,
        );

        const a = await tryLoadSemanticIndex(rootA);
        const b = await tryLoadSemanticIndex(rootB);
        expect(a!.entries[0].key).toBe("spot:from-A");
        expect(b!.entries[0].key).toBe("spot:from-B");
        expect(a).not.toBe(b);
      }),
    ));
});
