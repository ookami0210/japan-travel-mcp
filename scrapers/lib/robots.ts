/**
 * robots.txt judgment, implementing the policy from DATA_POLICY.md:
 *
 *   Disallow: /admin/, /member/  → always respect (clearly private)
 *   Disallow: /tourism/          → not respected (content was published to attract visitors)
 *   Disallow: /                  → judgment: blanket-block on tourism content is treated
 *                                  as legacy/load-fear, not publisher intent against readers
 *
 * The logic IS the policy — see DATA_POLICY.md.
 */

import robotsParserImport from "robots-parser";
import { rateLimitedFetch } from "./fetcher.js";
import type { RobotsDecision, ScrapeOptions } from "./types.js";

// robots-parser ships an incomplete .d.ts (`declare module 'robots-parser';`
// with no signature). Provide a typed wrapper.
interface Robot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  isDisallowed(url: string, ua?: string): boolean | undefined;
  getMatchingLineNumber(url: string, ua?: string): number;
  getCrawlDelay(ua?: string): number | undefined;
  getSitemaps(): string[];
  getPreferredHost(): string | null;
}
const robotsParser = robotsParserImport as unknown as (
  url: string,
  contents: string,
) => Robot;

const robotsCache = new Map<string, Robot | null>();

const ALWAYS_RESPECT_PATHS = [
  "/admin",
  "/member",
  "/login",
  "/wp-admin",
  "/cgi-bin",
  "/private",
  "/internal",
];

const TOURISM_PATH_PATTERNS = [
  /kanko/i,
  /kankou/i,
  /tourism/i,
  /sightseeing/i,
  /観光/,
  /見どころ/,
  /名所/,
  /旅行/,
];

async function getRobotsForDomain(
  hostname: string,
  protocol: string,
  opts: ScrapeOptions,
): Promise<Robot | null> {
  if (robotsCache.has(hostname)) {
    return robotsCache.get(hostname) ?? null;
  }
  const robotsUrl = `${protocol}//${hostname}/robots.txt`;
  const res = await rateLimitedFetch(robotsUrl, opts);
  if (!res.body || res.status !== 200) {
    robotsCache.set(hostname, null);
    return null;
  }
  const parser = robotsParser(robotsUrl, res.body);
  robotsCache.set(hostname, parser);
  return parser;
}

function userAgentToken(fullUserAgent: string): string {
  return fullUserAgent.split("/")[0] ?? "JapanTravelMCP";
}

export async function shouldCrawl(
  url: string,
  opts: ScrapeOptions,
): Promise<RobotsDecision> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: "invalid URL" };
  }

  const path = parsed.pathname;

  // 1. Structurally private paths — always respect.
  for (const p of ALWAYS_RESPECT_PATHS) {
    if (path.startsWith(p)) {
      return {
        allowed: false,
        reason: `path is structurally private (${p})`,
      };
    }
  }

  const robots = await getRobotsForDomain(parsed.hostname, parsed.protocol, opts);
  if (!robots) {
    return { allowed: true, reason: "no robots.txt" };
  }

  const ua = userAgentToken(opts.userAgent);
  const allowed = robots.isAllowed(url, ua);
  if (allowed === undefined || allowed === true) {
    return { allowed: true, reason: "robots.txt allows" };
  }

  // robots.txt disallows. Apply DATA_POLICY judgment.
  const isTourismPath = TOURISM_PATH_PATTERNS.some((p) => p.test(path));
  if (!isTourismPath) {
    return {
      allowed: false,
      reason: "robots.txt disallows non-tourism path; respecting",
    };
  }

  // It's a tourism path. Check if the disallow is blanket (`Disallow: /`)
  // by probing the root.
  const rootAllowed = robots.isAllowed(`${parsed.protocol}//${parsed.hostname}/`, ua);
  if (rootAllowed === false) {
    // Blanket Disallow: /
    return {
      allowed: true,
      reason:
        "blanket Disallow: / on tourism content; per DATA_POLICY treating as legacy/load-fear, not intent against readers",
    };
  }

  // Specific rule against this tourism path.
  return {
    allowed: false,
    reason: "specific Disallow rule on tourism path; respecting publisher intent",
  };
}
