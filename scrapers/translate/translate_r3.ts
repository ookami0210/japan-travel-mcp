/**
 * R-3 17-language translation pipeline.
 *
 * Inputs (read from data/r3/):
 *   - maff_gi.json
 *   - meti_densan.json
 *   - japan_heritage.json
 *   - bunka_intangible.json
 *   - unesco_japan.json
 *
 * For each record we ask Claude Sonnet 4.6 (Anthropic Batch API) to translate
 * the official Japanese name + description into 17 languages. The model is
 * instructed to TRANSLATE official text, not to invent or embellish — this
 * matches the project's "official build-up only" data principle.
 *
 * Output:
 *   data/r3/translations/r3_translations.jsonl  (one JSON record per source key)
 *   data/_state/r3_translation_batch.json       (batch IDs for resume)
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_r3.ts
 *
 * Test mode:
 *   AI_LIMIT=20 DRY_RUN=1 npx tsx scrapers/translate/translate_r3.ts
 *
 * Resume polling/retrieval:
 *   RESUME=1 ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_r3.ts
 *
 * Incremental mode:
 *   INCREMENTAL=1 ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_r3.ts
 *   (only translates records whose key is missing from the existing output)
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const DATA_DIR = new URL("data/r3/", ROOT);
const OUT_DIR = new URL("data/r3/translations/", ROOT);
const OUTPUT_JSONL = new URL("r3_translations.jsonl", OUT_DIR);
const BATCH_STATE = new URL("data/_state/r3_translation_batch.json", ROOT);

const MODEL = "claude-sonnet-4-6";
const CHUNK_SIZE = 5000;

const TARGET_LANGUAGES = [
  "en",
  "ja",
  "zh",
  "ko",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "ru",
  "th",
  "vi",
  "id",
  "ms",
  "ar",
  "hi",
  "tl",
] as const;

// ──────────────────────────────────────────────────────────────────────
// Translation input definition (one object per record across all sources)

interface TranslateInput {
  key: string;
  source:
    | "maff_gi"
    | "meti_densan"
    | "japan_heritage"
    | "bunka_intangible"
    | "unesco_japan";
  authority: string;
  designation: string;
  /** Official Japanese name. Always present (never empty). */
  name_ja: string;
  /** Official Japanese description. May be null when the upstream record
   *  has no description text — we still translate the name in that case. */
  description_ja: string | null;
  /** Free-text contextual hints (production area, era, theme, etc.) sent to
   *  the LLM to disambiguate translation. NOT translated. */
  context: string;
}

// ──────────────────────────────────────────────────────────────────────
// Source-specific record loading

interface R3SourceFile<T> {
  records: T[];
}

async function readJson<T>(file: URL): Promise<T> {
  return JSON.parse(await readFile(fileURLToPath(file), "utf8")) as T;
}

async function loadInputs(): Promise<TranslateInput[]> {
  const inputs: TranslateInput[] = [];

  // MAFF GI
  if (existsSync(fileURLToPath(new URL("maff_gi.json", DATA_DIR)))) {
    const f = await readJson<
      R3SourceFile<{
        registration_number: number;
        name_ja: string;
        characteristics_ja: string | null;
        production_area_text: string | null;
        registration_date: string | null;
        authority: string;
      }>
    >(new URL("maff_gi.json", DATA_DIR));
    for (const r of f.records) {
      if (!r.name_ja) continue;
      inputs.push({
        key: `maff_gi:${r.registration_number}`,
        source: "maff_gi",
        authority: r.authority,
        designation: "Geographical Indication (GI) — protected agricultural product",
        name_ja: r.name_ja,
        description_ja: r.characteristics_ja,
        context: [
          `production area: ${r.production_area_text ?? "unspecified"}`,
          `registration date: ${r.registration_date ?? "unspecified"}`,
        ].join("; "),
      });
    }
  }

  // METI traditional crafts
  if (existsSync(fileURLToPath(new URL("meti_densan.json", DATA_DIR)))) {
    const f = await readJson<
      R3SourceFile<{
        craft_id: string;
        industry_category: string;
        name_ja: string;
        features_ja: string | null;
        production_area_text: string | null;
        designation_date: string | null;
        authority: string;
      }>
    >(new URL("meti_densan.json", DATA_DIR));
    for (const r of f.records) {
      if (!r.name_ja) continue;
      inputs.push({
        key: `meti_densan:${r.craft_id}`,
        source: "meti_densan",
        authority: r.authority,
        designation: `METI-designated traditional craft (${r.industry_category})`,
        name_ja: r.name_ja,
        description_ja: r.features_ja,
        context: [
          `industry: ${r.industry_category}`,
          `production area: ${r.production_area_text ?? "unspecified"}`,
          `designation date: ${r.designation_date ?? "unspecified"}`,
        ].join("; "),
      });
    }
  }

  // Japan Heritage
  if (existsSync(fileURLToPath(new URL("japan_heritage.json", DATA_DIR)))) {
    const f = await readJson<
      R3SourceFile<{
        story_id: string;
        title_ja: string;
        subtitle_ja: string | null;
        summary_ja: string | null;
        body_ja: string | null;
        themes: string[];
        periods: string[];
        related_areas_text: string | null;
        authority: string;
      }>
    >(new URL("japan_heritage.json", DATA_DIR));
    for (const r of f.records) {
      if (!r.title_ja) continue;
      // Prefer body for summary translation when present (richer context),
      // but cap to keep token cost bounded.
      const desc = r.body_ja
        ? r.body_ja.slice(0, 1200)
        : r.summary_ja;
      inputs.push({
        key: `japan_heritage:${r.story_id}`,
        source: "japan_heritage",
        authority: r.authority,
        designation: "Japan Heritage (日本遺産) story",
        name_ja: r.subtitle_ja
          ? `${r.title_ja}　${r.subtitle_ja}`
          : r.title_ja,
        description_ja: desc,
        context: [
          `themes: ${r.themes.join(", ") || "n/a"}`,
          `periods: ${r.periods.join(", ") || "n/a"}`,
          `related areas: ${r.related_areas_text ?? "n/a"}`,
        ].join("; "),
      });
    }
  }

  // Bunka intangible
  if (existsSync(fileURLToPath(new URL("bunka_intangible.json", DATA_DIR)))) {
    const f = await readJson<
      R3SourceFile<{
        qid: string;
        designation: string;
        name_ja: string | null;
        name_en: string | null;
        description_ja: string | null;
        description_en: string | null;
        authority: string;
      }>
    >(new URL("bunka_intangible.json", DATA_DIR));
    for (const r of f.records) {
      const name = r.name_ja ?? r.name_en;
      if (!name) continue;
      inputs.push({
        key: `bunka_intangible:${r.qid}`,
        source: "bunka_intangible",
        authority: r.authority,
        designation: r.designation,
        name_ja: name,
        description_ja: r.description_ja ?? r.description_en,
        context: `wikidata QID: ${r.qid}`,
      });
    }
  }

  // UNESCO ICH (Japan)
  if (existsSync(fileURLToPath(new URL("unesco_japan.json", DATA_DIR)))) {
    const f = await readJson<
      R3SourceFile<{
        qid: string;
        name_ja: string | null;
        name_en: string | null;
        description_ja: string | null;
        description_en: string | null;
        inscription_year: number | null;
        unesco_id: string | null;
        authority: string;
      }>
    >(new URL("unesco_japan.json", DATA_DIR));
    for (const r of f.records) {
      const name = r.name_ja ?? r.name_en;
      if (!name) continue;
      inputs.push({
        key: `unesco_japan:${r.qid}`,
        source: "unesco_japan",
        authority: r.authority,
        designation: "UNESCO Intangible Cultural Heritage (Japan inscription)",
        name_ja: name,
        description_ja: r.description_ja ?? r.description_en,
        context: `inscription year: ${r.inscription_year ?? "n/a"}; unesco id: ${r.unesco_id ?? "n/a"}; wikidata QID: ${r.qid}`,
      });
    }
  }

  return inputs;
}

// ──────────────────────────────────────────────────────────────────────
// Existing-translation scan (for INCREMENTAL mode)

async function loadExistingKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  if (!existsSync(fileURLToPath(OUTPUT_JSONL))) return keys;
  const text = await readFile(fileURLToPath(OUTPUT_JSONL), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as { key?: string };
      if (o.key) keys.add(o.key);
    } catch {
      // skip
    }
  }
  return keys;
}

// ──────────────────────────────────────────────────────────────────────
// Prompt + batch building

function buildSystemPrompt(): string {
  return `You are a professional translator producing 17-language tourism reference data for a Japan travel knowledge base.

# Project context

Each item you translate is an entry from an OFFICIAL Japanese designation registry (MAFF Geographical Indications, METI traditional crafts, 文化庁 intangible cultural property registry, UNESCO ICH inscriptions, or 文化庁 Japan Heritage stories). The Japanese text comes verbatim from the issuing authority.

# Your job

For each entity input you receive, return:
- A faithful translation of the official NAME into each target language
- A faithful translation of the official DESCRIPTION into each target language

# Rules (these are non-negotiable)

1. TRANSLATE — do not invent, embellish, or add facts. If the source description is short, the translation is short.
2. PRESERVE the official designation context (e.g. "Geographical Indication", "Important Intangible Cultural Property") where natural in each language.
3. KEEP proper nouns recognizable — Japanese place names should follow Hepburn romanization in Latin-script languages (e.g. 京都 → Kyoto, not Kyōto unless macrons are required by context).
4. NAME translations: prefer the conventional English / target-language form when one is established (e.g. 歌舞伎 → "Kabuki", "歌舞伎" stays "歌舞伎" in Japanese). Do not back-translate established names.
5. If the source description is null/empty, omit the description for all languages (return only the name).
6. NEVER include marketing language ("must-see", "world-famous", "breathtaking") unless the official source itself uses such language.

# Per-language style

- en: Plain American English, neutral / encyclopedic register.
- ja: Keep Japanese verbatim from the source where possible (the input *is* Japanese).
- zh: 简体中文。客观、准确。
- ko: 한국어. 객관적이고 정확하게.
- fr/es/de/it/pt: Use European conventions; keep Japanese proper nouns in Latin script.
- ru: Русский язык. Стандартная транслитерация японских названий.
- th/vi/id/ms/ar/hi/tl: Use the script and idiom natural to that language.

# Honesty

If a source description is too vague or ambiguous to translate confidently, mark "confidence": "low" and produce a literal-as-possible translation. Do NOT fabricate to fill gaps.

# Output format

Respond with valid JSON ONLY:
{
  "key": "<copy from input>",
  "name": { "en": "...", "ja": "...", ... },
  "description": { "en": "...", "ja": "...", ... },
  "confidence": "high" | "medium" | "low"
}

Include EXACTLY the requested target languages. If description is null, OMIT the "description" key entirely.`;
}

// Anthropic Batch API requires custom_id to match ^[a-zA-Z0-9_-]{1,64}$.
// Our internal keys use ":" as the source / id separator (e.g. "maff_gi:1");
// we swap ":" ↔ "-" only on the wire.
function sanitizeCustomId(key: string): string {
  return key.replace(/:/g, "-");
}
function unsanitizeCustomId(id: string): string {
  // Source prefixes contain "_" but no "-"; restore the FIRST "-" to ":".
  const i = id.indexOf("-");
  if (i < 0) return id;
  return id.slice(0, i) + ":" + id.slice(i + 1);
}

function buildBatchRequest(
  item: TranslateInput,
  systemPrompt: string,
): {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
} {
  const descBlock = item.description_ja
    ? `Official description (Japanese):\n${item.description_ja}`
    : "Official description: (none — translate name only)";

  return {
    custom_id: sanitizeCustomId(item.key),
    params: {
      model: MODEL,
      // 17 langs × (name + ~250-char description) → ~10k output tokens worst case.
      // 4096 truncated long records and caused JSON parse failures; 8192 leaves headroom.
      max_tokens: 8192,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Translate this official designation entry into all 17 target languages.

Entry:
  key: ${item.key}
  source: ${item.source}
  authority: ${item.authority}
  designation: ${item.designation}
  context: ${item.context}

Official name (Japanese):
${item.name_ja}

${descBlock}

Target languages: ${TARGET_LANGUAGES.join(", ")}

Return JSON only.`,
        },
      ],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Submit / poll / retrieve (chunked, mirrors translate_descriptions.ts)

async function submitChunkedBatches(
  client: Anthropic,
  requests: ReturnType<typeof buildBatchRequest>[],
): Promise<string[]> {
  const batchIds: string[] = [];
  for (let i = 0; i < requests.length; i += CHUNK_SIZE) {
    const chunk = requests.slice(i, i + CHUNK_SIZE);
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
    const totalChunks = Math.ceil(requests.length / CHUNK_SIZE);
    process.stderr.write(
      `[r3_translate] submitting chunk ${chunkIndex}/${totalChunks} with ${chunk.length} requests...\n`,
    );
    const batch = await client.messages.batches.create({
      requests:
        chunk as Anthropic.Messages.Batches.BatchCreateParams["requests"],
    });
    process.stderr.write(
      `[r3_translate]   chunk ${chunkIndex} batch id: ${batch.id}\n`,
    );
    batchIds.push(batch.id);
  }
  await mkdir(dirname(fileURLToPath(BATCH_STATE)), { recursive: true });
  await writeFile(
    fileURLToPath(BATCH_STATE),
    JSON.stringify(
      {
        batch_ids: batchIds,
        submitted_at: new Date().toISOString(),
        request_count: requests.length,
        chunk_size: CHUNK_SIZE,
        target_languages: TARGET_LANGUAGES,
      },
      null,
      2,
    ),
    "utf8",
  );
  return batchIds;
}

async function pollAllUntilDone(
  client: Anthropic,
  batchIds: string[],
): Promise<void> {
  const remaining = new Set(batchIds);
  while (remaining.size > 0) {
    const lines: string[] = [];
    let totalProc = 0,
      totalOk = 0,
      totalErr = 0;
    for (const batchId of [...remaining]) {
      const r = await client.messages.batches.retrieve(batchId);
      totalProc += r.request_counts.processing;
      totalOk += r.request_counts.succeeded;
      totalErr += r.request_counts.errored;
      lines.push(
        `  ${batchId}: ${r.processing_status} (proc=${r.request_counts.processing} ok=${r.request_counts.succeeded} err=${r.request_counts.errored})`,
      );
      if (r.processing_status === "ended") remaining.delete(batchId);
    }
    process.stderr.write(
      `[r3_translate] aggregate proc=${totalProc} ok=${totalOk} err=${totalErr}\n${lines.join("\n")}\n`,
    );
    if (remaining.size === 0) return;
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

interface TranslationResult {
  key: string;
  name?: Record<string, string>;
  description?: Record<string, string>;
  confidence: "high" | "medium" | "low";
}

async function processResults(
  client: Anthropic,
  batchId: string,
): Promise<TranslationResult[]> {
  const out: TranslationResult[] = [];
  let succeeded = 0,
    errored = 0,
    parseFailed = 0;
  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      errored += 1;
      continue;
    }
    const content = r.result.message.content;
    const textBlock = content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );
    if (!textBlock) {
      parseFailed += 1;
      continue;
    }
    let parsed: TranslationResult | null = null;
    try {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no JSON");
      parsed = JSON.parse(m[0]) as TranslationResult;
    } catch {
      parseFailed += 1;
      continue;
    }
    if (!parsed.name || typeof parsed.name !== "object") {
      parseFailed += 1;
      continue;
    }
    parsed.key = unsanitizeCustomId(r.custom_id);
    if (!parsed.confidence) parsed.confidence = "medium";
    out.push(parsed);
    succeeded += 1;
  }
  process.stderr.write(
    `[r3_translate] results: succeeded=${succeeded}, errored=${errored}, parse_failed=${parseFailed}\n`,
  );
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Write back (merges with existing file in INCREMENTAL mode)

async function writeBack(
  results: TranslationResult[],
  preserve: Map<string, unknown>,
): Promise<void> {
  // Start with preserved existing rows that we did NOT re-translate this run.
  const merged = new Map<string, unknown>(preserve);
  for (const r of results) {
    merged.set(r.key, {
      key: r.key,
      name: r.name,
      description: r.description,
      confidence: r.confidence,
      source: "official_translated",
      model: MODEL,
      generated_at: new Date().toISOString(),
    });
  }
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  const lines = [...merged.values()].map((r) => JSON.stringify(r));
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
  process.stderr.write(
    `[r3_translate] r3_translations.jsonl: ${lines.length} rows total (${results.length} new/updated)\n`,
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main

async function loadExistingRows(): Promise<Map<string, unknown>> {
  const map = new Map<string, unknown>();
  if (!existsSync(fileURLToPath(OUTPUT_JSONL))) return map;
  const text = await readFile(fileURLToPath(OUTPUT_JSONL), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as { key?: string };
      if (o.key) map.set(o.key, o);
    } catch {
      // skip
    }
  }
  return map;
}

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === "1";
  const isResume = process.env.RESUME === "1";
  const isIncremental = process.env.INCREMENTAL === "1";

  if (!isDryRun && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const allInputs = await loadInputs();
  process.stderr.write(`[r3_translate] loaded ${allInputs.length} candidates\n`);

  let target = allInputs;
  let preserved = new Map<string, unknown>();
  if (isIncremental) {
    const existing = await loadExistingKeys();
    target = allInputs.filter((i) => !existing.has(i.key));
    preserved = await loadExistingRows();
    process.stderr.write(
      `[r3_translate] incremental: ${target.length} new (existing kept: ${preserved.size})\n`,
    );
  }
  const limit = parseInt(process.env.AI_LIMIT ?? "0", 10);
  if (limit > 0) target = target.slice(0, limit);
  process.stderr.write(
    `[r3_translate] will translate ${target.length} records\n`,
  );

  // Cost estimate (rough): ~3000 input + ~1500 output tokens per record (batched).
  const estIn = (target.length * 3000 * 0.05) / 1_000_000;
  const estOut = (target.length * 1500) / 1_000_000;
  const usd = estIn * 1.5 * 0.5 + estOut * 7.5 * 0.5;
  process.stderr.write(
    `[r3_translate] est. batch cost (Sonnet 4.6): $${usd.toFixed(2)}\n`,
  );

  if (isDryRun) {
    process.stderr.write("[r3_translate] DRY_RUN=1 — exiting\n");
    return;
  }

  const client = new Anthropic();

  let batchIds: string[];
  if (isResume && existsSync(fileURLToPath(BATCH_STATE))) {
    const st = JSON.parse(
      await readFile(fileURLToPath(BATCH_STATE), "utf8"),
    ) as { batch_ids?: string[]; batch_id?: string };
    batchIds = st.batch_ids ?? (st.batch_id ? [st.batch_id] : []);
    if (batchIds.length === 0) {
      throw new Error("RESUME=1 but no batch_ids in state file");
    }
    process.stderr.write(
      `[r3_translate] resuming ${batchIds.length} batch(es): ${batchIds.join(", ")}\n`,
    );
  } else {
    if (target.length === 0) {
      process.stderr.write(
        "[r3_translate] nothing to translate (incremental: all up-to-date)\n",
      );
      return;
    }
    const systemPrompt = buildSystemPrompt();
    const requests = target.map((it) => buildBatchRequest(it, systemPrompt));
    batchIds = await submitChunkedBatches(client, requests);
  }

  await pollAllUntilDone(client, batchIds);

  const allResults: TranslationResult[] = [];
  for (const batchId of batchIds) {
    process.stderr.write(
      `[r3_translate] retrieving results for ${batchId}...\n`,
    );
    const part = await processResults(client, batchId);
    allResults.push(...part);
  }
  process.stderr.write(
    `[r3_translate] aggregated ${allResults.length} translation rows\n`,
  );
  await writeBack(allResults, preserved);
  process.stderr.write("[r3_translate] done\n");
}

main().catch((err) => {
  console.error("[r3_translate] FAILED:", err);
  process.exit(1);
});
