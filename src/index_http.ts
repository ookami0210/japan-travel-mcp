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
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
// Re-use the exact tool registry + handler from the stdio entrypoint.
// `src/index.ts` exports buildServer() + initDataRoot(); when imported (as
// opposed to invoked via `node dist/src/index.js`), the stdio main() does
// not run — that branch is gated by `import.meta.url === file://argv[1]`.
import { buildServer, initDataRoot } from "./index.js";

const PORT = Number(process.env.PORT ?? 7860);

async function main(): Promise<void> {
  // Block until the data is available (cold start downloads from HF if needed).
  await initDataRoot();
  const server = buildServer();

  // One transport instance is created per HTTP request handler invocation
  // (stateless mode) so multiple concurrent clients don't share a session.
  // For very high traffic, switch to stateful mode with a session map.
  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });

  httpServer.listen(PORT, () => {
    console.error(
      `[japan-travel-mcp] HTTP MCP server listening on :${PORT}\n` +
      `  POST /mcp        — Streamable HTTP MCP endpoint\n` +
      `  GET  /healthz    — liveness probe\n` +
      `  GET  /           — landing page`,
    );
  });
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
    <li><a href="https://huggingface.co/datasets/kjsunada/japan-travel-mcp-data">Hugging Face dataset</a></li>
    <li><a href="https://www.npmjs.com/package/japan-travel-mcp">npm package</a></li>
  </ul>
</body>
</html>`;

main().catch((err) => {
  console.error("[japan-travel-mcp/http] FATAL:", err);
  process.exit(1);
});
