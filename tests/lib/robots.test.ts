import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { DEFAULT_OPTIONS } from "../../scrapers/lib/types.js";
import { httpOk, httpStatus } from "./_helpers.js";

vi.mock("../../scrapers/lib/fetcher.js", () => ({
  rateLimitedFetch: vi.fn(),
  ErrorCounter: class {},
}));

import { rateLimitedFetch } from "../../scrapers/lib/fetcher.js";
import { shouldCrawl } from "../../scrapers/lib/robots.js";

const mockedFetch = vi.mocked(rateLimitedFetch);

/**
 * shouldCrawl maintains a module-level robotsCache keyed by hostname. To
 * keep tests independent we mint a fresh hostname per call.
 */
function uniqHost(): string {
  return `t-${randomUUID()}.example.com`;
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("shouldCrawl — invalid URL", () => {
  it("rejects non-URL strings without hitting the network", async () => {
    const r = await shouldCrawl("not a url", DEFAULT_OPTIONS);
    expect(r).toEqual({
      allowed: false,
      reason: expect.stringMatching(/invalid URL/),
    });
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

describe("shouldCrawl — structurally private paths", () => {
  it.each([
    ["/admin/users", "/admin"],
    ["/member/profile", "/member"],
    ["/login", "/login"],
    ["/wp-admin/edit.php", "/wp-admin"],
    ["/cgi-bin/script", "/cgi-bin"],
    ["/private/data", "/private"],
    ["/internal/api", "/internal"],
  ])(
    "always rejects %s without consulting robots.txt",
    async (path, marker) => {
      const r = await shouldCrawl(
        `https://${uniqHost()}${path}`,
        DEFAULT_OPTIONS,
      );
      expect(r.allowed).toBe(false);
      expect(r.reason).toContain(marker);
      expect(mockedFetch).not.toHaveBeenCalled();
    },
  );
});

describe("shouldCrawl — robots.txt missing or unreachable", () => {
  it.each([
    ["404", httpStatus(404)],
    ["empty body", httpOk("")],
  ] as const)("allows when robots.txt response is %s", async (_, res) => {
    mockedFetch.mockResolvedValueOnce(res);
    const r = await shouldCrawl(
      `https://${uniqHost()}/sightseeing/`,
      DEFAULT_OPTIONS,
    );
    expect(r).toEqual({ allowed: true, reason: "no robots.txt" });
  });
});

describe("shouldCrawl — robots.txt allows", () => {
  it("allows when robots.txt explicitly allows the path", async () => {
    mockedFetch.mockResolvedValueOnce(
      httpOk("User-agent: *\nDisallow: /private/\n"),
    );
    const r = await shouldCrawl(
      `https://${uniqHost()}/kanko/spot/123`,
      DEFAULT_OPTIONS,
    );
    expect(r).toEqual({ allowed: true, reason: "robots.txt allows" });
  });
});

describe("shouldCrawl — disallow on non-tourism path", () => {
  it("respects a Disallow that targets non-tourism content", async () => {
    mockedFetch.mockResolvedValueOnce(
      httpOk("User-agent: *\nDisallow: /api/\n"),
    );
    const r = await shouldCrawl(
      `https://${uniqHost()}/api/data.json`,
      DEFAULT_OPTIONS,
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/non-tourism path/);
  });
});

describe("shouldCrawl — DATA_POLICY tourism judgment", () => {
  it("ignores blanket Disallow:/ on tourism path (legacy/load-fear)", async () => {
    mockedFetch.mockResolvedValue(httpOk("User-agent: *\nDisallow: /\n"));
    const r = await shouldCrawl(
      `https://${uniqHost()}/sightseeing/spot/1`,
      DEFAULT_OPTIONS,
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toMatch(/blanket Disallow/);
    expect(r.reason).toMatch(/DATA_POLICY/);
  });

  it("respects a SPECIFIC tourism disallow (not blanket)", async () => {
    mockedFetch.mockResolvedValue(
      httpOk("User-agent: *\nDisallow: /tourism/\n"),
    );
    const r = await shouldCrawl(
      `https://${uniqHost()}/tourism/spot/1`,
      DEFAULT_OPTIONS,
    );
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/specific Disallow/);
  });

  it("recognises tourism path under /kankou/ (alt romaji)", async () => {
    mockedFetch.mockResolvedValue(httpOk("User-agent: *\nDisallow: /\n"));
    const r = await shouldCrawl(
      `https://${uniqHost()}/kankou/spot`,
      DEFAULT_OPTIONS,
    );
    expect(r.allowed).toBe(true);
    expect(r.reason).toMatch(/blanket Disallow/);
  });
});

describe("shouldCrawl — robotsCache", () => {
  it("only fetches robots.txt once per hostname", async () => {
    const host = uniqHost();
    mockedFetch.mockResolvedValue(httpOk("User-agent: *\nAllow: /\n"));
    await shouldCrawl(`https://${host}/kanko/a`, DEFAULT_OPTIONS);
    await shouldCrawl(`https://${host}/kanko/b`, DEFAULT_OPTIONS);
    await shouldCrawl(`https://${host}/kanko/c`, DEFAULT_OPTIONS);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
