/**
 * Build vector embeddings for every searchable entity in the dataset.
 *
 * Phase 2 of the search-quality push (2026-05-01). Multi-source content
 * isn't enough on its own — quality_test 100 cases showed the harness only
 * scoring 13/100 partly because keyword/substring search misses semantic
 * paraphrases (e.g. user query "endangered tradition" never matches "失われ
 * ゆく職人技").
 *
 * Model: intfloat/multilingual-e5-small (Xenova/multilingual-e5-small on
 * the JS side). 384-dim, multilingual including Japanese / Chinese / Korean,
 * q8-quantised so ~70MB on disk and ~10ms / passage on CPU.
 *
 * Output binary layout (little-endian):
 *   data/embeddings/spots.f16.bin        N × 384 × float16  (compact)
 *   data/embeddings/spots.index.json     [{key,kind,prefecture,...}, ...]
 *
 * Run:
 *   npm run embed:build                # all entity types
 *   ENTITIES=spots npm run embed:build # only municipal scrape spots
 *   LIMIT=500 npm run embed:build      # quick smoke test
 *
 * The MCP server picks up the binary via src/lib/semantic.ts and degrades
 * gracefully (search_semantic returns "not_built" message) when missing.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { pipeline, env } from "@huggingface/transformers";

const ROOT = new URL("../../", import.meta.url);
const REPO_DATA = new URL("data/", ROOT);
const HF_CACHE = new URL("file://" + (process.env.HOME ?? "") + "/.japan-travel-mcp/data/");
const TMP_CACHE = new URL("file:///tmp/jtm-e2e-cache/");

env.allowLocalModels = false;

const MODEL_ID = "Xenova/multilingual-e5-small";
const DIM = 384;
const BATCH = 32;

// Iter 54: heritage QID → English label, embedded into wikidata
// description text so semantic queries like "UNESCO Kyoto" can match items
// via P1435 metadata. Mirrors HERITAGE_QID_LABEL in src/index.ts. Keep in
// sync (the runtime side has the canonical map; this is a build-time
// projection). Top entries by P1435 frequency in the dataset.
const HERITAGE_QID_LABEL_FOR_EMBED: Record<string, string> = {
  Q1188622: "Important Cultural Property of Japan",
  Q1139795: "National Treasure of Japan",
  Q30834580: "Historic Site of Japan",
  Q11579194: "Registered Tangible Cultural Property",
  Q43113623: "Natural Monument of Japan",
  Q11414752: "Place of Scenic Beauty",
  Q122904442: "Nationally-designated Natural Monument",
  Q23790: "Natural Monument",
  Q850649: "Important Preservation District (Traditional Buildings)",
  Q26764449: "Special Historic Site of Japan",
  Q11423672: "JSCE Civil Engineering Heritage",
  Q123010864: "Prefecture-designated Historic Site",
  Q19683138: "Ramsar Wetland",
  Q9259: "UNESCO World Heritage Site",
  Q11525886: "Tokyo Selected Historic Building",
  Q94987823: "Special Place of Scenic Beauty",
  Q11403686: "Hokkaido Heritage",
  Q24405128: "UNESCO Intangible Cultural Heritage",
  Q1186017: "National Treasure (architectural)",
};

interface IndexEntry {
  key: string;             // unique cross-source id (e.g. "spot:01200_xxx")
  kind: "spot" | "wikidata" | "r3";
  source: string;          // "municipal_scrape" | "wikidata_attractions" | "maff_gi" | ...
  name: string;
  description?: string | null;
  prefecture_code?: string | null;
  prefecture_name?: string | null;
  municipality?: string | null;
  url?: string | null;
}

function findStateRoot(rel: string): URL | null {
  for (const root of [REPO_DATA, HF_CACHE, TMP_CACHE]) {
    const cand = new URL(rel, root);
    if (existsSync(fileURLToPath(cand))) return cand;
  }
  return null;
}

async function loadJson<T>(rel: string): Promise<T | null> {
  const u = findStateRoot(rel);
  if (!u) return null;
  try {
    return JSON.parse(await readFile(fileURLToPath(u), "utf8")) as T;
  } catch {
    return null;
  }
}

async function loadJsonAt(absUrl: URL): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(fileURLToPath(absUrl), "utf8"));
  } catch {
    return null;
  }
}

async function listPrefectureFiles(): Promise<URL[]> {
  for (const root of [REPO_DATA, HF_CACHE, TMP_CACHE]) {
    const dir = new URL("prefectures/", root);
    try {
      const files = await readdir(fileURLToPath(dir));
      const found = files
        .filter((f) => f.endsWith(".json"))
        .map((f) => new URL(f, dir));
      if (found.length > 0) return found;
    } catch {
      // try next root
    }
  }
  return [];
}

// Filter spots that are clearly nav-chrome / index pages / encoding garbage
// rather than real assets. Prevents the embedding corpus from being polluted
// with low-signal entries that drown real content out of top-N results.
// Same logic as src/index.ts isNavChromeSpotName, kept duplicated to avoid
// importing src/ into scrapers/.
function isNavChromeSpotName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed.length === 0) return true;
  if (/[�]/.test(trimmed)) return true;
  if (/^[�¿À-ÿ]+$/.test(trimmed)) return true;
  const lower = trimmed.toLowerCase();
  const navWords = new Set([
    "main menu", "menu", "news", "videos", "video", "video library",
    "home", "top", "sitemap", "site map", "site search", "search",
    "login", "sign in", "sign up", "register", "press", "press room",
    "rss", "rss feed", "subscribe", "twitter", "facebook", "youtube",
    "instagram", "language", "english", "日本語",
    "ご意見", "お問い合わせ", "プライバシーポリシー", "サイトマップ",
    "サイト内検索", "関連リンク", "リンク集", "メインメニュー",
    "観光パンフレット等のご案内", "観光客のおもてなし",
    "おすすめ特集", "special feature",
  ]);
  if (navWords.has(lower)) return true;
  if (navWords.has(trimmed)) return true;
  if (/^[぀-ヿ]{1,3}$/.test(trimmed)) return true;
  return false;
}

async function harvestSpots(limit: number | null): Promise<IndexEntry[]> {
  const out: IndexEntry[] = [];
  let skippedNav = 0;
  const files = await listPrefectureFiles();
  for (const f of files) {
    if (limit !== null && out.length >= limit) break;
    const data = (await loadJsonAt(f)) as
      | {
          prefecture: { code: string; name: string };
          municipalities: {
            municipality: { name: string };
            spots: {
              id: string;
              name: string;
              description: string | null;
              url: string;
              body_paragraphs?: string[];
            }[];
          }[];
          wikidata_attractions?: {
            qid: string;
            name_ja: string | null;
            name_en: string | null;
            description_en: string | null;
            admin_name: string | null;
            wikidata_url: string;
            types?: string[];
            heritage_designations?: string[];
          }[];
        }
      | null;
    if (!data) continue;
    for (const m of data.municipalities ?? []) {
      for (const s of m.spots ?? []) {
        if (limit !== null && out.length >= limit) break;
        if (isNavChromeSpotName(s.name)) {
          skippedNav++;
          continue;
        }
        const body = (s.body_paragraphs ?? []).slice(0, 5).join(" ");
        // Skip spots with no usable body text — pure index/listing entries.
        if (!body && !s.description) {
          skippedNav++;
          continue;
        }
        out.push({
          key: `spot:${s.id}`,
          kind: "spot",
          source: "municipal_scrape",
          name: s.name,
          description: body || s.description || null,
          prefecture_code: data.prefecture.code,
          prefecture_name: data.prefecture.name,
          municipality: m.municipality.name,
          url: s.url,
        });
      }
    }
    for (const a of data.wikidata_attractions ?? []) {
      if (limit !== null && out.length >= limit) break;
      const name = a.name_ja || a.name_en;
      if (!name) continue;
      // Iter 51: drop airport-only Wikidata entries from
      // the embedding index. Same logic as src/index.ts iter44 search
      // path, but applied at embed-time so the hybrid retriever (BM25 +
      // multilingual-e5 fused with RRF) doesn't pull airports as nearest
      // neighbours either. iter44 in search_area gave +9 Sat by dropping
      // airports in the exact-match path; embed-time filter extends that
      // benefit to all hybrid_search consumers permanently.
      const types = (a as { types?: string[] }).types ?? [];
      if (types.length > 0 && types.every((t) => t === "Q1248784")) continue;
      // Iter 54: include heritage designation labels in
      // the embedded text so semantic queries like "UNESCO Kyoto" or
      // "national treasure castle" match items by their official status,
      // not just their name. Without this, the description for
      // 金閣寺 is "Buddhist temple in Kyoto" — no overlap with "UNESCO".
      const heritageQids = (a as { heritage_designations?: string[] }).heritage_designations ?? [];
      const heritageLabels: string[] = [];
      if (heritageQids.length > 0) {
        for (const qid of heritageQids) {
          const label = HERITAGE_QID_LABEL_FOR_EMBED[qid];
          if (label && !heritageLabels.includes(label)) heritageLabels.push(label);
        }
      }
      // Include description_ja (from Wikidata short or Wikipedia intro
      // backfill commits bc287dd / 4ab4cc6) so semantic search ranks via
      // Japanese text content for niche-Japanese-tourism entries that
      // typically lack description_en. multilingual-e5 indexes ja and en
      // in the same vector space.
      const descJa = (a as { description_ja?: string | null }).description_ja ?? "";
      // Include wikipedia_kind_tags (canonical-list memberships from
      // commits 4d8cb22 / 6397b20 / c8b0eba — 100名城 / 桜名所100 / etc)
      // so queries like "桜の名所" match list-tagged entries directly.
      const wpTags = (a as { wikipedia_kind_tags?: string[] }).wikipedia_kind_tags ?? [];
      const desc = [
        a.description_en ?? "",
        descJa,
        heritageLabels.length > 0 ? `[${heritageLabels.join(" / ")}]` : "",
        wpTags.length > 0 ? `[${wpTags.slice(0, 6).join(" / ")}]` : "",
      ]
        .filter((s) => s.length > 0)
        .join(" ")
        .trim() || null;
      out.push({
        key: `wd:${a.qid}`,
        kind: "wikidata",
        source: "wikidata_attractions",
        name,
        description: desc,
        prefecture_code: data.prefecture.code,
        prefecture_name: data.prefecture.name,
        municipality: a.admin_name,
        url: a.wikidata_url,
      });
    }
  }
  if (skippedNav > 0) {
    process.stderr.write(`[embed] skipped ${skippedNav} nav-chrome / empty-body spots\n`);
  }
  return out;
}

async function harvestR3(limit: number | null): Promise<IndexEntry[]> {
  const out: IndexEntry[] = [];
  type R3 = {
    name_ja?: string | null;
    name_en?: string | null;
    description_ja?: string | null;
    characteristics_ja?: string | null;
    description_en?: string | null;
    detail_url?: string | null;
    wikidata_url?: string | null;
    story_url?: string | null;
    qid?: string;
    registration_number?: number;
    story_id?: string;
    title_ja?: string;
    summary_ja?: string | null;
  };
  const sources: { rel: string; sourceId: string; key: (r: R3) => string }[] = [
    { rel: "r3/maff_gi.json", sourceId: "maff_gi", key: (r) => `maff_gi:${r.registration_number}` },
    { rel: "r3/meti_densan.json", sourceId: "meti_densan", key: (r) => `meti_densan:${(r as { id?: string }).id ?? r.name_ja}` },
    { rel: "r3/japan_heritage.json", sourceId: "japan_heritage", key: (r) => `japan_heritage:${r.story_id}` },
    { rel: "r3/bunka_intangible.json", sourceId: "bunka_intangible", key: (r) => `bunka_intangible:${r.qid}` },
    { rel: "r3/unesco_japan.json", sourceId: "unesco_japan", key: (r) => `unesco_japan:${r.qid}` },
  ];
  for (const src of sources) {
    if (limit !== null && out.length >= limit) break;
    const f = await loadJson<{ records: R3[] }>(src.rel);
    if (!f) continue;
    for (const r of f.records ?? []) {
      if (limit !== null && out.length >= limit) break;
      const name = r.title_ja || r.name_ja || r.name_en;
      if (!name) continue;
      out.push({
        key: src.key(r),
        kind: "r3",
        source: src.sourceId,
        name,
        description:
          r.summary_ja || r.description_ja || r.characteristics_ja || r.description_en || null,
        url: r.detail_url || r.wikidata_url || r.story_url || null,
      });
    }
  }
  // DMO index entries — minimal "name + area" rows for DMO discoverability
  // (the get_dmo tool surface). The richer regional positioning content
  // lives in data/dmo/<id>/plan.json and is harvested by harvestDmoPlans()
  // below so each plan chunk becomes its own embedded entity.
  const dmo = await loadJson<{ entries: { id: string; name: string; raw_area_text: string; plan_pdf_url: string | null; prefectures: string[] }[] }>("r3/dmo.json");
  if (dmo) {
    for (const e of dmo.entries ?? []) {
      if (limit !== null && out.length >= limit) break;
      out.push({
        key: e.id,
        kind: "r3",
        source: "dmo",
        name: e.name,
        description: `観光地域づくり法人 (DMO) — 対象区域: ${e.raw_area_text}`,
        url: e.plan_pdf_url,
      });
    }
  }
  return out;
}

/**
 * Harvest DMO regional-positioning plan chunks.
 *
 * Each DMO's 形成確立計画 PDF (~5-15 pages) was fetched + chunked by
 * fetch_dmo_plans.py into data/dmo/<id>/plan.json. Each chunk becomes one
 * IndexEntry with kind="r3" and source="dmo_plan" so it flows through the
 * existing hybrid retrieval path.
 *
 * our framing (2026-05-02): "what makes each region special, in the
 * region's own words" — we want a query like "endangered traditional
 * crafts" to surface the DMO whose plan foregrounds endangered crafts as
 * a positioning theme, then surface concrete spots / R-3 records from
 * that region. Faithful rendering of self-curated regional voice, not
 * editorial curation.
 */
async function harvestDmoPlans(limit: number | null): Promise<IndexEntry[]> {
  const out: IndexEntry[] = [];
  // dmo/ lives in data/, scan via the same fallback chain as listPrefectureFiles
  const roots: URL[] = [
    new URL("dmo/", REPO_DATA),
    new URL("dmo/", HF_CACHE),
    new URL("dmo/", TMP_CACHE),
  ];
  let dmoDir: URL | null = null;
  for (const r of roots) {
    if (existsSync(fileURLToPath(r))) {
      dmoDir = r;
      break;
    }
  }
  if (!dmoDir) {
    process.stderr.write(`[embed] no data/dmo/ — skipping DMO plan harvest\n`);
    return out;
  }
  let dmoIds: string[] = [];
  try {
    dmoIds = (await readdir(fileURLToPath(dmoDir))).filter((f) => !f.startsWith("."));
  } catch {
    return out;
  }
  let plansSeen = 0;
  let chunksAdded = 0;
  for (const id of dmoIds) {
    if (limit !== null && out.length >= limit) break;
    const planPath = new URL(`${id}/plan.json`, dmoDir);
    let plan: {
      id: string;
      name: string;
      name_normalized?: string;
      registration_class?: string;
      status?: string;
      prefectures?: string[];
      municipalities?: string[];
      plan_pdf_url?: string | null;
      plan_chunks?: { idx: number; text: string }[];
    } | null = null;
    try {
      plan = (await loadJsonAt(planPath)) as typeof plan;
    } catch {
      continue;
    }
    if (!plan || !Array.isArray(plan.plan_chunks) || plan.plan_chunks.length === 0) continue;
    plansSeen++;
    const prefList = (plan.prefectures ?? []).join(" / ") || null;
    const muniList = (plan.municipalities ?? []).slice(0, 6).join(" / ") || null;
    for (const c of plan.plan_chunks) {
      if (limit !== null && out.length >= limit) break;
      out.push({
        key: `dmo_plan:${plan.id}:${c.idx}`,
        kind: "r3",
        source: "dmo_plan",
        name: `${plan.name} — 形成確立計画 (chunk ${c.idx + 1})`,
        description: c.text,
        prefecture_name: prefList,
        municipality: muniList,
        url: plan.plan_pdf_url ?? null,
      });
      chunksAdded++;
    }

    // Also harvest the DMO's website pages (scraped by
    // scripts/sources/scrape_dmo_websites.ts → data/dmo/<id>/pages.json).
    // Each page is its own embedded entity so query "endangered crafts"
    // can surface the DMO's actual blog post / featured-page on crafts.
    const pagesPath = new URL(`${id}/pages.json`, dmoDir);
    let pagesFile:
      | {
          id: string;
          name: string;
          prefectures?: string[];
          municipalities?: string[];
          homepage_url?: string;
          pages?: {
            url: string;
            title: string;
            description: string | null;
            body_paragraphs: string[];
            language: string;
          }[];
        }
      | null = null;
    try {
      pagesFile = (await loadJsonAt(pagesPath)) as typeof pagesFile;
    } catch {
      pagesFile = null;
    }
    if (pagesFile && Array.isArray(pagesFile.pages)) {
      for (const page of pagesFile.pages) {
        if (limit !== null && out.length >= limit) break;
        if (!page.title || page.title.length < 2) continue;
        if (isNavChromeSpotName(page.title)) continue;
        const body = (page.body_paragraphs ?? []).slice(0, 5).join(" ");
        if (!body && !page.description) continue;
        out.push({
          key: `dmo_page:${plan.id}:${page.url}`,
          kind: "r3",
          source: "dmo_website",
          name: `${page.title} (${plan.name})`,
          description: body || page.description || null,
          prefecture_name: prefList,
          municipality: muniList,
          url: page.url,
        });
        chunksAdded++;
      }
    }
  }
  process.stderr.write(
    `[embed] DMO plans: ${plansSeen} plans → ${chunksAdded} chunks/pages embedded\n`,
  );
  return out;
}

function passageText(e: IndexEntry): string {
  const parts: string[] = [e.name];
  if (e.prefecture_name) parts.push(`(${e.prefecture_name}${e.municipality ? "/" + e.municipality : ""})`);
  if (e.description) parts.push(String(e.description));
  return "passage: " + parts.join(" ").slice(0, 600);
}

// ─── float32 → float16 packing ───────────────────────────────────────────
// Standard IEEE 754 conversion. Compact at the cost of 0.1% similarity drift,
// which is well within the noise floor of E5 retrieval.
function f32ToF16Bits(val: number): number {
  const f32 = new Float32Array(1);
  const u32 = new Uint32Array(f32.buffer);
  f32[0] = val;
  const x = u32[0];
  const sign = (x >>> 16) & 0x8000;
  let exponent = ((x >>> 23) & 0xff) - (127 - 15);
  const mantissa = x & 0x7fffff;
  if (exponent <= 0) {
    if (exponent < -10) return sign;
    const m = (mantissa | 0x800000) >>> (1 - exponent);
    return sign | (m >>> 13);
  }
  if (exponent === 0xff - (127 - 15)) {
    if (mantissa === 0) return sign | 0x7c00;
    return sign | 0x7c00 | (mantissa >>> 13) | 1;
  }
  if (exponent > 30) return sign | 0x7c00;
  return sign | (exponent << 10) | (mantissa >>> 13);
}

async function main(): Promise<void> {
  const limitEnv = process.env.LIMIT;
  const limit = limitEnv ? Math.max(1, Number(limitEnv)) : null;
  const entitiesEnv = process.env.ENTITIES ?? "all";
  const wantSpots = entitiesEnv === "all" || entitiesEnv.includes("spots");
  const wantR3 = entitiesEnv === "all" || entitiesEnv.includes("r3");

  process.stderr.write(`[embed] harvesting entities (limit=${limit ?? "∞"}, kinds=${entitiesEnv})\n`);

  const entries: IndexEntry[] = [];
  // Use concat-style merge instead of `push(...arr)` because the spread
  // operator overflows the call stack on >~30k-element arrays (broad-fetch
  // 2026-05-03: harvestSpots returned ~50k entries → RangeError).
  function appendAll(src: IndexEntry[]): void {
    for (const e of src) entries.push(e);
  }
  if (wantSpots) appendAll(await harvestSpots(limit));
  if (wantR3) {
    const remaining = limit !== null ? Math.max(0, limit - entries.length) : null;
    if (remaining === null || remaining > 0) appendAll(await harvestR3(remaining));
    // DMO regional positioning chunks share the R3 toggle (they're an
    // official-source designation by 観光庁 — same authority tier).
    const remaining2 = limit !== null ? Math.max(0, limit - entries.length) : null;
    if (remaining2 === null || remaining2 > 0) appendAll(await harvestDmoPlans(remaining2));
  }
  process.stderr.write(`[embed] ${entries.length} entries to embed\n`);

  if (entries.length === 0) {
    throw new Error("no entries to embed — check that data/ is populated");
  }

  process.stderr.write(`[embed] loading model ${MODEL_ID}\n`);
  const t0 = Date.now();
  const extractor = await pipeline("feature-extraction", MODEL_ID, { dtype: "q8" });
  process.stderr.write(`[embed] model ready in ${Date.now() - t0}ms\n`);

  const N = entries.length;
  const u16 = new Uint16Array(N * DIM);
  let processed = 0;
  const tStart = Date.now();
  for (let i = 0; i < N; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const inputs = slice.map(passageText);
    const out = await extractor(inputs, { pooling: "mean", normalize: true });
    const data = out.data as Float32Array;
    const dim = (out.dims as number[])[1];
    if (dim !== DIM) throw new Error(`unexpected dim ${dim}`);
    for (let r = 0; r < slice.length; r++) {
      for (let c = 0; c < DIM; c++) {
        u16[(i + r) * DIM + c] = f32ToF16Bits(data[r * DIM + c]);
      }
    }
    processed += slice.length;
    if (processed % 256 === 0 || processed === N) {
      const rate = processed / ((Date.now() - tStart) / 1000);
      const eta = (N - processed) / rate;
      process.stderr.write(
        `[embed] ${processed}/${N} (${rate.toFixed(1)}/s, eta ${(eta / 60).toFixed(1)}m)\n`,
      );
    }
  }

  const outDir = new URL("embeddings/", REPO_DATA);
  await mkdir(fileURLToPath(outDir), { recursive: true });
  const binPath = new URL("spots.f16.bin", outDir);
  const idxPath = new URL("spots.index.json", outDir);
  await writeFile(fileURLToPath(binPath), Buffer.from(u16.buffer));
  await writeFile(
    fileURLToPath(idxPath),
    JSON.stringify(
      {
        model: MODEL_ID,
        dim: DIM,
        dtype: "f16",
        count: N,
        built_at: new Date().toISOString(),
        entries,
      },
      null,
      2,
    ),
    "utf8",
  );
  process.stderr.write(`[embed] wrote ${N} vectors to ${binPath.href}\n`);
}

main().catch((err) => {
  console.error("[embed] FAILED:", err);
  process.exit(1);
});
