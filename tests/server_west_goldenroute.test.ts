/**
 * Integration test for the west_goldenroute R-3 source.
 *
 * Uses the shared offline fixture set (tests/_helpers/server_fixtures.ts) and
 * the Streamable-HTTP handler so search_area is exercised end-to-end:
 *   - exact-name match surfaces a west_goldenroute record
 *   - a "golden route" query boosts itinerary / destination records to the
 *     canonical-answer tier
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { materialiseFixtures } from "./_helpers/server_fixtures.js";

const ENV_KEYS = [
  "JAPAN_TRAVEL_MCP_CACHE",
  "JAPAN_TRAVEL_MCP_SKIP_LOCAL",
  "JAPAN_TRAVEL_MCP_NO_REFRESH",
  "HF_TOKEN",
] as const;

let cacheDir: string;
let httpServer: HttpServer;
let mcpClient: Client;
const envSnapshot: Partial<
  Record<(typeof ENV_KEYS)[number], string | undefined>
> = {};

type ToolCallResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

type SearchRecord = {
  source?: string;
  key?: string;
  record_type?: string;
  name_en?: string;
};

async function searchArea(q: string): Promise<SearchRecord[]> {
  // First call pays the server's one-time warmup (hybrid-retriever probe +
  // fixture load); allow well beyond the SDK's 60 s default.
  const res = (await mcpClient.callTool(
    { name: "search_area", arguments: { q } },
    undefined,
    { timeout: 240_000 },
  )) as ToolCallResult;
  expect(res.isError ?? false).toBe(false);
  const json = JSON.parse(res.content?.[0]?.text ?? "null") as {
    results?: SearchRecord[];
  };
  return json.results ?? [];
}

beforeAll(async () => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];

  cacheDir = await mkdtemp(join(tmpdir(), "japan-travel-mcp-wgr-"));
  await materialiseFixtures(cacheDir);

  process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
  process.env.JAPAN_TRAVEL_MCP_SKIP_LOCAL = "1";
  process.env.JAPAN_TRAVEL_MCP_NO_REFRESH = "1";
  delete process.env.HF_TOKEN;

  const stdioModule = await import("../src/index.js");
  await stdioModule.initDataRoot();

  const httpModule = await import("../src/index_http.js");
  httpServer = createServer(
    httpModule.createHttpHandler(stdioModule.buildServer),
  );
  const addr = await new Promise<AddressInfo>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => {
      const a = httpServer.address();
      if (a && typeof a === "object") resolve(a);
      else reject(new Error("unexpected listen address"));
    });
  });

  mcpClient = new Client(
    { name: "wgr-test-client", version: "0.0.1" },
    { capabilities: {} },
  );
  await mcpClient.connect(
    new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${addr.port}/mcp`),
    ),
  );

  // Warm the server once so the per-test calls measure the steady state.
  await searchArea("warmup");
}, 300_000);

afterAll(async () => {
  if (mcpClient) await mcpClient.close().catch(() => undefined);
  if (httpServer) {
    await new Promise<void>((resolve) =>
      httpServer.close(() => resolve()),
    );
  }
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const prev = envSnapshot[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

describe("search_area — west_goldenroute source", () => {
  it("surfaces a west_goldenroute record on exact destination name", async () => {
    const results = await searchArea("Beppu City");
    const hit = results.find(
      (r) => r.source === "west_goldenroute" && r.key?.includes("beppu-city"),
    );
    expect(hit).toBeDefined();
    expect(hit?.name_en).toBe("Beppu City");
  });

  it("boosts itinerary + destination records on golden-route intent", async () => {
    const results = await searchArea("golden route west japan itinerary");
    const wgr = results.filter((r) => r.source === "west_goldenroute");
    const types = new Set(wgr.map((r) => r.record_type));
    expect(types.has("itinerary")).toBe(true);
    expect(types.has("destination")).toBe(true);
  });
});
