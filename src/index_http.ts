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
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
// Re-use the exact tool registry + handler from the stdio entrypoint.
// `src/index.ts` exports buildServer() + initDataRoot(); when imported (as
// opposed to invoked via `node dist/src/index.js`), the stdio main() does
// not run — that branch is gated by `import.meta.url === file://argv[1]`.
import { buildServer, ensureDataReady } from "./index.js";
import { ensureHeapHeadroom } from "./lib/heap_guard.js";

// ── Operational hardening for a public, unauthenticated endpoint ───────
//
// Unlike the stdio transport (one process per user, no network surface), a
// hosted /mcp endpoint is reachable by anyone. Two lightweight, dependency-free
// guards make it safe to expose: a per-IP rate limit and a one-line-per-request
// access log. Both are env-tunable; see docs/deployment/HTTP_HOSTING.md.

export interface RateLimitOptions {
  /** Max /mcp requests per IP per window. 0 disables limiting. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface HttpHandlerOptions {
  rate?: RateLimitOptions;
  /** Structured access logger. Defaults to a stderr line; pass null to silence. */
  log?: ((entry: AccessLogEntry) => void) | null;
}

export interface AccessLogEntry {
  method: string | undefined;
  url: string | undefined;
  status: number;
  durationMs: number;
  ip: string;
}

function rateLimitFromEnv(): RateLimitOptions {
  const limit = Number(process.env.JAPAN_TRAVEL_MCP_RATE_LIMIT ?? 120);
  const windowMs = Number(process.env.JAPAN_TRAVEL_MCP_RATE_WINDOW_MS ?? 60_000);
  return {
    limit: Number.isFinite(limit) && limit >= 0 ? limit : 120,
    windowMs: Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000,
  };
}

/**
 * Fixed-window, in-process per-key rate limiter. No external store — fine for a
 * single instance; for a multi-instance deployment put a shared limiter (Cloud
 * Armor, an API gateway) in front instead.
 */
export function makeRateLimiter(opts: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  let checks = 0;
  return function check(
    key: string,
  ): { ok: true } | { ok: false; retryAfterSec: number } {
    if (opts.limit === 0) return { ok: true }; // disabled
    const now = Date.now();
    // Periodically evict expired buckets so the map can't grow without bound.
    if (++checks % 1000 === 0) {
      for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
    }
    let e = hits.get(key);
    if (!e || now >= e.resetAt) {
      e = { count: 0, resetAt: now + opts.windowMs };
      hits.set(key, e);
    }
    e.count += 1;
    if (e.count > opts.limit) {
      return {
        ok: false,
        retryAfterSec: Math.max(1, Math.ceil((e.resetAt - now) / 1000)),
      };
    }
    return { ok: true };
  };
}

/** Best-effort client IP: trust the first X-Forwarded-For hop (set by Cloud
 *  Run / load balancers), else the socket peer. */
function clientIp(req: IncomingMessage): string {
  const xff = req.headers["x-forwarded-for"];
  const raw = Array.isArray(xff) ? xff[0] : xff;
  if (raw && raw.length > 0) return raw.split(",")[0].trim();
  return req.socket.remoteAddress ?? "unknown";
}

function defaultAccessLog(entry: AccessLogEntry): void {
  // Skip the health probe — Cloud Run hits it constantly and it's pure noise.
  if (entry.url === "/healthz") return;
  process.stderr.write(
    `[japan-travel-mcp/http] ${entry.ip} ${entry.method} ${entry.url} ${entry.status} ${entry.durationMs}ms\n`,
  );
}

/**
 * Build the HTTP request handler that routes /healthz, /, and /mcp.
 *
 * `mcpServerFactory` is a thunk that returns a fresh MCP `Server` for each
 * /mcp request. We need a fresh pair (server + transport) per request because
 * an MCP `Server` can only be `connect()`ed to a single transport in its
 * lifetime, and `StreamableHTTPServerTransport` is created per request in
 * stateless mode.
 *
 * `opts` tunes the per-IP rate limit and access log; both default from env so
 * the existing single-argument call sites (and tests) keep working unchanged.
 */
export function createHttpHandler(
  mcpServerFactory: () => Server,
  opts: HttpHandlerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const rateCheck = makeRateLimiter(opts.rate ?? rateLimitFromEnv());
  const log = opts.log === undefined ? defaultAccessLog : opts.log;

  return async (req, res) => {
    const start = Date.now();
    if (log) {
      const ipForLog = clientIp(req);
      res.on("finish", () =>
        log({
          method: req.method,
          url: req.url,
          status: res.statusCode,
          durationMs: Date.now() - start,
          ip: ipForLog,
        }),
      );
    }

    // Liveness probe (HF Spaces / Cloud Run health check). Never rate-limited.
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

    // Per-IP rate limit on the one route that does real work.
    const verdict = rateCheck(clientIp(req));
    if (!verdict.ok) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(verdict.retryAfterSec),
      });
      res.end(
        JSON.stringify({
          error: "rate_limited",
          retry_after_seconds: verdict.retryAfterSec,
        }),
      );
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
  // Listen FIRST so /healthz and the MCP handshake answer immediately. The data
  // bootstrap (a potentially large first-run HF download) runs in the
  // background; individual tool calls await ensureDataReady() inside the shared
  // handler, so a cold cache delays the first query rather than the whole boot.
  const port = Number(process.env.PORT ?? 7860);
  const rate = rateLimitFromEnv();

  const httpServer = createServer(createHttpHandler(buildServer, { rate }));

  httpServer.listen(port, () => {
    const rateDesc =
      rate.limit === 0
        ? "disabled"
        : `${rate.limit} req / ${Math.round(rate.windowMs / 1000)}s per IP`;
    console.error(
      `[japan-travel-mcp] HTTP MCP server listening on :${port}\n` +
        `  POST /mcp        — Streamable HTTP MCP endpoint\n` +
        `  GET  /healthz    — liveness probe\n` +
        `  GET  /           — landing page\n` +
        `  rate limit: ${rateDesc}`,
    );
  });

  // Warm the data cache in the background so the first /mcp tool call is fast.
  void ensureDataReady().catch((err) => {
    console.error(
      "[japan-travel-mcp/http] background data bootstrap failed (will retry on first query):",
      (err as Error).message,
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
// Resolve symlinks before comparing — see the matching note in src/index.ts.
// A raw string compare misses any symlinked path component and the server
// would never start.
const isMain = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
})();
if (isMain) {
  // Same OOM guard as the stdio entrypoint — see src/lib/heap_guard.ts.
  if (!ensureHeapHeadroom()) {
    main().catch((err) => {
      console.error("[japan-travel-mcp/http] FATAL:", err);
      process.exit(1);
    });
  }
}
