/**
 * Tool-selection eval ("A-to-A SEO" baseline).
 *
 * Measures whether an LLM, shown the MCP server's real tool definitions,
 * picks the RIGHT tool for a natural-language travel query — independent of
 * answer quality. This is the selection layer the Sat eval never touches.
 *
 * Pipeline:
 *   1. Build the server offline and list its tools (the exact name +
 *      description + schema a real MCP client sees).
 *   2. For each labelled query, ask the model (tool_choice: auto) which tool
 *      it would call — we capture the choice, we do NOT execute it.
 *   3. Score top-1 accuracy, the no-tool-call rate, and a confusion matrix
 *      (which tools get picked instead of the expected one).
 *
 * Needs ANTHROPIC_API_KEY. No Hugging Face data required (tool listing is
 * static). Run in CI via .github/workflows/selection-eval.yml or locally with
 *   ANTHROPIC_API_KEY=... npm run eval:selection
 */

import Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pLimit from "p-limit";

const MODEL = process.env.SELECTION_MODEL ?? "claude-sonnet-4-6";
const CORPUS = new URL("corpus.jsonl", import.meta.url);
const REPORT = new URL("REPORT.md", import.meta.url);
const CONCURRENCY = 5;

interface Case {
  query: string;
  expected: string[];
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

async function listServerTools(): Promise<AnthropicTool[]> {
  // Offline: a throwaway cache + skip-local + no-refresh keeps tool listing
  // from touching Hugging Face. Tools are static, so no fixtures are needed.
  const cache = await mkdtemp(join(tmpdir(), "sel-eval-"));
  process.env.JAPAN_TRAVEL_MCP_CACHE = cache;
  process.env.JAPAN_TRAVEL_MCP_SKIP_LOCAL = "1";
  process.env.JAPAN_TRAVEL_MCP_NO_REFRESH = "1";
  delete process.env.HF_TOKEN;

  const mod = await import("../../src/index.js");
  // Deliberately do NOT call initDataRoot(): tool *listing* is static, and
  // skipping it keeps the eval fully offline (no Hugging Face fetch).
  const server = mod.buildServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "sel-eval", version: "0.0.1" }, { capabilities: {} });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
  }));
}

async function loadCorpus(): Promise<Case[]> {
  const text = await readFile(fileURLToPath(CORPUS), "utf8");
  return text
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Case);
}

async function selectTool(
  client: Anthropic,
  tools: AnthropicTool[],
  query: string,
): Promise<string> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    tools: tools as Anthropic.Tool[],
    tool_choice: { type: "auto" },
    messages: [{ role: "user", content: query }],
  });
  const toolUse = resp.content.find((b) => b.type === "tool_use");
  return toolUse ? (toolUse as Anthropic.ToolUseBlock).name : "NONE";
}

function pct(n: number, d: number): string {
  return d === 0 ? "0.0" : ((100 * n) / d).toFixed(1);
}

async function main(): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required");
  }
  const tools = await listServerTools();
  const corpus = await loadCorpus();
  process.stderr.write(
    `[selection] ${tools.length} tools, ${corpus.length} queries, model=${MODEL}\n`,
  );

  const anthropic = new Anthropic();
  const limit = pLimit(CONCURRENCY);
  const results = await Promise.all(
    corpus.map((c) =>
      limit(async () => {
        let selected = "ERROR";
        try {
          selected = await selectTool(anthropic, tools, c.query);
        } catch (e) {
          process.stderr.write(`[selection] query failed: ${(e as Error).message}\n`);
        }
        const correct = c.expected.includes(selected);
        return { ...c, selected, correct };
      }),
    ),
  );

  const total = results.length;
  const correct = results.filter((r) => r.correct).length;
  const noCall = results.filter((r) => r.selected === "NONE").length;
  const errors = results.filter((r) => r.selected === "ERROR").length;

  // Confusion: expected primary -> selected (only for misses).
  const misses = results.filter((r) => !r.correct);

  const lines: string[] = [];
  lines.push(`# Tool-selection eval — baseline`);
  lines.push("");
  lines.push(`- Model: \`${MODEL}\``);
  lines.push(`- Tools advertised: ${tools.length}`);
  lines.push(`- Queries: ${total}`);
  lines.push("");
  lines.push(`## Headline`);
  lines.push("");
  lines.push(`- **Top-1 selection accuracy: ${pct(correct, total)}%** (${correct}/${total})`);
  lines.push(`- No tool called (model answered from its own knowledge): ${pct(noCall, total)}% (${noCall}/${total})`);
  if (errors) lines.push(`- API errors: ${errors}`);
  lines.push("");
  lines.push(`## Misses (expected → selected)`);
  lines.push("");
  lines.push(`| query | expected | selected |`);
  lines.push(`|---|---|---|`);
  for (const m of misses) {
    lines.push(`| ${m.query.replace(/\|/g, "\\|")} | ${m.expected.join(" / ")} | ${m.selected} |`);
  }
  lines.push("");
  lines.push(`## Per-tool recall (queries whose expected primary is this tool)`);
  lines.push("");
  lines.push(`| expected primary | n | hit | recall |`);
  lines.push(`|---|---|---|---|`);
  const byPrimary = new Map<string, { n: number; hit: number }>();
  for (const r of results) {
    const p = r.expected[0];
    const e = byPrimary.get(p) ?? { n: 0, hit: 0 };
    e.n += 1;
    if (r.correct) e.hit += 1;
    byPrimary.set(p, e);
  }
  for (const [p, e] of [...byPrimary.entries()].sort()) {
    lines.push(`| ${p} | ${e.n} | ${e.hit} | ${pct(e.hit, e.n)}% |`);
  }
  const report = lines.join("\n") + "\n";

  await mkdir(dirname(fileURLToPath(REPORT)), { recursive: true });
  await writeFile(fileURLToPath(REPORT), report, "utf8");
  process.stderr.write(report);
  process.stderr.write(`\n[selection] wrote ${fileURLToPath(REPORT)}\n`);
}

main().catch((err) => {
  console.error("[selection] FAILED:", err);
  process.exit(1);
});
