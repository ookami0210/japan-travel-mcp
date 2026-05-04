/**
 * Hybrid retrieval = BM25 (lexical) + multilingual-e5 (semantic) merged
 * with Reciprocal Rank Fusion. Phase 3-min of the search-quality push
 * (2026-05-01).
 *
 * Why both?
 *   - BM25 gives us perfect-score "exact name" matches that semantic search
 *     drowns in soft neighbours.
 *   - Semantic gives us paraphrase / cross-lingual recall that BM25 can't
 *     touch ("losing tradition" → "失われゆく職人技").
 *   - RRF is the cheapest fusion method that gets close to the best
 *     (Cormack et al.). No score calibration needed.
 *
 * Tokenizer: CJK char-bigrams plus Latin word splits. Coarser than
 * kuromoji but adds zero dictionary download (~100MB) and good-enough for
 * a launch-tap MVP. Graduates to kuromoji.js in Phase 3-full.
 */
import type { SemanticEntry } from "./semantic.js";
import { tryLoadSemanticIndex, semanticSearch } from "./semantic.js";

const RRF_K = 60; // Cormack default

interface BmEntry {
  idx: number;
  termFreqs: Map<string, number>;
  length: number;
}

interface BmIndex {
  entries: SemanticEntry[];
  postings: Map<string, BmEntry[]>;
  docFreq: Map<string, number>;
  avgLength: number;
  N: number;
  builtAt: string;
}

let cachedBm: BmIndex | null = null;
let cachedBmRoot: string | null = null;

function isCjk(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return (
    (c >= 0x3040 && c <= 0x30ff) || // hiragana / katakana
    (c >= 0x3400 && c <= 0x9fff) || // CJK unified
    (c >= 0xf900 && c <= 0xfaff)    // CJK compatibility
  );
}

/**
 * Tokenise into a mix of CJK character bigrams + Latin word stems.
 * Lower-cased Latin, raw CJK.
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const lower = text.toLowerCase();
  let i = 0;
  while (i < lower.length) {
    const ch = lower[i];
    if (isCjk(ch)) {
      // accumulate CJK run, emit unigrams + bigrams
      let j = i;
      while (j < lower.length && isCjk(lower[j])) j++;
      const run = lower.slice(i, j);
      for (let k = 0; k < run.length; k++) {
        out.push(run[k]);
        if (k + 1 < run.length) out.push(run[k] + run[k + 1]);
      }
      i = j;
    } else if (/[a-z0-9]/.test(ch)) {
      let j = i;
      while (j < lower.length && /[a-z0-9]/.test(lower[j])) j++;
      const tok = lower.slice(i, j);
      if (tok.length >= 2) out.push(tok);
      i = j;
    } else {
      i++;
    }
  }
  return out;
}

function buildBm(entries: SemanticEntry[]): BmIndex {
  const postings = new Map<string, BmEntry[]>();
  const docFreq = new Map<string, number>();
  const lengths: number[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const text = [
      e.name,
      e.description ?? "",
      e.prefecture_name ?? "",
      e.municipality ?? "",
    ].join(" ");
    const toks = tokenize(text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    const entry: BmEntry = { idx: i, termFreqs: tf, length: toks.length };
    lengths.push(toks.length);
    for (const t of tf.keys()) {
      let bucket = postings.get(t);
      if (!bucket) {
        bucket = [];
        postings.set(t, bucket);
      }
      bucket.push(entry);
      docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
    }
  }
  const avg = lengths.reduce((s, l) => s + l, 0) / Math.max(1, lengths.length);
  return {
    entries,
    postings,
    docFreq,
    avgLength: avg,
    N: entries.length,
    builtAt: new Date().toISOString(),
  };
}

export async function tryLoadBm(dataRoot: string): Promise<BmIndex | null> {
  if (cachedBm && cachedBmRoot === dataRoot) return cachedBm;
  const sem = await tryLoadSemanticIndex(dataRoot);
  if (!sem) return null;
  cachedBm = buildBm(sem.entries);
  cachedBmRoot = dataRoot;
  return cachedBm;
}

const BM_K1 = 1.2;
const BM_B = 0.75;

interface ScoredEntry {
  idx: number;
  score: number;
}

function scoreBm(idx: BmIndex, queryTokens: string[], k: number): ScoredEntry[] {
  const tfBoost = new Map<number, number>();
  const seenTerms = new Set<string>();
  for (const t of queryTokens) {
    if (seenTerms.has(t)) continue;
    seenTerms.add(t);
    const bucket = idx.postings.get(t);
    if (!bucket) continue;
    const df = idx.docFreq.get(t) ?? 1;
    const idf = Math.log(1 + (idx.N - df + 0.5) / (df + 0.5));
    for (const post of bucket) {
      const tf = post.termFreqs.get(t) ?? 0;
      const norm = (1 - BM_B) + BM_B * (post.length / (idx.avgLength || 1));
      const term = idf * ((tf * (BM_K1 + 1)) / (tf + BM_K1 * norm));
      tfBoost.set(post.idx, (tfBoost.get(post.idx) ?? 0) + term);
    }
  }
  const scored: ScoredEntry[] = Array.from(tfBoost, ([idxV, score]) => ({
    idx: idxV,
    score,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

export interface HybridResult {
  available: boolean;
  reason?: string;
  query: string;
  k: number;
  bm_count?: number;
  vec_count?: number;
  results?: {
    score: number;
    rank_bm: number | null;
    rank_vec: number | null;
    entry: SemanticEntry;
  }[];
}

export async function hybridSearch(
  dataRoot: string,
  query: string,
  k: number,
  filter?: { prefecture_code?: string | null; kind?: string | null },
): Promise<HybridResult> {
  const bm = await tryLoadBm(dataRoot);
  if (!bm) {
    return {
      available: false,
      reason: "embeddings_not_built",
      query,
      k,
    };
  }
  const queryTokens = tokenize(query);
  // Pull a wider beam from each retriever before fusion + filtering — RRF
  // benefits from more candidates per side (Cormack section 4).
  const beam = Math.max(k * 4, 50);
  const bmRaw = scoreBm(bm, queryTokens, beam);
  // Filter BM25 candidates
  const bmFiltered: ScoredEntry[] = [];
  for (const c of bmRaw) {
    const e = bm.entries[c.idx];
    if (filter?.prefecture_code && e.prefecture_code && e.prefecture_code !== filter.prefecture_code) continue;
    if (filter?.kind && e.kind !== filter.kind) continue;
    bmFiltered.push(c);
    if (bmFiltered.length >= beam) break;
  }
  // Vector
  const sem = await semanticSearch(dataRoot, query, beam, filter);
  const semResults = sem.available ? sem.results ?? [] : [];

  // RRF: each retriever contributes 1 / (RRF_K + rank).
  const rrf = new Map<number, { score: number; rankBm: number | null; rankVec: number | null }>();
  for (let r = 0; r < bmFiltered.length; r++) {
    const i = bmFiltered[r].idx;
    rrf.set(i, {
      score: 1 / (RRF_K + r + 1),
      rankBm: r + 1,
      rankVec: null,
    });
  }
  // Map vector entry (by `key`) back to bm entry index.
  const keyToIdx = new Map<string, number>();
  for (let i = 0; i < bm.entries.length; i++) keyToIdx.set(bm.entries[i].key, i);
  for (let r = 0; r < semResults.length; r++) {
    const idx = keyToIdx.get(semResults[r].entry.key);
    if (idx === undefined) continue;
    const bonus = 1 / (RRF_K + r + 1);
    const cur = rrf.get(idx);
    if (cur) {
      cur.score += bonus;
      cur.rankVec = r + 1;
    } else {
      rrf.set(idx, { score: bonus, rankBm: null, rankVec: r + 1 });
    }
  }

  const merged = Array.from(rrf, ([idxV, v]) => ({
    idx: idxV,
    score: v.score,
    rankBm: v.rankBm,
    rankVec: v.rankVec,
  }));
  merged.sort((a, b) => b.score - a.score);
  const top = merged.slice(0, k);

  return {
    available: true,
    query,
    k,
    bm_count: bmFiltered.length,
    vec_count: semResults.length,
    results: top.map((m) => ({
      score: Number(m.score.toFixed(5)),
      rank_bm: m.rankBm,
      rank_vec: m.rankVec,
      entry: bm.entries[m.idx],
    })),
  };
}
