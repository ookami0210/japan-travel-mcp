/**
 * Recover translations from a previously-processed batch by re-parsing the
 * raw API responses with the hardened JSON extractor. Useful when we change
 * `extractJson` and want to retro-actively rescue records that failed.
 *
 * Usage:
 *   npx tsx scrapers/translate/reparse_batch.ts <batch_id> [<batch_id> ...]
 *
 * Writes to data/r3/translations/r3_translations.jsonl in INCREMENTAL mode
 * (existing keys are preserved; only newly-parsed keys are added).
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const OUTPUT_JSONL = new URL("data/r3/translations/r3_translations.jsonl", ROOT);
const MODEL = "claude-sonnet-4-6";

function unsanitize(id: string): string {
  const i = id.indexOf("-");
  if (i < 0) return id;
  return id.slice(0, i) + ":" + id.slice(i + 1);
}

// Inlined from translate_r3.ts so this script is self-contained.
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1].trim() : text.trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidate = candidate.slice(firstBrace, lastBrace + 1);
  }
  try {
    return JSON.parse(candidate);
  } catch {
    /* fall through */
  }
  const repaired = repairJsonStringQuotes(candidate);
  if (repaired !== candidate) {
    try {
      return JSON.parse(repaired);
    } catch {
      /* give up */
    }
  }
  return null;
}

function repairJsonStringQuotes(s: string): string {
  // Track key-vs-value context so a stray ASCII " mid-value (e.g. German
  // „xxx": Die ...) is escaped instead of treated as the closing quote.
  const out: string[] = [];
  let i = 0, inString = false, escapeNext = false, isValue = false;
  while (i < s.length) {
    const ch = s[i];
    if (escapeNext) { out.push(ch); escapeNext = false; i += 1; continue; }
    if (ch === "\\") { out.push(ch); escapeNext = true; i += 1; continue; }
    if (ch === '"') {
      if (!inString) {
        inString = true;
        let p = out.length - 1;
        while (p >= 0 && /[ \t\r\n]/.test(out[p])) p -= 1;
        isValue = p >= 0 && out[p] === ":";
        out.push(ch);
        i += 1;
        continue;
      }
      let j = i + 1;
      while (j < s.length && /[ \t\r\n]/.test(s[j])) j += 1;
      let isClosing = false;
      if (j >= s.length) isClosing = true;
      else if (isValue) {
        const next = s[j];
        if (next === "}" || next === "]") isClosing = true;
        else if (next === ",") {
          let k = j + 1;
          while (k < s.length && /[ \t\r\n]/.test(s[k])) k += 1;
          if (k >= s.length || s[k] === '"' || s[k] === "}" || s[k] === "]") isClosing = true;
        }
      } else {
        if (s[j] === ":") isClosing = true;
      }
      if (isClosing) { inString = false; out.push(ch); }
      else { out.push("\\"); out.push(ch); }
      i += 1;
      continue;
    }
    out.push(ch);
    i += 1;
  }
  return out.join("");
}

async function loadExisting(): Promise<Map<string, unknown>> {
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
      /* skip */
    }
  }
  return map;
}

async function main(): Promise<void> {
  const batchIds = process.argv.slice(2);
  if (batchIds.length === 0) {
    throw new Error("usage: tsx reparse_batch.ts <batch_id> [<batch_id> ...]");
  }
  const client = new Anthropic();
  const existing = await loadExisting();
  console.error(`[reparse] existing translations: ${existing.size}`);

  let totalSeen = 0,
    totalRecovered = 0,
    totalAlready = 0,
    totalFailed = 0;
  for (const batchId of batchIds) {
    let seen = 0,
      recovered = 0,
      already = 0,
      failed = 0;
    for await (const r of await client.messages.batches.results(batchId)) {
      seen += 1;
      if (r.result.type !== "succeeded") {
        failed += 1;
        continue;
      }
      const key = unsanitize(r.custom_id);
      if (existing.has(key)) {
        already += 1;
        continue;
      }
      const tb = r.result.message.content.find((b) => b.type === "text") as
        | { text?: string }
        | undefined;
      if (!tb?.text) {
        failed += 1;
        continue;
      }
      const obj = extractJson(tb.text) as
        | { key?: string; name?: unknown; description?: unknown; confidence?: string }
        | null;
      if (!obj || !obj.name || typeof obj.name !== "object") {
        failed += 1;
        continue;
      }
      existing.set(key, {
        key,
        name: obj.name,
        description: obj.description,
        confidence: obj.confidence ?? "medium",
        source: "official_translated",
        model: MODEL,
        generated_at: new Date().toISOString(),
        recovered_from_batch: batchId,
      });
      recovered += 1;
    }
    console.error(
      `[reparse] ${batchId}: seen=${seen} recovered=${recovered} already=${already} failed=${failed}`,
    );
    totalSeen += seen;
    totalRecovered += recovered;
    totalAlready += already;
    totalFailed += failed;
  }
  console.error(
    `[reparse] TOTAL seen=${totalSeen} recovered=${totalRecovered} already=${totalAlready} failed=${totalFailed}`,
  );
  console.error(`[reparse] writing ${existing.size} rows to ${fileURLToPath(OUTPUT_JSONL)}`);
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  const lines = [...existing.values()].map((r) => JSON.stringify(r));
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
}

main().catch((err) => {
  console.error("[reparse] FAILED:", err);
  process.exit(1);
});
