#!/usr/bin/env node
/**
 * HTTP-MCP entrypoint — same tool surface as src/index.ts, exposed over a
 * Streamable HTTP transport instead of stdio. Use this on Hugging Face Spaces
 * (Docker SDK), Cloudflare Workers, or any other always-on host so that web /
 * SaaS MCP clients can connect.
 *
 * Local dev:
 *   npm run build && node dist/src/index_http.js
 *   curl -N -H "Accept: text/event-stream" http://localhost:7860/mcp
 *
 * Env:
 *   PORT                       (default 7860 — HF Spaces convention)
 *   JAPAN_TRAVEL_MCP_CACHE     (data cache override)
 *   HF_TOKEN                   (required while the HF dataset is private)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse,
} from "node:http";
// Re-use the exact tool registry + handler from the stdio entrypoint.
// `src/index.ts` exports buildServer() + initDataRoot(); when imported (as
// opposed to invoked via `node dist/src/index.js`), the stdio main() does
// not run — that branch is gated by `import.meta.url === file://argv[1]`.
import { buildServer, initDataRoot } from "./index.js";

/**
 * Build the HTTP request handler that routes /healthz, /, and /mcp.
 *
 * `mcpServerFactory` is a thunk that returns a fresh MCP `Server` for each
 * /mcp request. We need a fresh pair (server + transport) per request because
 * an MCP `Server` can only be `connect()`ed to a single transport in its
 * lifetime, and `StreamableHTTPServerTransport` is created per request in
 * stateless mode.
 */
export function createHttpHandler(
  mcpServerFactory: () => Server,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    // Liveness probe (HF Spaces health check).
    if (req.method === "GET" && req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
      return;
    }
    // Tiny landing page so a browser hitting the root sees something useful.
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(LANDING_HTML);
      return;
    }
    if (req.url !== "/mcp") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found — try /mcp");
      return;
    }
    // Stateless mode: sessionIdGenerator: undefined disables session
    // tracking, so multiple concurrent clients don't share state. For high
    // traffic with session continuity, switch to stateful mode + a
    // sessionId → transport map.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    const server = mcpServerFactory();
    res.on("close", () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  };
}

export async function main(): Promise<HttpServer> {
  // Block until the data is available (cold start downloads from HF if needed).
  await initDataRoot();
  const port = Number(process.env.PORT ?? 7860);

  const httpServer = createServer(createHttpHandler(buildServer));

  httpServer.listen(port, () => {
    console.error(
      `[japan-travel-mcp] HTTP MCP server listening on :${port}\n` +
        `  POST /mcp        — Streamable HTTP MCP endpoint\n` +
        `  GET  /healthz    — liveness probe\n` +
        `  GET  /           — landing page`,
    );
  });

  return httpServer;
}

const LANDING_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Japan Travel MCP — hosted demo</title>
  <style>
    body { font: 16px/1.6 -apple-system, system-ui, sans-serif; max-width: 720px;
           margin: 4rem auto; padding: 0 1rem; color: #1a1a1a; }
    code { background: #f4f4f4; padding: 0.15em 0.35em; border-radius: 3px; }
    pre  { background: #f4f4f4; padding: 1em; border-radius: 6px; overflow-x: auto; }
    a    { color: #1f4f6e; }
  </style>
</head>
<body>
  <h1>Japan Travel MCP — hosted demo</h1>
  <p>17-language Japanese tourism dataset + MCP server. This URL is the
  Streamable HTTP MCP endpoint. Point any MCP-compatible client at it:</p>
  <pre>POST ${"$"}{this.origin}/mcp</pre>
  <h2>Try it in Claude Desktop</h2>
  <p>For most users, the npm package is simpler:</p>
  <pre>{
  "mcpServers": {
    "japan-travel": {
      "command": "npx",
      "args": ["-y", "japan-travel-mcp"]
    }
  }
}</pre>
  <h2>Resources</h2>
  <ul>
    <li><a href="https://github.com/ookami0210/japan-travel-mcp">GitHub repo</a></li>
    <li><a href="https://huggingface.co/datasets/open-travel/japan-travel-mcp-data">Hugging Face dataset</a></li>
    <li><a href="https://www.npmjs.com/package/japan-travel-mcp">npm package</a></li>
  </ul>
</body>
</html>`;

// Top-level entrypoint — only runs when this file is executed directly,
// not when imported by the integration suite.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error("[japan-travel-mcp/http] FATAL:", err);
    process.exit(1);
  });
}
