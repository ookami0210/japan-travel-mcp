/**
 * Fill in missing English names on Wikidata attractions using Claude Sonnet 4.6
 * via the Batch API for 50% cost savings.
 *
 * Strategy:
 *   1. Layer 1 (gold): Wikipedia article titles via sitelinks (data/glossary/wikipedia_pairs.json)
 *      — these are human-curated; use directly with no AI involvement.
 *   2. Layer 2 (canonical seed): seed_canonical.json — cached system prompt
 *      that defines the project's house style for translation.
 *   3. Layer 3 (AI): Sonnet 4.6 translates anything Wikipedia doesn't cover,
 *      following the seed glossary's rules.
 *
 * Output:
 *   data/translations/jp_en.jsonl   (Hugging Face dataset format, parallel pairs)
 *   data/_state/wikidata_attractions.json (in-place: name_en filled where missing)
 *
 * Cost: ~8,000 attractions × Sonnet 4.6 batch ≈ $5-15 USD.
 * Run: ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_attraction_names.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const ATTRACTIONS_PATH = new URL(
  "data/_state/wikidata_attractions.json",
  ROOT,
);
const WIKIPEDIA_PAIRS_PATH = new URL(
  "data/glossary/wikipedia_pairs.json",
  ROOT,
);
const GLOSSARY_PATH = new URL("data/glossary/seed_canonical.json", ROOT);
const OUTPUT_JSONL = new URL("data/translations/jp_en.jsonl", ROOT);
const BATCH_STATE = new URL("data/_state/translation_batch.json", ROOT);

interface Attraction {
  qid: string;
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  description_en: string | null;
  prefecture_code: string;
  admin_name: string | null;
  [key: string]: unknown;
}

interface WikipediaPair {
  qid: string;
  ja_title: string | null;
  en_title: string | null;
}

const MODEL = "claude-sonnet-4-6";

// ────────────────────────────────────────────────────────────────────
// Load inputs

async function loadAttractions(): Promise<{
  raw: { attractions: Attraction[]; [key: string]: unknown };
}> {
  const raw = JSON.parse(
    await readFile(fileURLToPath(ATTRACTIONS_PATH), "utf8"),
  ) as { attractions: Attraction[] };
  return { raw };
}

async function loadWikipediaPairs(): Promise<Map<string, WikipediaPair>> {
  if (!existsSync(fileURLToPath(WIKIPEDIA_PAIRS_PATH))) {
    console.error(
      "[translate] no Wikipedia pairs file yet — relying solely on AI translation",
    );
    return new Map();
  }
  const raw = JSON.parse(
    await readFile(fileURLToPath(WIKIPEDIA_PAIRS_PATH), "utf8"),
  ) as { pairs: WikipediaPair[] };
  const map = new Map<string, WikipediaPair>();
  for (const p of raw.pairs) map.set(p.qid, p);
  return map;
}

async function loadGlossary(): Promise<string> {
  return await readFile(fileURLToPath(GLOSSARY_PATH), "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Build the cached system prompt

function buildSystemPrompt(glossaryJson: string): string {
  return `You are an expert translator specializing in Japanese tourism and cultural content. Your job is to translate Japanese names of tourist attractions, temples, shrines, castles, parks, museums, and natural landmarks into consistent, defensible English equivalents.

# Translation principles

You MUST follow the canonical glossary below. When a Japanese term appears in the glossary, use the rule specified — do not invent alternative translations.

When translating a proper noun (e.g. 鶴ヶ城), follow these rules in order:
1. Apply the suffix rule from the glossary (城 → Castle, 寺 → Temple, etc.).
2. Romanize the proper-noun stem using modified Hepburn (鶴ヶ → Tsuruga, NOT Crane).
3. Combine: "Tsuruga Castle". NEVER translate the proper-noun stem literally.
4. If a well-known established English name exists (Mount Fuji, Tokyo Tower, Itsukushima Shrine), use it.

When you are NOT confident in the romanization (rare kanji readings, unusual proper nouns), do your best with modified Hepburn and add a brief confidence flag in the output (see schema below). Do not refuse — produce the best possible romanization.

Output language: English. Be concise. Preserve factual content. No explanations, no preambles, just the translation.

# Canonical Glossary (project house style)

${glossaryJson}

# Output format

You will receive ONE attraction per request. Respond with valid JSON matching the schema:
{
  "qid": "<the Wikidata QID, copied from input>",
  "name_en": "<your English translation>",
  "confidence": "high" | "medium" | "low",
  "rationale": "<one short sentence explaining the rule applied, e.g. '城 suffix → Castle; Hepburn romanization of 鶴ヶ.'>"
}

confidence values:
- "high" — name follows a clear glossary rule (suffix + standard romanization)
- "medium" — name requires interpretation but you're reasonably sure
- "low" — rare kanji, unfamiliar reading, or established English name uncertain
`;
}

// ────────────────────────────────────────────────────────────────────
// Filter to attractions that actually need AI translation

interface ToTranslate {
  qid: string;
  name_ja: string;
  context: string; // additional hints (prefecture, admin area)
}

function selectForTranslation(
  attractions: Attraction[],
  wikipediaPairs: Map<string, WikipediaPair>,
): { fromWikipedia: Map<string, string>; needAi: ToTranslate[] } {
  const fromWikipedia = new Map<string, string>();
  const needAi: ToTranslate[] = [];

  for (const a of attractions) {
    if (a.name_en) continue; // already has English
    if (!a.name_ja) continue; // no Japanese to translate from

    // Layer 1: Wikipedia title (if both ja and en titles exist for this QID)
    const wp = wikipediaPairs.get(a.qid);
    if (wp?.en_title) {
      fromWikipedia.set(a.qid, wp.en_title);
      continue;
    }

    // Layer 3: needs AI
    const context = [a.admin_name, a.prefecture_code]
      .filter(Boolean)
      .join(", ");
    needAi.push({ qid: a.qid, name_ja: a.name_ja, context });
  }

  return { fromWikipedia, needAi };
}

// ────────────────────────────────────────────────────────────────────
// Build batch requests

function buildBatchRequest(
  item: ToTranslate,
  systemPrompt: string,
): {
  custom_id: string;
  params: Anthropic.Messages.MessageCreateParamsNonStreaming;
} {
  return {
    custom_id: item.qid,
    params: {
      model: MODEL,
      max_tokens: 512,
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
          content: `Translate this Japanese tourist attraction name to English.\n\nname_ja: ${item.name_ja}\nqid: ${item.qid}\ncontext: ${item.context || "(none)"}\n\nReturn JSON only.`,
        },
      ],
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// Submit + poll batch

async function submitAndPoll(
  client: Anthropic,
  requests: ReturnType<typeof buildBatchRequest>[],
): Promise<{ batchId: string; resultsUrl: string }> {
  console.error(
    `[translate] submitting batch with ${requests.length} requests...`,
  );
  const batch = await client.messages.batches.create({
    requests: requests as Anthropic.Messages.Batches.BatchCreateParams["requests"],
  });
  console.error(`[translate] batch id: ${batch.id}`);

  // Persist batch ID so we can resume
  await writeFile(
    fileURLToPath(BATCH_STATE),
    JSON.stringify(
      {
        batch_id: batch.id,
        submitted_at: new Date().toISOString(),
        request_count: requests.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  // Poll until done
  let result = batch;
  while (result.processing_status !== "ended") {
    await new Promise((r) => setTimeout(r, 30_000));
    result = await client.messages.batches.retrieve(batch.id);
    console.error(
      `[translate] status=${result.processing_status} processing=${result.request_counts.processing} succeeded=${result.request_counts.succeeded} errored=${result.request_counts.errored}`,
    );
  }

  return {
    batchId: result.id,
    resultsUrl: result.results_url ?? "",
  };
}

// ────────────────────────────────────────────────────────────────────
// Process results

interface TranslationResult {
  qid: string;
  name_en: string;
  confidence: "high" | "medium" | "low";
  rationale: string;
}

async function processResults(
  client: Anthropic,
  batchId: string,
): Promise<TranslationResult[]> {
  const out: TranslationResult[] = [];
  let succeeded = 0;
  let errored = 0;
  let parseFailed = 0;

  for await (const r of await client.messages.batches.results(batchId)) {
    if (r.result.type !== "succeeded") {
      errored += 1;
      continue;
    }
    const content = r.result.message.content;
    const textBlock = content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      parseFailed += 1;
      continue;
    }
    let parsed: TranslationResult | null = null;
    try {
      // Extract JSON if model wrapped it in prose
      const m = textBlock.text.match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no JSON found");
      parsed = JSON.parse(m[0]) as TranslationResult;
    } catch {
      parseFailed += 1;
      continue;
    }
    if (parsed.qid !== r.custom_id) {
      // Trust custom_id over model output
      parsed.qid = r.custom_id;
    }
    if (typeof parsed.name_en === "string" && parsed.name_en.length > 0) {
      out.push(parsed);
      succeeded += 1;
    } else {
      parseFailed += 1;
    }
  }

  console.error(
    `[translate] results: succeeded=${succeeded}, errored=${errored}, parse_failed=${parseFailed}`,
  );
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Write back

async function writeBack(
  raw: { attractions: Attraction[]; [key: string]: unknown },
  fromWikipedia: Map<string, string>,
  fromAi: TranslationResult[],
): Promise<void> {
  const aiByQid = new Map<string, TranslationResult>();
  for (const r of fromAi) aiByQid.set(r.qid, r);

  let filledFromWikipedia = 0;
  let filledFromAi = 0;

  for (const a of raw.attractions) {
    if (a.name_en) continue;
    const wp = fromWikipedia.get(a.qid);
    if (wp) {
      a.name_en = wp;
      (a as { name_en_source?: string }).name_en_source = "wikipedia";
      filledFromWikipedia += 1;
      continue;
    }
    const ai = aiByQid.get(a.qid);
    if (ai) {
      a.name_en = ai.name_en;
      (a as { name_en_source?: string }).name_en_source = "ai_translated";
      (a as { name_en_confidence?: string }).name_en_confidence = ai.confidence;
      (a as { name_en_rationale?: string }).name_en_rationale = ai.rationale;
      filledFromAi += 1;
    }
  }

  await writeFile(
    fileURLToPath(ATTRACTIONS_PATH),
    JSON.stringify(raw, null, 2),
    "utf8",
  );
  console.error(
    `[translate] wikidata_attractions.json: +${filledFromWikipedia} from Wikipedia, +${filledFromAi} from AI`,
  );

  // Append HF-format dataset records (parallel translation pairs)
  const outPath = fileURLToPath(OUTPUT_JSONL);
  await mkdir(dirname(outPath), { recursive: true });
  const lines: string[] = [];
  for (const a of raw.attractions) {
    if (!a.name_ja || !a.name_en) continue;
    const source = (a as { name_en_source?: string }).name_en_source ?? "wikidata_native";
    lines.push(
      JSON.stringify({
        qid: a.qid,
        ja: a.name_ja,
        en: a.name_en,
        source,
        confidence: (a as { name_en_confidence?: string }).name_en_confidence ?? "high",
        domain: "japan_tourism_attraction",
      }),
    );
  }
  await writeFile(outPath, lines.join("\n") + "\n", "utf8");
  console.error(
    `[translate] jp_en.jsonl: ${lines.length} pairs (HuggingFace format)`,
  );
}

// ────────────────────────────────────────────────────────────────────
// Main

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }

  const { raw } = await loadAttractions();
  const wikipediaPairs = await loadWikipediaPairs();
  const glossary = await loadGlossary();

  const { fromWikipedia, needAi } = selectForTranslation(
    raw.attractions,
    wikipediaPairs,
  );
  console.error(
    `[translate] attractions=${raw.attractions.length}, already_have_en=${raw.attractions.filter((a) => a.name_en).length}`,
  );
  console.error(
    `[translate] from Wikipedia: ${fromWikipedia.size}, need AI: ${needAi.length}`,
  );

  if (process.env.DRY_RUN === "1") {
    console.error("[translate] DRY_RUN=1 — skipping API calls");
    return;
  }

  if (needAi.length === 0) {
    console.error("[translate] nothing for AI to translate — writing back Wikipedia-only");
    await writeBack(raw, fromWikipedia, []);
    return;
  }

  const client = new Anthropic();
  const systemPrompt = buildSystemPrompt(glossary);

  // Cap for safety: if NEED_AI is huge, allow LIMIT env var to throttle
  const limit = parseInt(process.env.AI_LIMIT ?? "0", 10);
  const target = limit > 0 ? needAi.slice(0, limit) : needAi;
  console.error(`[translate] sending ${target.length} requests to Batch API`);

  const requests = target.map((item) => buildBatchRequest(item, systemPrompt));
  const { batchId } = await submitAndPoll(client, requests);
  const results = await processResults(client, batchId);

  await writeBack(raw, fromWikipedia, results);
  console.error("[translate] done");
}

main().catch((err) => {
  console.error("[translate] FAILED:", err);
  process.exit(1);
});
