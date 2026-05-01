import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the fetcher BEFORE importing robots.ts so getRobotsForDomain picks
// up the stub instead of hitting the network. robots.ts only imports
// rateLimitedFetch, so that's all we need to provide.
vi.mock("../../scrapers/lib/fetcher.js", () => ({
  rateLimitedFetch: vi.fn(),
}));

import { shouldCrawl } from "../../scrapers/lib/robots.js";
import { rateLimitedFetch } from "../../scrapers/lib/fetcher.js";
import { DEFAULT_OPTIONS } from "../../scrapers/lib/types.js";
import type { FetchResult } from "../../scrapers/lib/types.js";

const mockedFetch = vi.mocked(rateLimitedFetch);

// robots.ts caches parsers by hostname at module scope. Each test below
// uses a unique hostname so the cache from a previous test never bleeds
// into the next one.
let hostCounter = 0;
function uniqueHost(): string {
  hostCounter += 1;
  return `t${hostCounter}.example.jp`;
}

function robotsBody(body: string | null, status = 200): FetchResult {
  return {
    url: "robots-stub",
    finalUrl: "robots-stub",
    status,
    contentType: "text/plain",
    body,
    fetched_at: "2026-05-01T00:00:00Z",
  };
}

beforeEach(() => {
  mockedFetch.mockReset();
});

// ─── Invalid URL guard ────────────────────────────────────────────────

describe("shouldCrawl — input validation", () => {
  it("returns allowed=false for a malformed URL", async () => {
    const out = await shouldCrawl("not a url", DEFAULT_OPTIONS);
    expect(out.allowed).toBe(false);
    expect(out.reason).toBe("invalid URL");
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

// ─── ALWAYS_RESPECT_PATHS — blocked regardless of robots.txt ──────────

describe("shouldCrawl — structurally private paths", () => {
  it.each([
    "/admin",
    "/admin/users",
    "/member",
    "/member/area",
    "/login",
    "/wp-admin",
    "/cgi-bin/script",
    "/private",
    "/internal/dashboard",
  ])("blocks %s without consulting robots.txt", async (path) => {
    const host = uniqueHost();
    const out = await shouldCrawl(`https://${host}${path}`, DEFAULT_OPTIONS);
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("structurally private");
    // Critical: never even fetch robots.txt for these paths.
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("blocks /admin even if robots.txt explicitly allows it (path rule wins)", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(robotsBody("User-agent: *\nAllow: /\n"));

    const out = await shouldCrawl(
      `https://${host}/admin/anything`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("structurally private");
  });
});

// ─── No robots.txt → permissive default ───────────────────────────────

describe("shouldCrawl — no robots.txt", () => {
  it("allows the URL when robots.txt is missing (404)", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(robotsBody(null, 404));

    const out = await shouldCrawl(
      `https://${host}/kanko/spot/1`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("no robots.txt");
  });

  it("allows the URL when robots.txt fetch returns no body", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(robotsBody(null, 200));

    const out = await shouldCrawl(
      `https://${host}/tourism/page`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("no robots.txt");
  });
});

// ─── Allow / Disallow on non-tourism paths ────────────────────────────

describe("shouldCrawl — non-tourism paths", () => {
  it("allows when robots.txt has no rule against the path", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /backend/\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/about`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("robots.txt allows");
  });

  it("respects Disallow on a non-tourism path", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /backend/\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/backend/secret`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("non-tourism path");
  });
});

// ─── Tourism paths — the DATA_POLICY judgment ─────────────────────────

describe("shouldCrawl — tourism paths (DATA_POLICY judgment)", () => {
  it.each([
    "/kanko/spot",
    "/kankou/feature",
    "/tourism/about",
    "/sightseeing/list",
  ])("identifies %s as a tourism path (Latin patterns)", async (path) => {
    const host = uniqueHost();
    // robots.txt blocks the specific tourism path AND the root.
    // → blanket block on tourism content → per DATA_POLICY, allowed.
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /\n"),
    );

    const out = await shouldCrawl(`https://${host}${path}`, DEFAULT_OPTIONS);
    expect(out.allowed).toBe(true);
    expect(out.reason).toContain("blanket Disallow");
    expect(out.reason).toContain("DATA_POLICY");
  });

  it("does NOT recognise Japanese tourism keywords in the URL path (current limitation)", async () => {
    // TOURISM_PATH_PATTERNS contains /観光/, /見どころ/, /名所/, /旅行/, but
    // shouldCrawl tests them against `parsed.pathname` — and `new URL()`
    // percent-encodes non-ASCII (`/観光/info` → `/%E8%A6%B3%E5%85%89/info`),
    // so those regexes never match. Pinning current behavior: a Japanese
    // tourism path under a blanket Disallow is treated as non-tourism and
    // gets blocked. If that ever changes (e.g. by decoding pathname before
    // matching), this test will fail and the policy doc should follow.
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/観光/info`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("non-tourism");
  });

  it("allows a tourism path under a blanket Disallow: /", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/kanko/spot/1`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(true);
    expect(out.reason).toContain("blanket");
  });

  it("blocks a tourism path with a SPECIFIC Disallow rule (not blanket)", async () => {
    const host = uniqueHost();
    // Disallow exactly /kanko/, but the root is reachable. That's an
    // intentional "don't crawl this section" — respect publisher intent.
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /kanko/\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/kanko/spot/1`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(false);
    expect(out.reason).toContain("specific Disallow");
  });

  it("allows a tourism path explicitly Allowed by robots.txt", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /\nAllow: /tourism/\n"),
    );

    const out = await shouldCrawl(
      `https://${host}/tourism/page`,
      DEFAULT_OPTIONS,
    );
    expect(out.allowed).toBe(true);
    expect(out.reason).toBe("robots.txt allows");
  });
});

// ─── User-agent handling ──────────────────────────────────────────────

describe("shouldCrawl — user-agent token", () => {
  it("matches the user-agent token before '/' against robots.txt UA groups", async () => {
    // robots.txt blocks /backend/ for "JapanTravelMCP" specifically and
    // allows everyone else. We make two calls against the same
    // robots.txt — once with our UA (must be blocked), once with a
    // different UA (must pass) — proving the UA-token logic actually
    // selects the right UA group.
    const host1 = uniqueHost();
    const host2 = uniqueHost();
    const body =
      "User-agent: JapanTravelMCP\nDisallow: /backend/\n\nUser-agent: *\nAllow: /\n";
    mockedFetch.mockResolvedValueOnce(robotsBody(body));
    mockedFetch.mockResolvedValueOnce(robotsBody(body));

    const ours = { ...DEFAULT_OPTIONS, userAgent: "JapanTravelMCP/1.0 (+x)" };
    const other = { ...DEFAULT_OPTIONS, userAgent: "OtherBot/2.0" };

    const blocked = await shouldCrawl(`https://${host1}/backend/x`, ours);
    const allowed = await shouldCrawl(`https://${host2}/backend/x`, other);

    expect(blocked.allowed).toBe(false);
    expect(allowed.allowed).toBe(true);
  });
});

// ─── Cache behavior ───────────────────────────────────────────────────

describe("shouldCrawl — robots.txt cache", () => {
  it("fetches robots.txt at most once per hostname across calls", async () => {
    const host = uniqueHost();
    mockedFetch.mockResolvedValueOnce(
      robotsBody("User-agent: *\nDisallow: /backend/\n"),
    );

    await shouldCrawl(`https://${host}/page-1`, DEFAULT_OPTIONS);
    await shouldCrawl(`https://${host}/page-2`, DEFAULT_OPTIONS);
    await shouldCrawl(`https://${host}/backend/secret`, DEFAULT_OPTIONS);

    // robots.txt fetched once; subsequent calls hit the in-process cache.
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});
