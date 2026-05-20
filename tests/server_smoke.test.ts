import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import {
  EXPECTED_TOOLS,
  materialiseFixtures,
} from "./_helpers/server_fixtures.js";

// ──────────────────────────────────────────────────────────────────────
// Suite

const ENV_KEYS = [
  "JAPAN_TRAVEL_MCP_CACHE",
  "JAPAN_TRAVEL_MCP_SKIP_LOCAL",
  "HF_TOKEN",
] as const;

let cacheDir: string;
let client: Client;
const envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

type ToolResponse = { json: unknown; isError: boolean };

function parseToolPayload(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResponse> {
  const res = (await client.callTool({ name, arguments: args })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = res.content?.[0]?.text ?? "null";
  return { json: parseToolPayload(text), isError: Boolean(res.isError) };
}

/**
 * Call a tool and assert the protocol-level happy path:
 *   - the server didn't throw (isError === false)
 *   - the payload parsed into a non-null object
 *
 * "Business" errors like { error: "qid required" } are still happy paths
 * here — the switch case was reached and returned a structured result.
 * isError is true only when the handler caught a thrown exception, which
 * is the regression class we actually want to catch.
 */
async function callToolOk(
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const { json, isError } = await callTool(name, args);
  expect(isError, `${name} returned a protocol-level error`).toBe(false);
  expect(json, `${name} returned a non-object payload`).toBeTypeOf("object");
  expect(json).not.toBeNull();
  return json as Record<string, unknown>;
}

beforeAll(async () => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];

  cacheDir = await mkdtemp(join(tmpdir(), "japan-travel-mcp-smoke-"));
  await materialiseFixtures(cacheDir);

  // Must be set BEFORE we dynamically import the server module, because
  // getCacheDir() reads it at call time and the server caches DATA_ROOT
  // once initDataRoot() resolves.
  process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
  process.env.JAPAN_TRAVEL_MCP_SKIP_LOCAL = "1";
  delete process.env.HF_TOKEN;

  const serverModule = await import("../src/index.js");
  await serverModule.initDataRoot();

  const server = serverModule.buildServer();
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  client = new Client(
    { name: "smoke-client", version: "0.0.1" },
    { capabilities: {} },
  );

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
});

afterAll(async () => {
  if (client) {
    await client.close().catch(() => {
      /* best effort */
    });
  }
  if (cacheDir) {
    await rm(cacheDir, { recursive: true, force: true });
  }
  for (const key of ENV_KEYS) {
    const prev = envSnapshot[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

describe("buildServer() — MCP integration smoke", () => {
  it("ListTools exposes the documented tool registry", async () => {
    const res = (await client.listTools()) as {
      tools: Array<{ name: string; description?: string; inputSchema?: unknown }>;
    };
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
    for (const t of res.tools) {
      expect(typeof t.description).toBe("string");
      expect(t.inputSchema).toBeTruthy();
    }
  });

  it("unknown tool name surfaces as an isError result", async () => {
    const { json, isError } = await callTool("does_not_exist");
    expect(isError).toBe(true);
    expect((json as { error: string }).error).toMatch(/Unknown tool/i);
  });

  // ────────────────────────────────────────────────────────────────────
  // Per-tool happy paths. We don't assert deep result shapes — many tools
  // legitimately return empty arrays against the minimal fixture data.
  // The goal here is to walk the registerHandlers switch end-to-end and
  // catch wiring regressions (arg coercion, missing imports, throw paths).
  // callToolOk() asserts isError === false so a regressing tool surfaces.

  it("search_area returns a validation error for an empty query", async () => {
    const json = await callToolOk("search_area", { q: "" });
    expect(json.error).toBe("empty_query");
  });

  it("search_area finds the seeded Tottori prefecture", async () => {
    const json = await callToolOk("search_area", { q: "Tottori" });
    expect(json.results).toEqual(expect.any(Array));
    expect((json.results as unknown[]).length).toBeGreaterThan(0);
  });

  it("get_spots accepts the prefecture filter", async () => {
    const json = await callToolOk("get_spots", { prefecture: "tottori" });
    expect(
      Array.isArray(json.spots) || typeof json.error === "string",
    ).toBe(true);
  });

  it("get_hotels accepts the prefecture filter against an empty master", async () => {
    const json = await callToolOk("get_hotels", { prefecture: "tottori" });
    expect(
      Array.isArray(json.hotels) || typeof json.error === "string",
    ).toBe(true);
  });

  it("get_transport surfaces a structured response without a spot_id", async () => {
    await callToolOk("get_transport");
  });

  it("get_events early-returns when prefecture is omitted (no live SPARQL)", async () => {
    const json = await callToolOk("get_events");
    expect(json.error as string).toMatch(/prefecture required/i);
  });

  it("get_multilingual handles an unknown spot_id gracefully", async () => {
    await callToolOk("get_multilingual", { spot_id: "Q-NOT-A-REAL-QID" });
  });

  it("get_description with a missing qid returns the validation error", async () => {
    const json = await callToolOk("get_description", { qid: "" });
    expect(json.error as string).toMatch(/qid required/i);
  });

  it("get_local_specialty runs against empty MAFF/METI fixtures", async () => {
    await callToolOk("get_local_specialty", { prefecture: "tottori" });
  });

  it("get_traditional_arts runs against empty bunka/UNESCO fixtures", async () => {
    await callToolOk("get_traditional_arts");
  });

  it("get_local_food runs against empty fixtures", async () => {
    await callToolOk("get_local_food", { prefecture: "tottori" });
  });

  it("get_festivals runs against empty fixtures", async () => {
    await callToolOk("get_festivals", { prefecture: "tottori" });
  });

  it("get_japan_heritage runs against empty fixtures", async () => {
    await callToolOk("get_japan_heritage");
  });

  it("get_dmo runs against empty fixtures", async () => {
    await callToolOk("get_dmo");
  });

  it("get_entity_full handles an unknown qid", async () => {
    await callToolOk("get_entity_full", { qid: "Q-NOT-A-REAL-QID" });
  });

  it("get_entities_bulk handles an empty qid list", async () => {
    await callToolOk("get_entities_bulk", { qids: [] });
  });

  it("plan_feasibility_check handles an empty itinerary", async () => {
    await callToolOk("plan_feasibility_check", { itinerary: [] });
  });

  it("search_semantic handles an arbitrary query (may fall back without an index)", async () => {
    await callToolOk("search_semantic", { q: "sand dunes" });
  });

  it("search_hybrid handles an arbitrary query", async () => {
    await callToolOk("search_hybrid", { q: "sand dunes" });
  });
});
