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
import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  EXPECTED_TOOLS,
  materialiseFixtures,
} from "./_helpers/server_fixtures.js";

// ──────────────────────────────────────────────────────────────────────
// Suite

const ENV_KEYS = ["JAPAN_TRAVEL_MCP_CACHE", "HF_TOKEN", "PORT"] as const;

let cacheDir: string;
let httpServer: HttpServer;
let baseUrl: string;
let mcpClient: Client;
const envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

function listen(server: HttpServer): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Bind to 127.0.0.1 so we never accidentally expose the test server
    // and never collide with IPv6-only listeners on CI runners.
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr);
      else reject(new Error("unexpected listen address"));
    });
  });
}

function close(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function makeMcpClient(name: string): Promise<Client> {
  const c = new Client({ name, version: "0.0.1" }, { capabilities: {} });
  const t = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await c.connect(t);
  return c;
}

type ToolCallResult = {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

function extractResults(res: ToolCallResult): unknown[] {
  expect(res.isError ?? false).toBe(false);
  const text = res.content?.[0]?.text ?? "null";
  const json = JSON.parse(text) as { results?: unknown[] };
  expect(Array.isArray(json.results)).toBe(true);
  return json.results ?? [];
}

beforeAll(async () => {
  for (const key of ENV_KEYS) envSnapshot[key] = process.env[key];

  cacheDir = await mkdtemp(join(tmpdir(), "japan-travel-mcp-http-"));
  await materialiseFixtures(cacheDir);

  // Same constraint as the stdio smoke: env must be set before the server
  // module is imported, because getCacheDir() reads it at call time.
  process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
  delete process.env.HF_TOKEN;

  const stdioModule = await import("../src/index.js");
  await stdioModule.initDataRoot();

  const httpModule = await import("../src/index_http.js");
  httpServer = createServer(httpModule.createHttpHandler(stdioModule.buildServer));
  const addr = await listen(httpServer);
  baseUrl = `http://127.0.0.1:${addr.port}`;

  mcpClient = await makeMcpClient("smoke-http-client");
});

afterAll(async () => {
  if (mcpClient) {
    await mcpClient.close().catch(() => {
      /* best effort */
    });
  }
  if (httpServer) await close(httpServer).catch(() => undefined);
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  for (const key of ENV_KEYS) {
    const prev = envSnapshot[key];
    if (prev === undefined) delete process.env[key];
    else process.env[key] = prev;
  }
});

describe("createHttpHandler() — Streamable-HTTP integration smoke", () => {
  it("GET /healthz returns 200 ok", async () => {
    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/plain/);
    expect(await res.text()).toBe("ok");
  });

  it("GET / serves the landing page", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    const body = await res.text();
    expect(body).toContain("<h1>Japan Travel MCP");
    expect(body).toContain("/mcp");
  });

  it("GET /something-else returns 404", async () => {
    const res = await fetch(`${baseUrl}/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/try \/mcp/);
  });

  it("POST to a non-/mcp path returns 404 too", async () => {
    const res = await fetch(`${baseUrl}/whatever`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("MCP client over /mcp exposes the same tool registry as the stdio transport", async () => {
    const res = (await mcpClient.listTools()) as {
      tools: Array<{ name: string }>;
    };
    const names = res.tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("MCP client over /mcp can call a tool end-to-end", async () => {
    const res = (await mcpClient.callTool({
      name: "search_area",
      arguments: { q: "Tottori" },
    })) as ToolCallResult;
    expect(extractResults(res).length).toBeGreaterThan(0);
  });

  // ────────────────────────────────────────────────────────────────────
  // Concurrency.
  //
  // The refactored createHttpHandler() builds a fresh MCP Server + fresh
  // StreamableHTTPServerTransport per /mcp request (stateless mode). These
  // two tests prove that doesn't break under concurrency:
  //   - many in-flight calls multiplexed through ONE client (shared keep-
  //     alive / SSE stream)
  //   - many independent clients each opening their own transport (the
  //     multi-tenant scenario this server is actually deployed for)

  it("handles many in-flight callTool requests through a single client", async () => {
    const N = 8;
    const calls = Array.from({ length: N }, () =>
      mcpClient.callTool({
        name: "search_area",
        arguments: { q: "Tottori" },
      }) as Promise<ToolCallResult>,
    );
    const responses = await Promise.all(calls);
    for (const res of responses) {
      expect(extractResults(res).length).toBeGreaterThan(0);
    }
  });

  it("handles independent clients calling tools in parallel", async () => {
    const N = 4;
    const clients = await Promise.all(
      Array.from({ length: N }, (_, i) => makeMcpClient(`smoke-parallel-${i}`)),
    );
    try {
      const responses = await Promise.all(
        clients.map(
          (c) =>
            c.callTool({
              name: "search_area",
              arguments: { q: "Tottori" },
            }) as Promise<ToolCallResult>,
        ),
      );
      for (const res of responses) {
        expect(extractResults(res).length).toBeGreaterThan(0);
      }
    } finally {
      await Promise.allSettled(clients.map((c) => c.close()));
    }
  });
});
