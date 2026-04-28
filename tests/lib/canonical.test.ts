import { describe, it, expect } from "vitest";
import {
  canonicalize,
  pickCanonical,
} from "../../scrapers/lib/canonical.js";

describe("canonicalize", () => {
  it("returns input unchanged for non-URL strings", () => {
    expect(canonicalize("not a url")).toBe("not a url");
  });

  it("lowercases hostname", () => {
    expect(canonicalize("HTTPS://Example.COM/path")).toBe(
      "https://example.com/path",
    );
  });

  it("strips default ports (443 / 80)", () => {
    expect(canonicalize("https://example.com:443/x")).toBe(
      "https://example.com/x",
    );
    expect(canonicalize("http://example.com:80/x")).toBe(
      "http://example.com/x",
    );
  });

  it("preserves non-default ports", () => {
    expect(canonicalize("https://example.com:8443/x")).toBe(
      "https://example.com:8443/x",
    );
  });

  it("removes URL fragments", () => {
    expect(canonicalize("https://example.com/x#section")).toBe(
      "https://example.com/x",
    );
  });

  it("strips index.html / index.php / default.html", () => {
    expect(canonicalize("https://example.com/site/index.html")).toBe(
      "https://example.com/site",
    );
    expect(canonicalize("https://example.com/foo/index.php")).toBe(
      "https://example.com/foo",
    );
    expect(canonicalize("https://example.com/x/default.html")).toBe(
      "https://example.com/x",
    );
  });

  it("trims trailing slashes on non-root paths", () => {
    expect(canonicalize("https://example.com/site/kanko/")).toBe(
      "https://example.com/site/kanko",
    );
    expect(canonicalize("https://example.com/site/kanko////")).toBe(
      "https://example.com/site/kanko",
    );
  });

  it("preserves the single root slash", () => {
    expect(canonicalize("https://example.com/")).toBe("https://example.com/");
  });

  it("removes tracking parameters", () => {
    const got = canonicalize(
      "https://example.com/x?utm_source=fb&utm_medium=social&id=42",
    );
    expect(got).toBe("https://example.com/x?id=42");
  });

  it("removes all listed tracking params", () => {
    const got = canonicalize(
      "https://example.com/x?fbclid=a&gclid=b&msclkid=c&ref=d",
    );
    expect(got).toBe("https://example.com/x");
  });

  it("sorts remaining query parameters for stability", () => {
    const a = canonicalize("https://example.com/x?b=2&a=1");
    const b = canonicalize("https://example.com/x?a=1&b=2");
    expect(a).toBe(b);
    expect(a).toBe("https://example.com/x?a=1&b=2");
  });

  it("converges different spellings to the same URL", () => {
    const variants = [
      "HTTPS://Example.com:443/site/kanko/index.html?utm_source=x",
      "https://example.com/site/kanko/?utm_source=y#section",
      "https://example.com/site/kanko",
    ];
    const canonical = variants.map(canonicalize);
    expect(new Set(canonical).size).toBe(1);
    expect(canonical[0]).toBe("https://example.com/site/kanko");
  });
});

describe("pickCanonical", () => {
  it("page-declared canonical wins over fetched URL", () => {
    const got = pickCanonical(
      "https://example.com/site/kanko/?utm_source=x",
      "https://example.com/site/kanko",
      "https://example.com/",
    );
    expect(got).toBe("https://example.com/site/kanko");
  });

  it("resolves relative page-declared canonical against base", () => {
    const got = pickCanonical(
      "https://example.com/a/b/?fbclid=y",
      "/canonical/path",
      "https://example.com/a/b/",
    );
    expect(got).toBe("https://example.com/canonical/path");
  });

  it("falls back to fetched URL canonicalisation when no declaration", () => {
    expect(
      pickCanonical(
        "https://Example.COM/path/?utm_source=x",
        null,
        "https://example.com/",
      ),
    ).toBe("https://example.com/path");
  });

  it("falls back to fetched URL when declared canonical is invalid", () => {
    expect(
      pickCanonical(
        "https://example.com/path/",
        "::: not a url :::",
        "://invalid-base",
      ),
    ).toBe("https://example.com/path");
  });
});
