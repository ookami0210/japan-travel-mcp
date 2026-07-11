// Rate limiting + access-log wiring for the hosted HTTP transport.
//
// The stdio transport has no network surface; the hosted /mcp endpoint does, so
// createHttpHandler() gains a per-IP fixed-window limiter and a one-line access
// log. These tests pin the limiter's core guarantee and the handler behaviour
// (health probe exempt, /mcp limited with a 429 + Retry-After).

import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server as HttpServer } from "node:http";
import { AddressInfo } from "node:net";
import {
  createHttpHandler,
  makeRateLimiter,
} from "../../src/index_http.js";
import { buildServer } from "../../src/index.js";

describe("makeRateLimiter", () => {
  it("allows up to the limit, then rejects with a Retry-After", () => {
    const check = makeRateLimiter({ limit: 2, windowMs: 60_000 });
    expect(check("1.2.3.4").ok).toBe(true);
    expect(check("1.2.3.4").ok).toBe(true);
    const third = check("1.2.3.4");
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.retryAfterSec).toBeGreaterThan(0);
  });

  it("tracks each key independently", () => {
    const check = makeRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(check("a").ok).toBe(true);
    expect(check("b").ok).toBe(true); // different key, fresh budget
    expect(check("a").ok).toBe(false);
  });

  it("limit: 0 disables limiting entirely", () => {
    const check = makeRateLimiter({ limit: 0, windowMs: 60_000 });
    for (let i = 0; i < 50; i++) expect(check("x").ok).toBe(true);
  });
});

describe("createHttpHandler() rate limiting", () => {
  let server: HttpServer | null = null;
  let baseUrl = "";

  async function start(limit: number): Promise<void> {
    server = createServer(
      createHttpHandler(buildServer, {
        rate: { limit, windowMs: 60_000 },
        log: null, // keep test output quiet
      }),
    );
    await new Promise<void>((res) => server!.listen(0, "127.0.0.1", res));
    const { port } = server!.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    if (server) {
      await new Promise<void>((res) => server!.close(() => res()));
      server = null;
    }
  });

  it("never rate-limits the health probe", async () => {
    await start(1); // tiny limit
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/healthz`);
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 + Retry-After once the /mcp budget is spent", async () => {
    await start(1);
    const post = () =>
      fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

    // First request consumes the budget (its own status is irrelevant — a bare
    // body is rejected by the MCP transport, but it counts against the limit).
    await post();
    const blocked = await post();
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = (await blocked.json()) as { error: string };
    expect(body.error).toBe("rate_limited");
  });
});
