/**
 * Phase 4-descriptions: Generate 17-language tourism descriptions for every
 * entity that has a name. Uses Claude Sonnet 4.6 via Anthropic Batch API.
 *
 * Each entity produces 17 descriptions (~200-400 chars each), grounded in:
 *   - Canonical name in each target language (from Phase 4 names output)
 *   - Entity metadata (prefecture, admin area, Wikidata types)
 *   - Project-wide glossaries (seed_canonical.json + mlit_canonical.json)
 *
 * Inputs:
 *   data/translations/multilingual_complete.jsonl  (Phase 4 names — required)
 *   data/_state/wikidata_attractions.json           (metadata)
 *   data/glossary/seed_canonical.json
 *   data/glossary/mlit_canonical.json
 *
 * Outputs:
 *   data/translations/descriptions_complete.jsonl
 *   data/_state/translation_batch_descriptions.json
 *
 * Incremental by default: only entities that are new, whose source content
 * changed (detected via a stored content hash), or whose stored output is
 * missing a target language are (re)translated. Existing rows are preserved
 * on write — a partial run never truncates the corpus. Set FULL_RETRANSLATE=1
 * to force the whole corpus (e.g. after a prompt/glossary overhaul).
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_descriptions.ts
 *
 * Test mode (limit + dry-run):
 *   AI_LIMIT=100 npx tsx scrapers/translate/translate_descriptions.ts
 *   DRY_RUN=1   npx tsx scrapers/translate/translate_descriptions.ts
 *
 * Resume polling/retrieval:
 *   RESUME=1 ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_descriptions.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  hashSource,
  isStale,
  mergeRows,
  type ExistingRow,
} from "./lib/incremental.js";
import { extractJsonObject } from "./lib/parse.js";

const ROOT = new URL("../../", import.meta.url);
const NAMES_PATH = new URL(
  "data/translations/multilingual_complete.jsonl",
  ROOT,
);
const ATTRACTIONS_PATH = new URL(
  "data/_state/wikidata_attractions.json",
  ROOT,
);
const SEED_GLOSSARY_PATH = new URL("data/glossary/seed_canonical.json", ROOT);
const MLIT_GLOSSARY_PATH = new URL("data/glossary/mlit_canonical.json", ROOT);
const OUTPUT_JSONL = new URL(
  "data/translations/descriptions_complete.jsonl",
  ROOT,
);
const BATCH_STATE = new URL(
  "data/_state/translation_batch_descriptions.json",
  ROOT,
);

const MODEL = "claude-sonnet-4-6";

// English-first ordering: en is the primary navigation language.
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

const CHUNK_SIZE = 5000;

// ──────────────────────────────────────────────────────────────────────
// Inputs

interface NameRecord {
  qid: string;
  translations: Record<string, string | null>;
  sources: Record<string, string>;
}

interface Attraction {
  qid: string;
  name_ja: string | null;
  prefecture_code: string;
  admin_name: string | null;
  types: string[];
  description_en: string | null;
  coordinates: { lat: number; lng: number } | null;
  [key: string]: unknown;
}

async function loadNames(): Promise<NameRecord[]> {
  const text = await readFile(fileURLToPath(NAMES_PATH), "utf8");
  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as NameRecord);
}

async function loadAttractions(): Promise<Map<string, Attraction>> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(ATTRACTIONS_PATH), "utf8"),
  ) as { attractions: Attraction[] };
  const map = new Map<string, Attraction>();
  for (const a of raw.attractions) map.set(a.qid, a);
  return map;
}

async function loadGlossaries(): Promise<string> {
  const seed = await readFile(fileURLToPath(SEED_GLOSSARY_PATH), "utf8");
  const mlit = await readFile(fileURLToPath(MLIT_GLOSSARY_PATH), "utf8");
  return `# Seed Canonical Glossary (project house style)\n\n${seed}\n\n# MLIT Canonical Glossary (Japan Tourism Agency official terms)\n\n${mlit}`;
}

// ──────────────────────────────────────────────────────────────────────
// Build prompts

function buildSystemPrompt(glossariesJson: string): string {
  return `You are an expert Japan tourism content writer producing concise multilingual descriptions of tourist attractions, temples, shrines, castles, parks, museums, gardens, and natural landmarks.

# What you produce

For each entity request, write ONE description per target language. Each description must:
- Be 150-350 characters in the target language
- State what the entity is (type, location), and what makes it notable for visitors
- Be factual; do not invent facts you are uncertain about
- Use the canonical name(s) provided as input — do NOT re-translate the name yourself
- Apply the suffix conventions and house style in the glossaries below
- Be written in natural, fluent prose for a global tourist audience (not test-prep, not academic)

# Per-language style

- en: Plain American English. Lead with the type ("X is a Buddhist temple in...").
- ja: 自然な観光案内文。敬体（です・ます調）で。
- zh: 简体中文。観光客向けの自然な紹介文。
- ko: 한국어 관광 안내문 (해요체). 자연스럽고 정확하게.
- fr/es/de/it/pt: Use European conventions for date/era references. Translate suffixes appropriately.
- ru: Русский язык. Использовать стандартную транслитерацию японских названий.
- th/vi/id/ms/ar/hi/tl: Use the script and idiom natural to that language.

# Honesty

If you do not have reliable factual knowledge about a specific entity (e.g., a small local park you've never seen described), keep the description conservative — mention what can be inferred from the name and location, without inventing history or features. Mark "confidence": "low" in the output for such cases.

# Output format

You will receive ONE entity per request along with its names in 17 languages and metadata. Respond with valid JSON exactly matching:
{
  "qid": "<copy from input>",
  "descriptions": {
    "en": "<English description>",
    "ja": "<Japanese description>",
    ...
  },
  "confidence": "high" | "medium" | "low"
}

Include EXACTLY the requested target languages. JSON only — no preamble, no trailing prose.

# Canonical Glossaries

${glossariesJson}
`;
}

interface ToWrite {
  qid: string;
  names: Record<string, string>;
  prefecture_code: string;
  admin_name: string | null;
  types: string[];
  coordinates: { lat: number; lng: number } | null;
  existing_description_en: string | null;
}

/**
 * Fingerprint of the source fields that determine an entity's descriptions.
 * Mirrors exactly what `buildBatchRequest` feeds the model, so the hash
 * changes only when the generated output would actually change.
 */
function descriptionSourceHash(item: ToWrite): string {
  return hashSource({
    names: item.names,
    prefecture_code: item.prefecture_code,
    admin_name: item.admin_name,
    types: item.types,
    coordinates: item.coordinates,
    existing_description_en: item.existing_description_en,
  });
}

/** A row as persisted in descriptions_complete.jsonl. */
interface OutputRow extends ExistingRow {
  qid: string;
  descriptions: Record<string, string>;
  confidence?: string;
  source?: string;
  model?: string;
  generated_at?: string;
  domain?: string;
  source_hash?: string;
}

async function loadExistingDescriptions(): Promise<Map<string, OutputRow>> {
  const map = new Map<string, OutputRow>();
  const path = fileURLToPath(OUTPUT_JSONL);
  if (!existsSync(path)) return map;
  const text = await readFile(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = JSON.parse(trimmed) as OutputRow;
      if (row.qid) map.set(row.qid, row);
    } catch {
      /* skip malformed line */
    }
  }
  return map;
}

// Forcing the model to return its output as a tool call makes the API return
// a validated, structurally-correct JSON object — eliminating the parse
// failures caused by unescaped quotes the model put inside description text
// (e.g. zh 引号 or de „…" rendered as raw ASCII " inside a string value).
const DESCRIPTIONS_TOOL: Anthropic.Tool = {
  name: "save_descriptions",
  description:
    "Save the tourism descriptions for the entity, one per target language.",
  input_schema: {
    type: "object",
    properties: {
      descriptions: {
        type: "object",
        description:
          "Map of BCP-47 language code to a 200-400 character tourism description in that language.",
        properties: Object.fromEntries(
          TARGET_LANGUAGES.map((l) => [l, { type: "string" }]),
        ),
        required: [...TARGET_LANGUAGES],
      },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["descriptions", "confidence"],
  },
};

function buildBatchRequest(
  item: ToWrite,
  systemPrompt: string,
): {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
} {
  const namesBlock = Object.entries(item.names)
    .filter(([, v]) => v)
    .map(([lang, name]) => `  ${lang}: ${name}`)
    .join("\n");
  const coordStr = item.coordinates
    ? `${item.coordinates.lat.toFixed(4)}, ${item.coordinates.lng.toFixed(4)}`
    : "(unknown)";
  const typesStr = item.types.length > 0 ? item.types.join(", ") : "(unknown)";
  const adminStr = item.admin_name ?? "(unknown)";
  const wpDescStr = item.existing_description_en
    ? `Wikidata short description: ${item.existing_description_en}`
    : "";
  return {
    custom_id: item.qid,
    params: {
      model: MODEL,
      // 17 descriptions in token-dense scripts (ja/zh/ko/th/ar/hi) overflow a
      // 4096 ceiling; the response truncates mid-JSON and fails to parse. Give
      // generous headroom — you only pay for tokens actually generated, and the
      // prompt bounds each description to ~200-400 chars.
      max_tokens: 16384,
      tools: [DESCRIPTIONS_TOOL],
      tool_choice: { type: "tool", name: "save_descriptions" },
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
          content: `Write tourism descriptions for this entity in all 17 languages.

Entity:
  qid: ${item.qid}
  prefecture_code (JIS): ${item.prefecture_code}
  admin_area: ${adminStr}
  coordinates: ${coordStr}
  wikidata_types: ${typesStr}
  ${wpDescStr}

Canonical names (use these verbatim — do NOT re-translate):
${namesBlock}

Target languages: ${TARGET_LANGUAGES.join(", ")}

Provide every language by calling the save_descriptions tool.`,
        },
      ],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Selection

function selectForWriting(
  names: NameRecord[],
  attractions: Map<string, Attraction>,
): ToWrite[] {
  const out: ToWrite[] = [];
  for (const n of names) {
    if (!n.translations.ja) continue;
    const a = attractions.get(n.qid);
    out.push({
      qid: n.qid,
      names: Object.fromEntries(
        Object.entries(n.translations).filter(([, v]) => v) as [
          string,
          string,
        ][],
      ),
      prefecture_code: a?.prefecture_code ?? "",
      admin_name: a?.admin_name ?? null,
      types: a?.types ?? [],
      coordinates: a?.coordinates ?? null,
      existing_description_en: a?.description_en ?? null,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Submit / poll / process (chunked)

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
      `[descriptions] submitting chunk ${chunkIndex}/${totalChunks} with ${chunk.length} requests...\n`,
    );
    const batch = await client.messages.batches.create({
      requests:
        chunk as Anthropic.Messages.Batches.BatchCreateParams["requests"],
    });
    process.stderr.write(
      `[descriptions]   chunk ${chunkIndex} batch id: ${batch.id}\n`,
    );
    batchIds.push(batch.id);
  }
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
      `[descriptions] aggregate proc=${totalProc} ok=${totalOk} err=${totalErr}\n${lines.join("\n")}\n`,
    );
    if (remaining.size === 0) return;
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

interface DescriptionResult {
  qid: string;
  descriptions: Record<string, string>;
  confidence: "high" | "medium" | "low";
}

async function processResults(
  client: Anthropic,
  batchId: string,
): Promise<DescriptionResult[]> {
  const out: DescriptionResult[] = [];
  let succeeded = 0,
    errored = 0,
    parseFailed = 0;
  // Diagnostics: why do results fail to parse? Track the model's stop_reason
  // (max_tokens = truncation) and keep a few raw samples to inspect in the log.
  const stopReasons: Record<string, number> = {};
  const samples: string[] = [];
  const recordFail = (qid: string, stop: string, text: string, errMsg = ""): void => {
    parseFailed += 1;
    if (samples.length < 6) {
      // Show the exact byte the parser choked on. JSON.parse error messages
      // include "...at position N"; surface the raw window around N verbatim
      // (NOT whitespace-collapsed) so the malformation is visible.
      const posMatch = errMsg.match(/position (\d+)/);
      let window = "";
      if (posMatch) {
        const n = parseInt(posMatch[1], 10);
        window = JSON.stringify(text.slice(Math.max(0, n - 70), n + 70));
      } else {
        window = JSON.stringify(text.slice(0, 160));
      }
      samples.push(`    [${qid}] stop=${stop} len=${text.length} err="${errMsg}" window=${window}`);
    }
  };
  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      errored += 1;
      continue;
    }
    const stop = r.result.message.stop_reason ?? "null";
    stopReasons[stop] = (stopReasons[stop] ?? 0) + 1;
    const content = r.result.message.content;
    // The request forces a tool call, so the structured output arrives as a
    // tool_use block whose `.input` is already a validated JSON object — no
    // text parsing, no quote-escaping fragility.
    const toolUse = content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    let parsed: DescriptionResult | null = null;
    if (toolUse) {
      parsed = toolUse.input as DescriptionResult;
    } else {
      // Fallback for any non-tool response: tolerant text extraction.
      const textBlock = content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );
      if (!textBlock) {
        recordFail(r.custom_id, stop, "(no tool_use or text block)");
        continue;
      }
      try {
        parsed = extractJsonObject(textBlock.text) as DescriptionResult;
      } catch (e) {
        recordFail(r.custom_id, stop, textBlock.text, (e as Error).message);
        continue;
      }
    }
    if (
      !parsed.descriptions ||
      typeof parsed.descriptions !== "object"
    ) {
      recordFail(r.custom_id, stop, JSON.stringify(parsed).slice(0, 200));
      continue;
    }
    parsed.qid = r.custom_id;
    if (!parsed.confidence) parsed.confidence = "medium";
    // Strip any non-language keys the LLM may have leaked into descriptions
    // (e.g. "confidence" appearing both at the top level and inside the map).
    const validLangs = new Set<string>(TARGET_LANGUAGES);
    parsed.descriptions = Object.fromEntries(
      Object.entries(parsed.descriptions).filter(([k]) => validLangs.has(k)),
    );
    out.push(parsed);
    succeeded += 1;
  }
  process.stderr.write(
    `[descriptions] results: succeeded=${succeeded}, errored=${errored}, parse_failed=${parseFailed}\n` +
      `[descriptions] stop_reasons: ${JSON.stringify(stopReasons)}\n` +
      (samples.length ? `[descriptions] parse-fail samples:\n${samples.join("\n")}\n` : ""),
  );
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Write back

/**
 * Merge freshly-translated rows into the existing corpus and write the whole
 * file. Untouched entries are preserved (the previous implementation truncated
 * the file to only the rows in the current run, which silently dropped every
 * entity not re-translated). Legacy rows with no stored hash are backfilled.
 */
async function writeBack(
  results: DescriptionResult[],
  existing: Map<string, OutputRow>,
  hashByQid: Map<string, string>,
): Promise<void> {
  const freshRows: OutputRow[] = results.map((r) => ({
    qid: r.qid,
    descriptions: r.descriptions,
    confidence: r.confidence,
    source: "ai_generated",
    model: MODEL,
    generated_at: new Date().toISOString(),
    domain: "japan_tourism_attraction",
    source_hash: hashByQid.get(r.qid),
  }));
  const merged = mergeRows(existing, freshRows, hashByQid);
  const lines = merged.map((r) => JSON.stringify(r));
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
  process.stderr.write(
    `[descriptions] descriptions_complete.jsonl: ${lines.length} rows (${freshRows.length} updated this run)\n`,
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === "1";
  const isResume = process.env.RESUME === "1";
  if (!isDryRun && !process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const names = await loadNames();
  const attractions = await loadAttractions();
  const items = selectForWriting(names, attractions);

  // Incremental selection: translate only entities that are new or whose
  // source content changed since the stored translation. FULL_RETRANSLATE=1
  // forces the whole corpus (rarely needed — e.g. a prompt/glossary overhaul).
  const existing = await loadExistingDescriptions();
  const hashByQid = new Map(items.map((it) => [it.qid, descriptionSourceHash(it)]));
  const forceFull = process.env.FULL_RETRANSLATE === "1";
  const stale = forceFull
    ? items
    : items.filter((it) =>
        isStale(hashByQid.get(it.qid)!, existing.get(it.qid), TARGET_LANGUAGES),
      );
  process.stderr.write(
    `[descriptions] entities: ${items.length}, already current: ${
      items.length - stale.length
    }, to (re)translate: ${stale.length}${forceFull ? " (FULL_RETRANSLATE)" : ""}\n`,
  );

  // Cost estimate
  const limit = parseInt(process.env.AI_LIMIT ?? "0", 10);
  const target = limit > 0 ? stale.slice(0, limit) : stale;
  const estInputPerReq = 5500;
  const estOutputPerReq = 1700;
  const cacheRatio = 0.05;
  const estIn = (target.length * estInputPerReq * cacheRatio) / 1_000_000;
  const estOut = (target.length * estOutputPerReq) / 1_000_000;
  const usdIn = estIn * 1.5 * 0.5;
  const usdOut = estOut * 7.5 * 0.5;
  process.stderr.write(
    `[descriptions] candidates: ${items.length}, target: ${target.length}\n` +
      `[descriptions] est. cost (Sonnet 4.6 batch): input $${usdIn.toFixed(2)} + output $${usdOut.toFixed(2)} = $${(usdIn + usdOut).toFixed(2)}\n`,
  );

  if (isDryRun) {
    process.stderr.write("[descriptions] DRY_RUN=1 — exiting\n");
    return;
  }

  // Nothing to translate: still rewrite the file so legacy rows get their
  // source hash backfilled (no API spend), making the next run a clean no-op.
  if (target.length === 0 && !isResume) {
    process.stderr.write(
      "[descriptions] nothing new or changed — backfilling hashes, no API calls\n",
    );
    await writeBack([], existing, hashByQid);
    process.stderr.write("[descriptions] done\n");
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
      `[descriptions] resuming ${batchIds.length} batch(es): ${batchIds.join(", ")}\n`,
    );
  } else {
    const glossaries = await loadGlossaries();
    const systemPrompt = buildSystemPrompt(glossaries);
    process.stderr.write(
      `[descriptions] sending ${target.length} requests to Batch API (chunked)\n`,
    );
    const requests = target.map((it) => buildBatchRequest(it, systemPrompt));
    batchIds = await submitChunkedBatches(client, requests);
  }

  await pollAllUntilDone(client, batchIds);

  const allResults: DescriptionResult[] = [];
  for (const batchId of batchIds) {
    process.stderr.write(
      `[descriptions] retrieving results for ${batchId}...\n`,
    );
    const part = await processResults(client, batchId);
    allResults.push(...part);
  }
  process.stderr.write(
    `[descriptions] aggregated ${allResults.length} description rows across ${batchIds.length} batch(es)\n`,
  );
  await writeBack(allResults, existing, hashByQid);
  process.stderr.write("[descriptions] done\n");
}

main().catch((err) => {
  console.error("[descriptions] FAILED:", err);
  process.exit(1);
});
