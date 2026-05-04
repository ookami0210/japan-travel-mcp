/**
 * Final-mile sync translator for R-3 records that the batched pipeline could
 * not parse. Bypasses the Batch API; calls Messages.create directly with a
 * generous max_tokens budget. Use for the last few stragglers only — batch
 * is still preferred for bulk runs (50% cost discount).
 *
 * Behaviour:
 *   - Loads the same 690 R-3 candidates as translate_r3.ts
 *   - Skips any key already present in r3_translations.jsonl
 *   - Calls the model directly for the rest, max_tokens 16384
 *   - Appends successes to r3_translations.jsonl
 *
 * Run:
 *   ANTHROPIC_API_KEY=... npx tsx scrapers/translate/translate_r3_sync.ts
 */

import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const DATA_DIR = new URL("data/r3/", ROOT);
const OUTPUT_JSONL = new URL("data/r3/translations/r3_translations.jsonl", ROOT);
const MODEL = "claude-sonnet-4-6";

const TARGET_LANGUAGES = [
  "en", "ja", "zh", "ko", "fr", "es", "de", "it", "pt", "ru",
  "th", "vi", "id", "ms", "ar", "hi", "tl",
] as const;

interface TranslateInput {
  key: string;
  source: string;
  authority: string;
  designation: string;
  name_ja: string;
  description_ja: string | null;
  context: string;
}

async function readJson<T>(file: URL): Promise<T> {
  return JSON.parse(await readFile(fileURLToPath(file), "utf8")) as T;
}

async function loadInputs(): Promise<TranslateInput[]> {
  const inputs: TranslateInput[] = [];
  const maff = await readJson<{ records: Array<{ registration_number: number; name_ja: string; characteristics_ja: string | null; production_area_text: string | null; registration_date: string | null; authority: string }> }>(new URL("maff_gi.json", DATA_DIR));
  for (const r of maff.records) {
    if (!r.name_ja) continue;
    inputs.push({
      key: `maff_gi:${r.registration_number}`,
      source: "maff_gi",
      authority: r.authority,
      designation: "Geographical Indication (GI)",
      name_ja: r.name_ja,
      description_ja: r.characteristics_ja,
      context: `production area: ${r.production_area_text ?? "n/a"}; registration date: ${r.registration_date ?? "n/a"}`,
    });
  }
  const meti = await readJson<{ records: Array<{ craft_id: string; industry_category: string; name_ja: string; features_ja: string | null; production_area_text: string | null; designation_date: string | null; authority: string }> }>(new URL("meti_densan.json", DATA_DIR));
  for (const r of meti.records) {
    if (!r.name_ja) continue;
    inputs.push({
      key: `meti_densan:${r.craft_id}`,
      source: "meti_densan",
      authority: r.authority,
      designation: `METI traditional craft (${r.industry_category})`,
      name_ja: r.name_ja,
      description_ja: r.features_ja,
      context: `industry: ${r.industry_category}; production area: ${r.production_area_text ?? "n/a"}; designation date: ${r.designation_date ?? "n/a"}`,
    });
  }
  const jh = await readJson<{ records: Array<{ story_id: string; title_ja: string; subtitle_ja: string | null; summary_ja: string | null; themes: string[]; periods: string[]; related_areas_text: string | null; authority: string }> }>(new URL("japan_heritage.json", DATA_DIR));
  for (const r of jh.records) {
    if (!r.title_ja) continue;
    inputs.push({
      key: `japan_heritage:${r.story_id}`,
      source: "japan_heritage",
      authority: r.authority,
      designation: "Japan Heritage (日本遺産) story",
      name_ja: r.subtitle_ja ? `${r.title_ja}　${r.subtitle_ja}` : r.title_ja,
      description_ja: r.summary_ja,
      context: `themes: ${r.themes.join(", ") || "n/a"}; periods: ${r.periods.join(", ") || "n/a"}; related areas: ${r.related_areas_text ?? "n/a"}`,
    });
  }
  const bunka = await readJson<{ records: Array<{ qid: string; designation: string; name_ja: string | null; name_en: string | null; description_ja: string | null; description_en: string | null; authority: string }> }>(new URL("bunka_intangible.json", DATA_DIR));
  for (const r of bunka.records) {
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
  const unesco = await readJson<{ records: Array<{ qid: string; name_ja: string | null; name_en: string | null; description_ja: string | null; description_en: string | null; inscription_year: number | null; unesco_id: string | null; authority: string }> }>(new URL("unesco_japan.json", DATA_DIR));
  for (const r of unesco.records) {
    const name = r.name_ja ?? r.name_en;
    if (!name) continue;
    inputs.push({
      key: `unesco_japan:${r.qid}`,
      source: "unesco_japan",
      authority: r.authority,
      designation: "UNESCO Intangible Cultural Heritage (Japan inscription)",
      name_ja: name,
      description_ja: r.description_ja ?? r.description_en,
      context: `inscription year: ${r.inscription_year ?? "n/a"}; unesco id: ${r.unesco_id ?? "n/a"}`,
    });
  }
  return inputs;
}

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
    } catch { /* skip */ }
  }
  return keys;
}

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
    } catch { /* skip */ }
  }
  return map;
}

const SYSTEM_PROMPT = `You are a professional translator producing 17-language tourism reference data for a Japan travel knowledge base.

Each item is from an OFFICIAL Japanese designation registry (MAFF GI, METI traditional crafts, 文化庁 intangible cultural property, UNESCO ICH, or 文化庁 Japan Heritage). Translate the official name and description into all 17 target languages.

Rules:
1. TRANSLATE faithfully — do not invent, embellish, or pad to a length.
2. Preserve official designation context (e.g. "Geographical Indication", "Important Intangible Cultural Property") naturally in each language.
3. Keep proper nouns recognizable using Hepburn romanization in Latin scripts.
4. NEVER use unescaped " inside a string value. Use the language-natural quotation marks: 「」 (zh/ja), '...' or "..." (en — curly), « » (fr/es/it/pt/ru), „..." (de — Note the closing " is U+201C, NOT ASCII "). If you must include a literal ASCII ", escape it as \\".
5. Output JSON ONLY — no markdown fences, no preamble.

Output schema:
{
  "key": "<copy from input>",
  "name": { "en": "...", ... 17 langs ... },
  "description": { "en": "...", ... 17 langs ... },
  "confidence": "high" | "medium" | "low"
}

If description_ja is null, omit the "description" key entirely.`;

function buildUserPrompt(item: TranslateInput): string {
  const descBlock = item.description_ja
    ? `Official description (Japanese):\n${item.description_ja}`
    : "Official description: (none — translate name only)";
  return `Translate this entry into all 17 target languages.

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

Return JSON only.`;
}

// Inlined extractor (kept in sync with translate_r3.ts).
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fenced ? fenced[1].trim() : text.trim();
  const fb = candidate.indexOf("{");
  const lb = candidate.lastIndexOf("}");
  if (fb >= 0 && lb > fb) candidate = candidate.slice(fb, lb + 1);
  try { return JSON.parse(candidate); } catch { /* try repair */ }
  const repaired = repair(candidate);
  if (repaired !== candidate) {
    try { return JSON.parse(repaired); } catch { /* give up */ }
  }
  return null;
}

function repair(s: string): string {
  // Key-vs-value-aware repair (see translate_r3.ts for full rationale).
  const out: string[] = [];
  let i = 0, inS = false, esc = false, isVal = false;
  while (i < s.length) {
    const ch = s[i];
    if (esc) { out.push(ch); esc = false; i += 1; continue; }
    if (ch === "\\") { out.push(ch); esc = true; i += 1; continue; }
    if (ch === '"') {
      if (!inS) {
        inS = true;
        let p = out.length - 1;
        while (p >= 0 && /[ \t\r\n]/.test(out[p])) p -= 1;
        isVal = p >= 0 && out[p] === ":";
        out.push(ch); i += 1; continue;
      }
      let j = i + 1;
      while (j < s.length && /[ \t\r\n]/.test(s[j])) j += 1;
      let closing = false;
      if (j >= s.length) closing = true;
      else if (isVal) {
        const next = s[j];
        if (next === "}" || next === "]") closing = true;
        else if (next === ",") {
          let k = j + 1;
          while (k < s.length && /[ \t\r\n]/.test(s[k])) k += 1;
          if (k >= s.length || s[k] === '"' || s[k] === "}" || s[k] === "]") closing = true;
        }
      } else {
        if (s[j] === ":") closing = true;
      }
      if (closing) { inS = false; out.push(ch); }
      else { out.push("\\"); out.push(ch); }
      i += 1; continue;
    }
    out.push(ch); i += 1;
  }
  return out.join("");
}

async function translateOne(client: Anthropic, item: TranslateInput): Promise<unknown | null> {
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(item) }],
  });
  const tb = res.content.find((b) => b.type === "text") as { text?: string } | undefined;
  if (!tb?.text) return null;
  return extractJson(tb.text);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY required");
  }
  const all = await loadInputs();
  const existing = await loadExistingKeys();
  const todo = all.filter((it) => !existing.has(it.key));
  process.stderr.write(`[r3_sync] candidates: ${all.length}; existing: ${existing.size}; todo: ${todo.length}\n`);
  if (todo.length === 0) {
    process.stderr.write("[r3_sync] nothing to do\n");
    return;
  }
  const client = new Anthropic();
  const rows = await loadExistingRows();
  let ok = 0, failed = 0;
  for (const it of todo) {
    process.stderr.write(`[r3_sync] ${it.key} ... `);
    try {
      const obj = (await translateOne(client, it)) as
        | { key?: string; name?: unknown; description?: unknown; confidence?: string }
        | null;
      if (!obj || !obj.name || typeof obj.name !== "object") {
        process.stderr.write(`FAILED (parse)\n`);
        failed += 1;
        continue;
      }
      rows.set(it.key, {
        key: it.key,
        name: obj.name,
        description: obj.description,
        confidence: obj.confidence ?? "medium",
        source: "official_translated",
        model: MODEL,
        generated_at: new Date().toISOString(),
        sync_recovery: true,
      });
      process.stderr.write(`ok\n`);
      ok += 1;
    } catch (err) {
      process.stderr.write(`FAILED (${(err as Error).message})\n`);
      failed += 1;
    }
  }
  process.stderr.write(`[r3_sync] ok=${ok} failed=${failed}\n`);
  await mkdir(dirname(fileURLToPath(OUTPUT_JSONL)), { recursive: true });
  const lines = [...rows.values()].map((r) => JSON.stringify(r));
  await writeFile(fileURLToPath(OUTPUT_JSONL), lines.join("\n") + "\n", "utf8");
  process.stderr.write(`[r3_sync] wrote ${rows.size} rows\n`);
}

main().catch((err) => {
  console.error("[r3_sync] FAILED:", err);
  process.exit(1);
});
