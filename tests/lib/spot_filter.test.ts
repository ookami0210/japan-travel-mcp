import { describe, it, expect } from "vitest";
import { passesSpotFilter } from "../../scrapers/lib/spot_filter.js";

describe("passesSpotFilter", () => {
  it("rejects a title shorter than 3 chars", () => {
    const r = passesSpotFilter({
      url: "https://example.com/kanko/abc",
      title: "Hi",
      description: "観光情報",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/title too short/);
  });

  it("rejects infrastructure titles (Search / Sitemap / Privacy / 404)", () => {
    // Note: titles must be ≥3 chars to bypass the prior "title too short" check.
    for (const title of [
      "Search",
      "Search Results",
      "サイトマップ",
      "Privacy Policy",
      "プライバシーポリシー",
      "Page Not Found",
      "404 Not Found",
    ]) {
      const r = passesSpotFilter({
        url: "https://example.com/kanko/page",
        title,
        description: "観光",
      });
      expect(r.ok, `expected reject for title="${title}"`).toBe(false);
      expect(r.reason).toMatch(/infrastructure title/);
    }
  });

  it("rejects very-short infrastructure titles via the length gate", () => {
    // "検索" is 2 chars — the length gate fires before the title-pattern gate.
    const r = passesSpotFilter({
      url: "https://example.com/kanko/page",
      title: "検索",
      description: "観光",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/title too short/);
  });

  it("rejects URLs that look like infrastructure when no tourism keyword anywhere", () => {
    const r = passesSpotFilter({
      url: "https://example.com/search/?q=foo",
      title: "Some Page",
      description: "Generic page about nothing in particular",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/infrastructure URL/);
  });

  it("accepts a tourism URL even if path looks like /search/ when title contains a tourism keyword", () => {
    const r = passesSpotFilter({
      url: "https://example.com/search/?genre=sightseeing",
      title: "観光スポット検索",
      description: null,
    });
    expect(r.ok).toBe(true);
  });

  it("rejects a page with no description and no tourism keyword in title or URL", () => {
    const r = passesSpotFilter({
      url: "https://example.com/page/123",
      title: "Generic page title",
      description: "",
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no description/);
  });

  it("accepts a real tourism spot", () => {
    const r = passesSpotFilter({
      url: "https://example.com/kanko/spots/itsukushima",
      title: "厳島神社",
      description: "海に浮かぶ朱塗りの社殿。",
    });
    expect(r.ok).toBe(true);
  });

  it("accepts a page when only the URL carries the tourism keyword", () => {
    const r = passesSpotFilter({
      url: "https://example.com/sightseeing/spots/123",
      title: "詳細ページ",
      description: "",
    });
    expect(r.ok).toBe(true);
  });

  it("URL-derived tourism keyword overrides /search/ rejection", () => {
    const r = passesSpotFilter({
      url: "https://example.com/search/?cat=kanko",
      title: "List",
      description: null,
    });
    expect(r.ok).toBe(true);
  });
});
