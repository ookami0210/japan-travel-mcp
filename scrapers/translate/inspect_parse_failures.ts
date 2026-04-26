/**
 * Diagnostic: pull batch 2 results and dump raw responses for entries that
 * the current parser can't decode. We want to see WHY the JSON regex fails.
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const OUTPUT_JSONL = new URL("data/r3/translations/r3_translations.jsonl", ROOT);

async function loadAlreadyTranslated(): Promise<Set<string>> {
  const keys = new Set<string>();
  const text = await readFile(fileURLToPath(OUTPUT_JSONL), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const o = JSON.parse(t) as { key?: string };
      if (o.key) keys.add(o.key);
    } catch {
      /* skip */
    }
  }
  return keys;
}

function unsanitize(id: string): string {
  const i = id.indexOf("-");
  if (i < 0) return id;
  return id.slice(0, i) + ":" + id.slice(i + 1);
}

async function main(): Promise<void> {
  const batchId = process.argv[2];
  if (!batchId) {
    throw new Error("usage: tsx inspect_parse_failures.ts <msgbatch_id>");
  }
  const client = new Anthropic();
  const already = await loadAlreadyTranslated();
  console.error(`[inspect] already translated: ${already.size}`);

  let total = 0,
    succeeded = 0,
    parsedOk = 0,
    sampleDumped = 0;
  const failures: { key: string; raw: string }[] = [];
  for await (const r of await client.messages.batches.results(batchId)) {
    total += 1;
    if (r.result.type !== "succeeded") continue;
    succeeded += 1;
    const key = unsanitize(r.custom_id);
    if (already.has(key)) {
      parsedOk += 1;
      continue;
    }
    const tb = r.result.message.content.find(
      (b) => b.type === "text",
    ) as { text?: string } | undefined;
    if (!tb?.text) continue;
    failures.push({ key, raw: tb.text });
    if (sampleDumped < 5) {
      sampleDumped += 1;
      process.stdout.write(
        `\n=========== SAMPLE ${sampleDumped} (key=${key}) ===========\n`,
      );
      process.stdout.write(tb.text.slice(0, 2000));
      process.stdout.write(`\n[...total length ${tb.text.length}...]\n`);
    }
  }
  console.error(
    `\n[inspect] total=${total} succeeded(api)=${succeeded} alreadyTranslated=${parsedOk} unsavedFailures=${failures.length}`,
  );
  // Stats on failure shapes
  const stats = {
    starts_with_brace: 0,
    starts_with_text: 0,
    has_markdown_fence: 0,
    has_multiple_braces: 0,
    truncated_no_close: 0,
    avg_len: 0,
    max_len: 0,
  };
  let sumLen = 0;
  for (const f of failures) {
    const t = f.raw.trim();
    if (t.startsWith("{")) stats.starts_with_brace += 1;
    else stats.starts_with_text += 1;
    if (t.includes("```")) stats.has_markdown_fence += 1;
    if ((t.match(/\{/g) ?? []).length > 1) stats.has_multiple_braces += 1;
    const lastClose = t.lastIndexOf("}");
    if (lastClose < t.length - 5) stats.truncated_no_close += 1; // looks truncated
    sumLen += t.length;
    stats.max_len = Math.max(stats.max_len, t.length);
  }
  if (failures.length > 0) stats.avg_len = Math.round(sumLen / failures.length);
  console.error(`[inspect] failure shape stats:`, JSON.stringify(stats, null, 2));
}

main().catch((err) => {
  console.error("[inspect] FAILED:", err);
  process.exit(1);
});
