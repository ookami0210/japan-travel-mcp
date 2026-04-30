/**
 * Semantic search backend.
 *
 * At server start we lazy-load the prebuilt embedding binary
 * (`data/embeddings/spots.f16.bin`) and the matching index json. At query
 * time we embed the query string with the same model and compute cosine
 * similarity against the in-memory matrix.
 *
 * This is intentionally minimal: no FAISS, no ANN. With ~70k entries × 384
 * dims × float16 the binary fits in ~50MB and a brute-force cosine pass
 * runs in ~30-60ms on Apple Silicon. We can graduate to HNSW later.
 *
 * Phase 2 of the search-quality push (2026-05-01).
 */
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DIM = 384;
const MODEL_ID = "Xenova/multilingual-e5-small";

export interface SemanticEntry {
  key: string;
  kind: "spot" | "wikidata" | "r3";
  source: string;
  name: string;
  description?: string | null;
  prefecture_code?: string | null;
  prefecture_name?: string | null;
  municipality?: string | null;
  url?: string | null;
}

interface IndexFile {
  model: string;
  dim: number;
  dtype: "f16";
  count: number;
  built_at: string;
  entries: SemanticEntry[];
}

interface SemanticIndex {
  entries: SemanticEntry[];
  matrix: Float32Array; // count × DIM, row-major
  count: number;
  builtAt: string;
}

let cachedIndex: SemanticIndex | null = null;
let cachedRoot: string | null = null;
let extractor: ((inputs: string[], opts: unknown) => Promise<{ data: Float32Array; dims: number[] }>) | null = null;

function f16ToF32(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h & 0x7c00) >> 10;
  const mantissa = h & 0x03ff;
  let bits: number;
  if (exp === 0) {
    if (mantissa === 0) bits = sign;
    else {
      // subnormal — normalise
      let m = mantissa;
      let e = -1;
      do {
        m <<= 1;
        e++;
      } while ((m & 0x0400) === 0);
      bits = sign | ((127 - 15 - e) << 23) | ((m & 0x03ff) << 13);
    }
  } else if (exp === 0x1f) {
    bits = sign | 0x7f800000 | (mantissa << 13);
  } else {
    bits = sign | ((exp + (127 - 15)) << 23) | (mantissa << 13);
  }
  const u = new Uint32Array(1);
  u[0] = bits;
  return new Float32Array(u.buffer)[0];
}

export async function tryLoadSemanticIndex(
  dataRoot: string,
): Promise<SemanticIndex | null> {
  // Re-use cached index only when called against the same root. The MCP server
  // tries multiple roots (HF cache, repo-local) so the cache key matters.
  if (cachedIndex && cachedRoot === dataRoot) return cachedIndex;
  const idxPath = resolve(dataRoot, "embeddings/spots.index.json");
  const binPath = resolve(dataRoot, "embeddings/spots.f16.bin");
  if (!existsSync(idxPath) || !existsSync(binPath)) {
    return null;
  }
  try {
    const idx = JSON.parse(await readFile(idxPath, "utf8")) as IndexFile;
    if (idx.dim !== DIM) throw new Error(`dim mismatch: ${idx.dim} vs ${DIM}`);
    const buf = await readFile(binPath);
    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    if (u16.length !== idx.count * DIM) {
      throw new Error(
        `bin/idx mismatch: ${u16.length} u16 vs ${idx.count * DIM} expected`,
      );
    }
    const matrix = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) matrix[i] = f16ToF32(u16[i]);
    cachedIndex = {
      entries: idx.entries,
      matrix,
      count: idx.count,
      builtAt: idx.built_at,
    };
    cachedRoot = dataRoot;
    return cachedIndex;
  } catch {
    return null;
  }
}

async function ensureExtractor(): Promise<typeof extractor> {
  if (extractor) return extractor;
  // Lazy import — keeps startup fast for users who never call search_semantic.
  const mod = await import("@huggingface/transformers");
  mod.env.allowLocalModels = false;
  const pipe = await mod.pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  extractor = pipe as unknown as typeof extractor;
  return extractor;
}

export async function semanticSearch(
  dataRoot: string,
  query: string,
  k: number,
  filter?: { prefecture_code?: string | null; kind?: string | null },
): Promise<{
  available: boolean;
  reason?: string;
  results?: { score: number; entry: SemanticEntry }[];
  built_at?: string;
  count?: number;
}> {
  const idx = await tryLoadSemanticIndex(dataRoot);
  if (!idx) {
    return {
      available: false,
      reason: "embeddings_not_built",
    };
  }
  const ext = await ensureExtractor();
  if (!ext) return { available: false, reason: "extractor_unavailable" };
  const out = await ext(["query: " + query.slice(0, 512)], { pooling: "mean", normalize: true });
  const q = out.data; // length = DIM (single batch row)
  const N = idx.count;
  const M = idx.matrix;
  const heap: { score: number; entryIdx: number }[] = [];
  for (let i = 0; i < N; i++) {
    const e = idx.entries[i];
    if (filter?.prefecture_code && e.prefecture_code && e.prefecture_code !== filter.prefecture_code) continue;
    if (filter?.kind && e.kind !== filter.kind) continue;
    let s = 0;
    const off = i * DIM;
    for (let c = 0; c < DIM; c++) s += q[c] * M[off + c];
    if (heap.length < k) {
      heap.push({ score: s, entryIdx: i });
      heap.sort((a, b) => a.score - b.score);
    } else if (s > heap[0].score) {
      heap[0] = { score: s, entryIdx: i };
      heap.sort((a, b) => a.score - b.score);
    }
  }
  heap.sort((a, b) => b.score - a.score);
  return {
    available: true,
    built_at: idx.builtAt,
    count: idx.count,
    results: heap.map((h) => ({ score: h.score, entry: idx.entries[h.entryIdx] })),
  };
}
