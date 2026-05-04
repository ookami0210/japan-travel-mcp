/**
 * Rate-limited HTTP fetcher.
 *
 * Enforces:
 *   - per-domain minimum interval (ScrapeOptions.rateLimitMs)
 *   - per-request timeout
 *   - bounded retries with exponential backoff on network errors
 *
 * Tracks consecutive 5xx / 4xx counts so the caller can trigger auto-stop.
 */

import type { FetchResult, ScrapeOptions } from "./types.js";

const lastFetchByDomain = new Map<string, number>();

export class ErrorCounter {
  consecutive5xx = 0;
  consecutive4xx = 0;
  total5xx = 0;
  total4xx = 0;
  totalNetworkErrors = 0;
  totalSuccess = 0;

  record(status: number, hadError: boolean): void {
    if (hadError) {
      this.totalNetworkErrors += 1;
      // Network errors don't increment consecutive5xx; treat separately.
      return;
    }
    if (status >= 500) {
      this.consecutive5xx += 1;
      this.total5xx += 1;
      this.consecutive4xx = 0;
    } else if (status >= 400) {
      this.consecutive4xx += 1;
      this.total4xx += 1;
      this.consecutive5xx = 0;
    } else {
      this.consecutive5xx = 0;
      this.consecutive4xx = 0;
      this.totalSuccess += 1;
    }
  }

  shouldAbort(opts: ScrapeOptions): { abort: boolean; reason: string } {
    if (this.consecutive5xx >= opts.consecutive5xxAbort) {
      return {
        abort: true,
        reason: `${this.consecutive5xx} consecutive 5xx responses`,
      };
    }
    if (this.consecutive4xx >= opts.consecutive4xxAbort) {
      return {
        abort: true,
        reason: `${this.consecutive4xx} consecutive 4xx responses`,
      };
    }
    return { abort: false, reason: "" };
  }

  summary(): {
    success: number;
    fivexx: number;
    fourxx: number;
    network_errors: number;
  } {
    return {
      success: this.totalSuccess,
      fivexx: this.total5xx,
      fourxx: this.total4xx,
      network_errors: this.totalNetworkErrors,
    };
  }
}

async function waitForRateLimit(domain: string, intervalMs: number): Promise<void> {
  const last = lastFetchByDomain.get(domain) ?? 0;
  const wait = Math.max(0, last + intervalMs - Date.now());
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastFetchByDomain.set(domain, Date.now());
}

export async function rateLimitedFetch(
  url: string,
  opts: ScrapeOptions,
  counter?: ErrorCounter,
): Promise<FetchResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (err) {
    return {
      url,
      finalUrl: url,
      status: 0,
      contentType: null,
      body: null,
      fetched_at: new Date().toISOString(),
      error: `invalid URL: ${(err as Error).message}`,
    };
  }
  const domain = parsedUrl.hostname;
  await waitForRateLimit(domain, opts.rateLimitMs);

  const fetchedAt = new Date().toISOString();
  let lastError: string | undefined;
  let lastStatus = 0;
  let lastFinalUrl = url;
  let lastContentType: string | null = null;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const ctrl = new AbortController();
    const timeoutHandle = setTimeout(() => ctrl.abort(), opts.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: {
          "User-Agent": opts.userAgent,
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "ja,en;q=0.8,zh;q=0.5,ko;q=0.3",
        },
      });
      clearTimeout(timeoutHandle);
      lastStatus = res.status;
      lastFinalUrl = res.url || url;
      lastContentType = res.headers.get("content-type");

      const isText =
        !lastContentType ||
        /^(text\/|application\/(xhtml\+xml|xml|json))/i.test(lastContentType);

      if (res.ok && isText) {
        const body = await res.text();
        counter?.record(res.status, false);
        return {
          url,
          finalUrl: lastFinalUrl,
          status: res.status,
          contentType: lastContentType,
          body,
          fetched_at: fetchedAt,
        };
      }

      if (!res.ok) {
        counter?.record(res.status, false);
        // Don't retry on 4xx
        if (res.status >= 400 && res.status < 500) {
          return {
            url,
            finalUrl: lastFinalUrl,
            status: res.status,
            contentType: lastContentType,
            body: null,
            fetched_at: fetchedAt,
            error: `HTTP ${res.status}`,
          };
        }
        // 5xx — retry
        lastError = `HTTP ${res.status}`;
      } else {
        // ok but not text — not useful for us
        return {
          url,
          finalUrl: lastFinalUrl,
          status: res.status,
          contentType: lastContentType,
          body: null,
          fetched_at: fetchedAt,
        };
      }
    } catch (err) {
      clearTimeout(timeoutHandle);
      lastError = (err as Error).message ?? String(err);
    }

    if (attempt < opts.retries) {
      const backoff = 1000 * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, backoff));
      // Reset rate limit window for next attempt to same domain
      await waitForRateLimit(domain, opts.rateLimitMs);
    }
  }

  counter?.record(lastStatus, !!lastError);
  return {
    url,
    finalUrl: lastFinalUrl,
    status: lastStatus,
    contentType: lastContentType,
    body: null,
    fetched_at: fetchedAt,
    error: lastError ?? "exhausted retries",
  };
}
