/**
 * zh-Hant backfill — add Traditional Chinese (Taiwan) to every translation
 * store, deriving it from the existing Simplified Chinese layer.
 *
 * WHY: Taiwan is Japan's #3 inbound market and reads Traditional Chinese;
 * the dataset carried only Simplified (`zh`). Every record already has a
 * quality-controlled zh value, so the cheapest correct path is a
 * deterministic script conversion with Taiwan phrase localization
 * (OpenCC s2twp: 软件→軟體, 出租车→計程車), not a from-scratch LLM pass.
 * A separate LLM canary QA (scripts side) samples the output — if it ever
 * finds systematic issues, the escalation path is an LLM conversion batch.
 *
 * Idempotent: records that already carry a `zh-Hant` value are left alone
 * unless --force. Records with no `zh` source honestly get no `zh-Hant`.
 *
 * Targets:
 *   data/translations/descriptions_complete.jsonl  (.descriptions)
 *   data/translations/multilingual_complete.jsonl  (.translations)
 *   data/r3/translations/r3_translations.jsonl     (.name + .description)
 *
 * Usage:
 *   npx tsx scrapers/translate/backfill_zh_hant.ts
 *   npx tsx scrapers/translate/backfill_zh_hant.ts --force
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
// @ts-expect-error opencc-js ships no bundled types
import * as OpenCC from "opencc-js";

const ROOT = new URL("../../", import.meta.url);
const TARGET_LANG = "zh-Hant";

const convert: (s: string) => string = OpenCC.Converter({ from: "cn", to: "twp" });

interface FileSpec {
  rel: string;
  /** Dict-valued fields on each JSONL record that carry per-language text. */
  fields: string[];
}

const FILES: FileSpec[] = [
  { rel: "data/translations/descriptions_complete.jsonl", fields: ["descriptions"] },
  { rel: "data/translations/multilingual_complete.jsonl", fields: ["translations"] },
  { rel: "data/r3/translations/r3_translations.jsonl", fields: ["name", "description"] },
];

async function processFile(spec: FileSpec, force: boolean): Promise<void> {
  const path = fileURLToPath(new URL(spec.rel, ROOT));
  const lines = (await readFile(path, "utf8")).split("\n");
  let added = 0;
  let skippedExisting = 0;
  let noSource = 0;

  const out = lines.map((line) => {
    if (line.trim() === "") return line;
    const rec = JSON.parse(line) as Record<string, unknown>;
    let touched = false;
    for (const field of spec.fields) {
      const dict = rec[field];
      if (!dict || typeof dict !== "object" || Array.isArray(dict)) continue;
      const d = dict as Record<string, string>;
      if (d[TARGET_LANG] && !force) {
        skippedExisting += 1;
        continue;
      }
      const zh = d["zh"];
      if (!zh || typeof zh !== "string" || zh.trim() === "") {
        noSource += 1;
        continue;
      }
      d[TARGET_LANG] = convert(zh);
      added += 1;
      touched = true;
    }
    return touched ? JSON.stringify(rec) : line;
  });

  const tmp = path + ".tmp";
  await writeFile(tmp, out.join("\n"), "utf8");
  await rename(tmp, path);
  console.error(
    `[zh-hant] ${spec.rel}: +${added} converted, ${skippedExisting} already present, ${noSource} without zh source`,
  );
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  for (const spec of FILES) {
    await processFile(spec, force);
  }
  console.error("[zh-hant] done");
}

main().catch((err) => {
  console.error("[backfill_zh_hant] fatal:", err);
  process.exitCode = 1;
});
