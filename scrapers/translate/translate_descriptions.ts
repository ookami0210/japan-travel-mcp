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
      max_tokens: 4096,
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

Return JSON only.`,
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
    let parsed: DescriptionResult | null = null;
    try {
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no JSON");
      parsed = JSON.parse(m[0]) as DescriptionResult;
    } catch {
      parseFailed += 1;
      continue;
    }
    if (
      !parsed.descriptions ||
      typeof parsed.descriptions !== "object"
    ) {
      parseFailed += 1;
      continue;
    }
    parsed.qid = r.custom_id;
    if (!parsed.confidence) parsed.confidence = "medium";
    out.push(parsed);
    succeeded += 1;
  }
  process.stderr.write(
    `[descriptions] results: succeeded=${succeeded}, errored=${errored}, parse_failed=${parseFailed}\n`,
  );
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Write back

async function writeBack(results: DescriptionResult[]): Promise<void> {
  const lines = results.map((r) =>
    JSON.stringify({
      qid: r.qid,
      descriptions: r.descriptions,
      confidence: r.confidence,
      source: "ai_generated",
      model: MODEL,
      generated_at: new Date().toISOString(),
      domain: "japan_tourism_attraction",
    }),
  );
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
  process.stderr.write(
    `[descriptions] descriptions_complete.jsonl: ${lines.length} rows\n`,
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

  // Cost estimate
  const limit = parseInt(process.env.AI_LIMIT ?? "0", 10);
  const target = limit > 0 ? items.slice(0, limit) : items;
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
  await writeBack(allResults);
  process.stderr.write("[descriptions] done\n");
}

main().catch((err) => {
  console.error("[descriptions] FAILED:", err);
  process.exit(1);
});
