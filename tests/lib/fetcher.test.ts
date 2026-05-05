import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { randomUUID } from "node:crypto";
import { ErrorCounter, rateLimitedFetch } from "../../scrapers/lib/fetcher.js";
import {
  DEFAULT_OPTIONS,
  type ScrapeOptions,
} from "../../scrapers/lib/types.js";

let c: ErrorCounter;

beforeEach(() => {
  c = new ErrorCounter();
});

describe("ErrorCounter — record", () => {
  it("starts with zeroed counters", () => {
    expect(c.summary()).toEqual({
      success: 0,
      fivexx: 0,
      fourxx: 0,
      network_errors: 0,
    });
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
  });

  it("counts 2xx success and resets both consecutive counters", () => {
    c.record(503, false);
    c.record(404, false);
    expect(c.consecutive5xx).toBe(0); // 404 reset 5xx counter
    expect(c.consecutive4xx).toBe(1);
    c.record(200, false);
    expect(c.totalSuccess).toBe(1);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(0);
  });

  it("increments consecutive5xx and resets consecutive4xx on 5xx", () => {
    c.record(404, false);
    c.record(404, false);
    expect(c.consecutive4xx).toBe(2);
    c.record(500, false);
    expect(c.consecutive4xx).toBe(0);
    expect(c.consecutive5xx).toBe(1);
    expect(c.total5xx).toBe(1);
    expect(c.total4xx).toBe(2);
  });

  it("increments consecutive4xx and resets consecutive5xx on 4xx", () => {
    c.record(500, false);
    c.record(503, false);
    expect(c.consecutive5xx).toBe(2);
    c.record(404, false);
    expect(c.consecutive5xx).toBe(0);
    expect(c.consecutive4xx).toBe(1);
  });

  it.each([
    [500, "consecutive5xx", "total5xx"],
    [403, "consecutive4xx", "total4xx"],
  ] as const)(
    "accumulates a run of %d responses (%s)",
    (status, consecutiveField, totalField) => {
      const N = 5;
      for (let i = 0; i < N; i++) c.record(status, false);
      expect(c[consecutiveField]).toBe(N);
      expect(c[totalField]).toBe(N);
    },
  );

  it("network errors do not affect consecutive 5xx/4xx", () => {
    c.record(500, false);
    c.record(0, true); // network error
    expect(c.consecutive5xx).toBe(1); // unchanged
    expect(c.totalNetworkErrors).toBe(1);
    expect(c.total5xx).toBe(1);
  });

  it("ignores status when hadError is true (only network counter increments)", () => {
    c.record(200, true);
    expect(c.totalSuccess).toBe(0);
    expect(c.totalNetworkErrors).toBe(1);
  });

  it("treats 3xx (which the fetcher follows) as success bucket", () => {
    // The fetcher follows redirects so we don't see 3xx, but the contract
    // says "<400 = success".
    c.record(301, false);
    expect(c.totalSuccess).toBe(1);
  });
});

describe("ErrorCounter — shouldAbort", () => {
  it("returns false when below both thresholds", () => {
    expect(c.shouldAbort(DEFAULT_OPTIONS)).toEqual({
      abort: false,
      reason: "",
    });
  });

  it("returns true when consecutive 5xx hits the threshold", () => {
    const opts = { ...DEFAULT_OPTIONS, consecutive5xxAbort: 3 };
    c.record(500, false);
    c.record(502, false);
    expect(c.shouldAbort(opts).abort).toBe(false);
    c.record(503, false);
    expect(c.shouldAbort(opts)).toEqual({
      abort: true,
      reason: expect.stringMatching(/3 consecutive 5xx/),
    });
  });

  it("returns true when consecutive 4xx hits the threshold", () => {
    const opts = {
      ...DEFAULT_OPTIONS,
      consecutive5xxAbort: 9999,
      consecutive4xxAbort: 2,
    };
    c.record(404, false);
    c.record(403, false);
    expect(c.shouldAbort(opts)).toEqual({
      abort: true,
      reason: expect.stringMatching(/2 consecutive 4xx/),
    });
  });

  it("does not abort when 4xx run is broken by a success", () => {
    const opts = { ...DEFAULT_OPTIONS, consecutive4xxAbort: 2 };
    c.record(404, false);
    c.record(200, false);
    c.record(404, false);
    expect(c.shouldAbort(opts).abort).toBe(false);
  });

  it("checks the 5xx threshold before the 4xx threshold", () => {
    const opts = {
      ...DEFAULT_OPTIONS,
      consecutive5xxAbort: 1,
      consecutive4xxAbort: 1,
    };
    c.record(500, false);
    expect(c.shouldAbort(opts).reason).toMatch(/5xx/);
  });
});

describe("ErrorCounter — summary", () => {
  it("renames internal fields to public summary keys", () => {
    c.record(200, false);
    c.record(200, false);
    c.record(500, false);
    c.record(404, false);
    c.record(0, true);
    expect(c.summary()).toEqual({
      success: 2,
      fivexx: 1,
      fourxx: 1,
      network_errors: 1,
    });
  });
});

// ─── rateLimitedFetch ────────────────────────────────────────────────
//
// Notes on test design:
//   - rateLimitedFetch keeps a module-level lastFetchByDomain map. Tests
//     mint a unique hostname per call to avoid cross-test bleed.
//   - global fetch is stubbed with vi.stubGlobal. Each describe-block resets
//     the stub between tests.
//   - Backoff between retries is `1000 * 2^attempt`. Tests that exercise
//     retries use vi.useFakeTimers + advanceTimersByTimeAsync to skip past
//     those waits without burning real seconds.
//   - For headers / status / counter-integration paths we use real timers
//     with rateLimitMs=0 + retries=0, so nothing waits.

type FetchMock = Mock<typeof fetch>;

function uniqUrl(path = "/"): string {
  return `https://t-${randomUUID()}.example.com${path}`;
}

function fastOpts(over: Partial<ScrapeOptions> = {}): ScrapeOptions {
  return {
    ...DEFAULT_OPTIONS,
    rateLimitMs: 0,
    retries: 0,
    timeoutMs: 5_000,
    ...over,
  };
}

function makeResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string>; url?: string } = {},
): Response {
  const headers = new Headers(init.headers ?? { "content-type": "text/html" });
  const res = new Response(body, {
    status: init.status ?? 200,
    headers,
  });
  if (init.url) {
    Object.defineProperty(res, "url", { value: init.url, configurable: true });
  }
  return res;
}

function stubFetch(impl: typeof fetch): FetchMock {
  const m = vi.fn<typeof fetch>(impl);
  vi.stubGlobal("fetch", m);
  return m;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("rateLimitedFetch — happy path", () => {
  it("returns body + status + content-type for a 200 text/html response", async () => {
    const url = uniqUrl();
    stubFetch(
      async () =>
        makeResponse("<html>hi</html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
          url,
        }),
    );
    const r = await rateLimitedFetch(url, fastOpts());
    expect(r.status).toBe(200);
    expect(r.body).toBe("<html>hi</html>");
    expect(r.contentType).toBe("text/html; charset=utf-8");
    expect(r.url).toBe(url);
    expect(r.finalUrl).toBe(url);
    expect(r.error).toBeUndefined();
    expect(typeof r.fetched_at).toBe("string");
  });

  it("treats application/json as text and returns body", async () => {
    stubFetch(
      async () =>
        makeResponse('{"ok":true}', {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const r = await rateLimitedFetch(uniqUrl(), fastOpts());
    expect(r.body).toBe('{"ok":true}');
    expect(r.contentType).toBe("application/json");
  });

  it("treats application/xml as text", async () => {
    stubFetch(
      async () =>
        makeResponse("<root/>", {
          status: 200,
          headers: { "content-type": "application/xml" },
        }),
    );
    const r = await rateLimitedFetch(uniqUrl(), fastOpts());
    expect(r.body).toBe("<root/>");
  });

  it("treats missing content-type as text", async () => {
    stubFetch(
      async () =>
        new Response("no-ct-but-text", {
          status: 200,
          // no content-type header
        }),
    );
    const r = await rateLimitedFetch(uniqUrl(), fastOpts());
    // Note: undici/Response always synthesises a content-type for non-empty
    // bodies, so this asserts the *shape* — body present, status 200.
    expect(r.status).toBe(200);
    expect(r.body).toBe("no-ct-but-text");
  });

  it("returns body=null for a 200 response with non-text content-type", async () => {
    stubFetch(
      async () =>
        makeResponse("PNG-BYTES", {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );
    const r = await rateLimitedFetch(uniqUrl(), fastOpts());
    expect(r.status).toBe(200);
    expect(r.body).toBeNull();
    expect(r.contentType).toBe("image/png");
    expect(r.error).toBeUndefined();
  });

  it("preserves finalUrl when the response was redirected", async () => {
    const original = uniqUrl("/old");
    const final = original.replace("/old", "/new");
    stubFetch(
      async () =>
        makeResponse("redirected!", {
          status: 200,
          url: final,
        }),
    );
    const r = await rateLimitedFetch(original, fastOpts());
    expect(r.url).toBe(original);
    expect(r.finalUrl).toBe(final);
  });
});

describe("rateLimitedFetch — request shape", () => {
  it("sends User-Agent + Accept + Accept-Language headers", async () => {
    const fetchMock = stubFetch(async () => makeResponse("ok"));
    const opts = fastOpts({
      userAgent: "TestAgent/9.9 (+https://example.test)",
    });
    await rateLimitedFetch(uniqUrl(), opts);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("TestAgent/9.9 (+https://example.test)");
    expect(headers["Accept"]).toMatch(/text\/html/);
    expect(headers["Accept-Language"]).toMatch(/ja/);
    expect(init.redirect).toBe("follow");
  });

  it("passes an AbortSignal to fetch (so timeout can fire)", async () => {
    const fetchMock = stubFetch(async () => makeResponse("ok"));
    await rateLimitedFetch(uniqUrl(), fastOpts());
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeDefined();
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});

describe("rateLimitedFetch — invalid URL", () => {
  it("returns status:0 + error without calling fetch", async () => {
    const fetchMock = stubFetch(async () => makeResponse("ok"));
    const r = await rateLimitedFetch("not-a-real-url", fastOpts());
    expect(r.status).toBe(0);
    expect(r.body).toBeNull();
    expect(r.error).toMatch(/invalid URL/i);
    expect(r.url).toBe("not-a-real-url");
    expect(r.finalUrl).toBe("not-a-real-url");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("rateLimitedFetch — 4xx (no retry)", () => {
  it("returns 404 immediately and does not retry", async () => {
    const fetchMock = stubFetch(async () => makeResponse("", { status: 404 }));
    const r = await rateLimitedFetch(uniqUrl(), fastOpts({ retries: 3 }));
    expect(r.status).toBe(404);
    expect(r.body).toBeNull();
    expect(r.error).toBe("HTTP 404");
    expect(fetchMock).toHaveBeenCalledTimes(1); // no retry on 4xx
  });

  it("records a 4xx in the ErrorCounter", async () => {
    stubFetch(async () => makeResponse("", { status: 403 }));
    const counter = new ErrorCounter();
    await rateLimitedFetch(uniqUrl(), fastOpts(), counter);
    expect(counter.summary()).toEqual({
      success: 0,
      fivexx: 0,
      fourxx: 1,
      network_errors: 0,
    });
  });
});

describe("rateLimitedFetch — 5xx (retry)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("retries up to `retries` times on 5xx then returns last status", async () => {
    const fetchMock = stubFetch(
      async () => makeResponse("", { status: 503 }),
    );
    const promise = rateLimitedFetch(uniqUrl(), fastOpts({ retries: 2 }));
    // retries=2 means up to 3 attempts; backoff after each non-final = 1s, 2s
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(r.status).toBe(503);
    expect(r.error).toBe("HTTP 503");
  });

  it("succeeds on the second attempt if the first is 5xx", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      if (calls === 1) return makeResponse("", { status: 502 });
      return makeResponse("recovered", { status: 200 });
    });
    const promise = rateLimitedFetch(uniqUrl(), fastOpts({ retries: 2 }));
    await vi.advanceTimersByTimeAsync(5_000);
    const r = await promise;
    expect(r.status).toBe(200);
    expect(r.body).toBe("recovered");
    expect(calls).toBe(2);
  });

  it("records both the failed 5xx and the eventual success in the counter", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      return calls === 1
        ? makeResponse("", { status: 500 })
        : makeResponse("ok", { status: 200 });
    });
    const counter = new ErrorCounter();
    const promise = rateLimitedFetch(
      uniqUrl(),
      fastOpts({ retries: 1 }),
      counter,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await promise;
    expect(counter.total5xx).toBe(1);
    expect(counter.totalSuccess).toBe(1);
    // 5xx then success → consecutive5xx reset to 0
    expect(counter.consecutive5xx).toBe(0);
  });
});

describe("rateLimitedFetch — network errors (retry)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("retries on network error and then returns error after exhausting retries", async () => {
    const fetchMock = stubFetch(async () => {
      throw new Error("ECONNRESET: network blew up");
    });
    const counter = new ErrorCounter();
    const promise = rateLimitedFetch(
      uniqUrl(),
      fastOpts({ retries: 1 }),
      counter,
    );
    await vi.advanceTimersByTimeAsync(5_000);
    const r = await promise;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.status).toBe(0);
    expect(r.error).toMatch(/ECONNRESET/);
    expect(r.body).toBeNull();
    expect(counter.totalNetworkErrors).toBe(1);
  });

  it("recovers on a later attempt when the network error is transient", async () => {
    let calls = 0;
    stubFetch(async () => {
      calls++;
      if (calls < 3) throw new Error("transient");
      return makeResponse("finally", { status: 200 });
    });
    const promise = rateLimitedFetch(uniqUrl(), fastOpts({ retries: 2 }));
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await promise;
    expect(calls).toBe(3);
    expect(r.status).toBe(200);
    expect(r.body).toBe("finally");
  });
});

describe("rateLimitedFetch — timeout (AbortController)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("aborts a request that exceeds timeoutMs", async () => {
    // fetch hangs forever — until aborted.
    stubFetch(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const sig = (init as RequestInit | undefined)?.signal;
          if (sig) {
            sig.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }
        }),
    );
    const promise = rateLimitedFetch(
      uniqUrl(),
      fastOpts({ timeoutMs: 100, retries: 0 }),
    );
    await vi.advanceTimersByTimeAsync(500);
    const r = await promise;
    expect(r.status).toBe(0);
    expect(r.error).toBeDefined();
    expect(r.body).toBeNull();
  });
});

describe("rateLimitedFetch — per-domain rate limit", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
  });

  it("waits at least rateLimitMs between two calls to the same domain", async () => {
    let n = 0;
    const callTimes: number[] = [];
    stubFetch(async () => {
      callTimes.push(Date.now());
      n++;
      return makeResponse(`b${n}`, { status: 200 });
    });
    const url = uniqUrl();
    const opts = fastOpts({ rateLimitMs: 5_000 });

    // First call — fires immediately.
    const p1 = rateLimitedFetch(url, opts);
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    const t1 = callTimes[0];

    // Second call to the same host must wait for the rate-limit window.
    const p2 = rateLimitedFetch(url, opts);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(callTimes.length).toBe(1); // still waiting
    await vi.advanceTimersByTimeAsync(2);
    await p2;
    expect(callTimes.length).toBe(2);
    expect(callTimes[1] - t1).toBeGreaterThanOrEqual(5_000);
  });

  it("does not throttle across distinct domains", async () => {
    const callTimes: number[] = [];
    stubFetch(async () => {
      callTimes.push(Date.now());
      return makeResponse("ok");
    });
    const opts = fastOpts({ rateLimitMs: 10_000 });
    const u1 = uniqUrl();
    const u2 = uniqUrl();
    const p1 = rateLimitedFetch(u1, opts);
    const p2 = rateLimitedFetch(u2, opts);
    await vi.advanceTimersByTimeAsync(0);
    await p1;
    await p2;
    expect(callTimes.length).toBe(2);
    // Both fire at the same fake timestamp — different hosts, no waiting.
    expect(callTimes[1] - callTimes[0]).toBe(0);
  });
});
