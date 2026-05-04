/**
 * Phase 4: Fill 17-language gaps for tourism entity names using Claude Sonnet 4.6
 * via the Anthropic Batch API (50% cost savings).
 *
 * Strategy:
 *   1. Layer 1 (gold): wikipedia_multilingual.json titles → use directly.
 *   2. Layer 2 (canonical seed): seed_canonical.json + mlit_canonical.json as
 *      cached system prompt — defines house style.
 *   3. Layer 3 (AI): Sonnet 4.6 fills any (qid, lang) pair Wikipedia doesn't
 *      cover. ONE request per entry asks for ALL missing languages at once
 *      (drastically reduces request count and exploits prompt cache).
 *
 * Inputs:
 *   data/glossary/wikipedia_multilingual.json (Phase 3 output)
 *   data/_state/wikidata_attractions.json (entity context)
 *   data/glossary/seed_canonical.json (style rules)
 *   data/glossary/mlit_canonical.json (200+ canonical jp/en/zh/ko terms)
 *
 * Outputs:
 *   data/translations/multilingual_complete.jsonl (final 17-lang dataset)
 *   data/_state/translation_batch_multilingual.json (batch ID for resume)
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_multilingual.ts
 *
 * Resume (after batch ID exists):
 *   ANTHROPIC_API_KEY=... RESUME=1 npx tsx scrapers/translate/translate_multilingual.ts
 *
 * Dry run (estimate request count + cost without submitting):
 *   DRY_RUN=1 npx tsx scrapers/translate/translate_multilingual.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const WP_MULTI_PATH = new URL(
  "data/glossary/wikipedia_multilingual.json",
  ROOT,
);
const ATTRACTIONS_PATH = new URL(
  "data/_state/wikidata_attractions.json",
  ROOT,
);
const SEED_GLOSSARY_PATH = new URL("data/glossary/seed_canonical.json", ROOT);
const MLIT_GLOSSARY_PATH = new URL("data/glossary/mlit_canonical.json", ROOT);
const OUTPUT_JSONL = new URL(
  "data/translations/multilingual_complete.jsonl",
  ROOT,
);
const BATCH_STATE = new URL(
  "data/_state/translation_batch_multilingual.json",
  ROOT,
);

const MODEL = "claude-sonnet-4-6";

// 16 non-Japanese target languages (ja is the source).
const TARGET_LANGUAGES = [
  "en",
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

const LANGUAGE_DESCRIPTIONS: Record<(typeof TARGET_LANGUAGES)[number], string> =
  {
    en: "English (American spelling). Use established Wikipedia-style names if known (e.g. 'Itsukushima Shrine', 'Mount Fuji'). Apply suffix glossary rules.",
    zh: "Chinese (Simplified, modern PRC convention). Use the Japanese kanji form when shared between languages, otherwise transliterate to Chinese characters that preserve the original Japanese reading.",
    ko: "Korean (Hangul). Use Korean transliteration of the Japanese reading (e.g. '이쓰쿠시마 신사' for 厳島神社).",
    fr: "French. Translate generic suffixes (Castle/Shrine/Temple) to French equivalents (château/sanctuaire/temple). Keep proper-noun stems romanized in modified Hepburn.",
    es: "Spanish. Same pattern as French — translate suffixes (castillo/santuario/templo), keep proper-noun stems romanized.",
    de: "German. Translate suffixes (Burg/Schrein/Tempel), keep proper-noun stems romanized.",
    it: "Italian. Translate suffixes (castello/santuario/tempio), keep proper-noun stems romanized.",
    pt: "Portuguese. Translate suffixes (castelo/santuário/templo), keep proper-noun stems romanized.",
    ru: "Russian (Cyrillic). Transliterate proper-noun stems using standard Russian Hepburn equivalents. Translate suffixes (Замок/Святилище/Храм).",
    th: "Thai. Transliterate proper-noun stems into Thai script. Translate suffixes (ปราสาท/ศาลเจ้า/วัด).",
    vi: "Vietnamese. Use Vietnamese suffix translations (Lâu đài/Đền/Chùa). Transliterate or use established Vietnamese names.",
    id: "Indonesian. Use Indonesian suffix translations (Kastil/Kuil Shinto/Kuil Buddha). Transliterate proper-noun stems.",
    ms: "Malay. Same approach as Indonesian (Istana/Kuil Shinto/Kuil Buddha).",
    ar: "Arabic. Transliterate to Arabic script. Translate suffixes (قلعة/مزار/معبد).",
    hi: "Hindi (Devanagari). Transliterate proper-noun stems. Translate suffixes (किला/श्राइन/मंदिर).",
    tl: "Tagalog/Filipino. Use English loanwords for suffixes (Castle/Shrine/Temple), transliterate proper-noun stems.",
  };

interface MultilingualPair {
  qid: string;
  titles: Record<string, string | null>;
  urls: Record<string, string | null>;
}

interface Attraction {
  qid: string;
  name_ja: string | null;
  prefecture_code: string;
  admin_name: string | null;
  types: string[];
  [key: string]: unknown;
}

interface ToTranslate {
  qid: string;
  name_ja: string;
  context: string;
  missing_langs: string[];
  existing: Record<string, string>;
}

// ──────────────────────────────────────────────────────────────────────
// Load inputs

async function loadWikipediaMultilingual(): Promise<MultilingualPair[]> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(WP_MULTI_PATH), "utf8"),
  ) as { pairs: MultilingualPair[] };
  return raw.pairs;
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
// Select what to translate

function selectForTranslation(
  pairs: MultilingualPair[],
  attractions: Map<string, Attraction>,
): ToTranslate[] {
  const out: ToTranslate[] = [];
  for (const p of pairs) {
    const ja = p.titles.ja;
    if (!ja) continue; // need a Japanese anchor

    const existing: Record<string, string> = { ja };
    const missing: string[] = [];
    for (const lang of TARGET_LANGUAGES) {
      if (p.titles[lang]) {
        existing[lang] = p.titles[lang]!;
      } else {
        missing.push(lang);
      }
    }
    if (missing.length === 0) continue; // fully covered

    const a = attractions.get(p.qid);
    const context = a
      ? [a.admin_name, a.prefecture_code].filter(Boolean).join(", ")
      : "";

    out.push({
      qid: p.qid,
      name_ja: ja,
      context,
      missing_langs: missing,
      existing,
    });
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Build batch requests

function buildSystemPrompt(glossariesJson: string): string {
  return `You are an expert translator specializing in Japanese tourism and cultural entity names. Your job is to translate Japanese names of tourist attractions, temples, shrines, castles, parks, museums, and natural landmarks into multiple target languages — consistent, defensible, and travel-industry usable.

# Translation principles

You MUST follow the canonical glossaries below. When a Japanese term appears in the glossary, use the rule specified — do not invent alternative translations.

When translating a proper noun (e.g. 鶴ヶ城):
1. Apply the suffix rule (城 → Castle, 寺 → Temple, etc.) per the target language.
2. Romanize the proper-noun stem using modified Hepburn (鶴ヶ → Tsuruga, NOT Crane). Do NOT translate the stem literally.
3. Combine per the language convention: "Tsuruga Castle" (en), "Château de Tsuruga" (fr), "츠루가 성" (ko), etc.
4. If a well-known established name in the target language exists (e.g. Mount Fuji, 富士山 in zh), use it.
5. If you are NOT confident about the romanization or established name, do your best with modified Hepburn — never refuse.

# Per-language style guidance

You will be told which languages to translate into. Apply these per-language conventions:

${Object.entries(LANGUAGE_DESCRIPTIONS)
  .map(([lang, desc]) => `- **${lang}**: ${desc}`)
  .join("\n")}

# Output format

You will receive ONE entity per request along with a list of target languages. Respond with valid JSON matching exactly:
{
  "qid": "<copy from input>",
  "translations": {
    "<lang>": "<translation>",
    ...
  }
}

Include EXACTLY the target languages requested. Do not add any extra languages. Do not include any prose, preamble, or trailing text — JSON only.

# Canonical Glossaries

${glossariesJson}
`;
}

function buildBatchRequest(
  item: ToTranslate,
  systemPrompt: string,
): {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
} {
  const existingHints = Object.entries(item.existing)
    .map(([lang, name]) => `  ${lang}: ${name}`)
    .join("\n");
  return {
    custom_id: item.qid,
    params: {
      model: MODEL,
      max_tokens: 1024,
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
          content: `Translate this Japanese tourism entity name into the target languages.

Entity:
  qid: ${item.qid}
  name_ja: ${item.name_ja}
  context: ${item.context || "(none)"}

Already known in these languages (use as anchor for consistency, do not re-translate):
${existingHints || "  (none)"}

Target languages to fill: ${item.missing_langs.join(", ")}

Return JSON only.`,
        },
      ],
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Submit + poll
//
// Anthropic Message Batches API caps individual batch requests at 256MB
// of payload. With our ~33KB system prompt per request, we stay safe under
// 5000 requests per batch (~165MB). Larger jobs are split across multiple
// batches and processed in parallel.

const CHUNK_SIZE = 5000;

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
      `[translate-multi] submitting chunk ${chunkIndex}/${totalChunks} with ${chunk.length} requests...\n`,
    );
    const batch = await client.messages.batches.create({
      requests:
        chunk as Anthropic.Messages.Batches.BatchCreateParams["requests"],
    });
    process.stderr.write(
      `[translate-multi]   chunk ${chunkIndex} batch id: ${batch.id}\n`,
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
    let totalProcessing = 0,
      totalSucceeded = 0,
      totalErrored = 0;
    for (const batchId of [...remaining]) {
      const r = await client.messages.batches.retrieve(batchId);
      totalProcessing += r.request_counts.processing;
      totalSucceeded += r.request_counts.succeeded;
      totalErrored += r.request_counts.errored;
      lines.push(
        `  ${batchId}: ${r.processing_status} (proc=${r.request_counts.processing} ok=${r.request_counts.succeeded} err=${r.request_counts.errored})`,
      );
      if (r.processing_status === "ended") remaining.delete(batchId);
    }
    process.stderr.write(
      `[translate-multi] aggregate proc=${totalProcessing} ok=${totalSucceeded} err=${totalErrored}\n${lines.join("\n")}\n`,
    );
    if (remaining.size === 0) return;
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

// ──────────────────────────────────────────────────────────────────────
// Process results

interface TranslationResult {
  qid: string;
  translations: Record<string, string>;
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
    if (!parsed.translations || typeof parsed.translations !== "object") {
      parseFailed += 1;
      continue;
    }
    parsed.qid = r.custom_id; // trust custom_id over model echo
    out.push(parsed);
    succeeded += 1;
  }
  process.stderr.write(
    `[translate-multi] results: succeeded=${succeeded}, errored=${errored}, parse_failed=${parseFailed}\n`,
  );
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Write back

async function writeBack(
  selectedItems: ToTranslate[],
  pairs: MultilingualPair[],
  results: TranslationResult[],
): Promise<void> {
  const aiByQid = new Map<string, TranslationResult>();
  for (const r of results) aiByQid.set(r.qid, r);
  const itemByQid = new Map<string, ToTranslate>();
  for (const it of selectedItems) itemByQid.set(it.qid, it);

  const pairByQid = new Map<string, MultilingualPair>();
  for (const p of pairs) pairByQid.set(p.qid, p);

  const lines: string[] = [];
  let aiFilledCount = 0;
  let wpOnlyCount = 0;
  for (const p of pairs) {
    if (!p.titles.ja) continue;
    const ai = aiByQid.get(p.qid);
    const merged: Record<string, string | null> = { ja: p.titles.ja };
    const sources: Record<string, string> = { ja: "wikipedia_sitelinks" };
    for (const lang of TARGET_LANGUAGES) {
      if (p.titles[lang]) {
        merged[lang] = p.titles[lang];
        sources[lang] = "wikipedia_sitelinks";
      } else if (ai?.translations?.[lang]) {
        merged[lang] = ai.translations[lang];
        sources[lang] = "ai_translated";
      } else {
        merged[lang] = null;
      }
    }
    if (ai) aiFilledCount++;
    else wpOnlyCount++;
    lines.push(
      JSON.stringify({
        qid: p.qid,
        translations: merged,
        sources,
        domain: "japan_tourism_attraction",
      }),
    );
  }

  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
  process.stderr.write(
    `[translate-multi] multilingual_complete.jsonl: ${lines.length} rows (ai=${aiFilledCount}, wp_only=${wpOnlyCount})\n`,
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

  const pairs = await loadWikipediaMultilingual();
  const attractions = await loadAttractions();
  const items = selectForTranslation(pairs, attractions);

  // Coverage report (pre)
  const totalPairs = pairs.filter((p) => p.titles.ja).length;
  const fullyCovered = totalPairs - items.length;
  const totalMissingPairs = items.reduce(
    (s, it) => s + it.missing_langs.length,
    0,
  );
  process.stderr.write(
    `[translate-multi] entries with name_ja: ${totalPairs}\n` +
      `[translate-multi] already fully covered (17 langs): ${fullyCovered}\n` +
      `[translate-multi] need AI translation: ${items.length} entries, ${totalMissingPairs} (qid, lang) pairs\n`,
  );

  // Cost estimate
  const estimatedInputTokensPerReq = 4500;
  const estimatedOutputTokensPerReq = 200;
  const cacheEffectivenessRatio = 0.05; // assume 95% cache hit on system prompt
  const estimatedTotalInputTokens =
    items.length * estimatedInputTokensPerReq * cacheEffectivenessRatio;
  const estimatedTotalOutputTokens =
    items.length * estimatedOutputTokensPerReq;
  const inputUsd =
    (estimatedTotalInputTokens / 1_000_000) * 1.5 * 0.5; // batch discount
  const outputUsd =
    (estimatedTotalOutputTokens / 1_000_000) * 7.5 * 0.5;
  const totalUsd = inputUsd + outputUsd;
  process.stderr.write(
    `[translate-multi] est. cost (Sonnet 4.6 batch): input $${inputUsd.toFixed(2)} + output $${outputUsd.toFixed(2)} = $${totalUsd.toFixed(2)}\n`,
  );

  if (isDryRun) {
    process.stderr.write("[translate-multi] DRY_RUN=1 — exiting\n");
    return;
  }

  if (items.length === 0) {
    process.stderr.write(
      "[translate-multi] nothing to translate — writing pass-through output\n",
    );
    await writeBack([], pairs, []);
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
      throw new Error("RESUME=1 but no batch_ids found in state file");
    }
    process.stderr.write(
      `[translate-multi] resuming ${batchIds.length} batch(es): ${batchIds.join(", ")}\n`,
    );
  } else {
    const glossaries = await loadGlossaries();
    const systemPrompt = buildSystemPrompt(glossaries);

    const limit = parseInt(process.env.AI_LIMIT ?? "0", 10);
    const target = limit > 0 ? items.slice(0, limit) : items;
    process.stderr.write(
      `[translate-multi] sending ${target.length} requests to Batch API (chunked)\n`,
    );

    const requests = target.map((item) =>
      buildBatchRequest(item, systemPrompt),
    );
    batchIds = await submitChunkedBatches(client, requests);
  }

  await pollAllUntilDone(client, batchIds);

  // Aggregate results from all batches
  const allResults: TranslationResult[] = [];
  for (const batchId of batchIds) {
    process.stderr.write(
      `[translate-multi] retrieving results for ${batchId}...\n`,
    );
    const partial = await processResults(client, batchId);
    allResults.push(...partial);
  }
  process.stderr.write(
    `[translate-multi] aggregated ${allResults.length} translation results across ${batchIds.length} batch(es)\n`,
  );
  await writeBack(items, pairs, allResults);
  process.stderr.write("[translate-multi] done\n");
}

main().catch((err) => {
  console.error("[translate-multi] FAILED:", err);
  process.exit(1);
});
