/**
 * One-shot debug: call the sync API for a single JH record and dump raw text.
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);

const SYSTEM_PROMPT = `You are translating an OFFICIAL Japan Heritage (日本遺産) story title and short summary into 17 languages for a tourism knowledge base.

Rules (non-negotiable):
1. TRANSLATE faithfully — do not invent, embellish, or pad.
2. Use the language-natural quotation marks: 「」(zh/ja), 'curly' or "curly" (en), « » (fr/es/it/pt/ru), „xxx" (de — closing is U+201C, NOT ASCII "). NEVER put an unescaped ASCII " inside a string value.
3. If you must include a literal ASCII ", escape it as \\".
4. Output a SINGLE JSON object only — no markdown fences, no preamble.

Schema:
{
  "key": "<copy from input>",
  "name": { "en": "...", "ja": "...", ..., "tl": "..." },
  "description": { "en": "...", ..., "tl": "..." },
  "confidence": "high" | "medium" | "low"
}

Languages: en ja zh ko fr es de it pt ru th vi id ms ar hi tl
If description is null, omit "description".`;

async function main(): Promise<void> {
  const storyId = process.argv[2];
  if (!storyId) throw new Error("usage: tsx debug_one.ts <story_id>");
  const jh = JSON.parse(
    await readFile(fileURLToPath(new URL("data/r3/japan_heritage.json", ROOT)), "utf8"),
  ) as { records: Array<{ story_id: string; title_ja: string; subtitle_ja: string | null; summary_ja: string | null }> };
  const r = jh.records.find((x) => x.story_id === storyId);
  if (!r) throw new Error(`story_id ${storyId} not found`);
  const name_ja = r.subtitle_ja ? `${r.title_ja}　${r.subtitle_ja}` : r.title_ja;
  const userPrompt = `Translate into all 17 languages.\n\nkey: japan_heritage:${r.story_id}\n\nOfficial name (Japanese):\n${name_ja}\n\nOfficial description (Japanese):\n${r.summary_ja ?? "(none)"}\n\nReturn JSON only.`;

  const client = new Anthropic();
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });
  const tb = res.content.find((b) => b.type === "text") as { text?: string };
  console.log("=== RAW RESPONSE (length:", tb.text?.length ?? 0, ") ===");
  console.log(tb.text);
  console.log("\n=== END ===");
  console.log("stop_reason:", res.stop_reason);
  console.log("usage:", JSON.stringify(res.usage));
}

main().catch((e) => { console.error(e); process.exit(1); });
