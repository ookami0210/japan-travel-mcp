import { expect } from "vitest";
import type { FetchResult } from "../../scrapers/lib/types.js";

/**
 * Asserts a value is defined (non-null, non-undefined) and narrows the
 * static type. Use after `expect(x).toBeDefined()` so subsequent
 * dereferences don't need `!` or `as` casts.
 */
export function assertDefined<T>(
  value: T,
  message = "expected value to be defined",
): asserts value is NonNullable<T> {
  expect(value, message).toBeDefined();
  expect(value, message).not.toBeNull();
}

/**
 * Build a `FetchResult` with reasonable defaults. Pass an override object
 * for the fields that matter to the test.
 */
export function makeFetchResult(
  overrides: Partial<FetchResult> & Pick<FetchResult, "status">,
): FetchResult {
  const url = overrides.url ?? "https://example.com/";
  return {
    url,
    finalUrl: overrides.finalUrl ?? url,
    status: overrides.status,
    contentType: overrides.contentType ?? null,
    body: overrides.body ?? null,
    fetched_at: overrides.fetched_at ?? new Date().toISOString(),
    ...(overrides.error !== undefined ? { error: overrides.error } : {}),
  };
}

/** 200 OK with a text body. */
export function httpOk(body: string, contentType = "text/plain"): FetchResult {
  return makeFetchResult({ status: 200, contentType, body });
}

/** Non-200 response with empty body (used for missing/failed fetches). */
export function httpStatus(status: number): FetchResult {
  return makeFetchResult({ status });
}
