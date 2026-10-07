/**
 * The decisions the campground official-page crawl makes without the network
 * (scrapers/lib/campground_pages.ts).
 */

import { describe, expect, it } from "vitest";
import {
  contentHash,
  isStale,
  mergeVisit,
  normalizeUrl,
  scopePrefix,
  selectInfoLinks,
  sharedWithMunicipalCrawl,
  type CrawledSite,
} from "../../scrapers/lib/campground_pages.js";

const HOME = "https://midori-camp.jp/";

function link(href: string, text = ""): { href: string; text: string } {
  return { href, text };
}

describe("selectInfoLinks", () => {
  it("puts the pages a guest books on first", () => {
    const got = selectInfoLinks(
      [
        link("/blog/2026/04/snow.html", "春の雪だより"),
        link("/access.html", "アクセス"),
        link("/staff.html", "スタッフ紹介"),
        link("/price.html", "ご利用料金"),
      ],
      HOME,
      4,
    );
    expect(got.slice(0, 2)).toEqual([
      "https://midori-camp.jp/access.html",
      "https://midori-camp.jp/price.html",
    ]);
  });

  it("recognises the promise in the path when the link text is an image", () => {
    const got = selectInfoLinks([link("/about.html"), link("/ryokin/")], HOME, 2);
    // 料金 romanised in the path still ranks: the regex reads the URL too.
    expect(got[0]).toBe("https://midori-camp.jp/ryokin/");
  });

  it("keeps unlabelled pages, behind the promising ones", () => {
    const got = selectInfoLinks([link("/p1.html"), link("/yoyaku.html", "予約")], HOME, 2);
    expect(got).toEqual(["https://midori-camp.jp/yoyaku.html", "https://midori-camp.jp/p1.html"]);
  });

  it("stays on the site", () => {
    const got = selectInfoLinks(
      [link("https://nap-camp.com/aichi/1234", "予約はこちら"), link("/rule.html", "利用規約")],
      HOME,
      5,
    );
    expect(got).toEqual(["https://midori-camp.jp/rule.html"]);
  });

  it("treats www and bare host as the same site", () => {
    const got = selectInfoLinks([link("https://www.midori-camp.jp/price.html", "料金")], HOME, 5);
    expect(got).toEqual(["https://www.midori-camp.jp/price.html"]);
  });

  it("skips assets and account paths", () => {
    const got = selectInfoLinks(
      [
        link("/map.pdf", "アクセスマップ"),
        link("/photo.JPG", "施設写真"),
        link("/wp-admin/edit.php", "料金編集"),
        link("/guide.html", "ご利用案内"),
      ],
      HOME,
      5,
    );
    expect(got).toEqual(["https://midori-camp.jp/guide.html"]);
  });

  it("asks for each page once, and never for the homepage again", () => {
    const got = selectInfoLinks(
      [
        link("/price.html", "料金"),
        link("/price.html#tent", "テント料金"),
        link("/price.html?y=2026", "2026年料金"),
        link("/", "ホーム"),
        link(HOME, "トップ"),
      ],
      HOME,
      5,
    );
    expect(got).toEqual([
      "https://midori-camp.jp/price.html",
      "https://midori-camp.jp/price.html?y=2026",
    ]);
  });

  it("honours the page budget", () => {
    const many = Array.from({ length: 30 }, (_, i) => link(`/p${i}.html`, "料金"));
    expect(selectInfoLinks(many, HOME, 7)).toHaveLength(7);
  });

  it("survives a malformed link rather than losing the site", () => {
    const got = selectInfoLinks(
      [link("/%E8%AA%A4", "壊れた"), link("/bad%zz", "こわれた"), link("/fee.html", "料金")],
      HOME,
      5,
    );
    expect(got).toContain("https://midori-camp.jp/fee.html");
  });
});

describe("scopePrefix", () => {
  it("is the whole host for a site root", () => {
    expect(scopePrefix("https://midori-camp.jp/")).toBe("/");
    expect(scopePrefix("https://midori-camp.jp")).toBe("/");
    expect(scopePrefix("https://midori-camp.jp/index.html")).toBe("/");
  });

  it("is the facility's own directory when the URL is a page inside a site", () => {
    expect(scopePrefix("https://www.kaiyo-kankou.jp/spots/spots-1226/")).toBe(
      "/spots/spots-1226/",
    );
    expect(scopePrefix("https://camp.example.jp/yamanakako/price.html")).toBe("/yamanakako/");
  });
});

describe("selectInfoLinks — scope", () => {
  const SPOT = "https://www.kaiyo-kankou.jp/spots/spots-1226/";

  it("does not wander a portal when the URL is one spot page on it", () => {
    const got = selectInfoLinks(
      [
        link("/spots_cat/stay/", "泊まる"),
        link("/access/", "アクセス"),
        link("/", "海陽町観光協会"),
        link("/en/", "English"),
        link("/spots/spots-1226/price/", "ご利用料金"),
      ],
      SPOT,
      7,
    );
    expect(got).toEqual(["https://www.kaiyo-kankou.jp/spots/spots-1226/price/"]);
  });

  it("follows the whole host from a site root", () => {
    const got = selectInfoLinks([link("/access/", "アクセス"), link("/price/", "料金")], HOME, 7);
    expect(got).toHaveLength(2);
  });

  it("counts http and https as the same page", () => {
    const got = selectInfoLinks(
      [
        link("http://midori-camp.jp/", "トップ"),
        link("http://midori-camp.jp/price.html", "料金"),
        link("https://midori-camp.jp/price.html", "ご利用料金"),
      ],
      HOME,
      7,
    );
    expect(got).toHaveLength(1);
  });

  it("leaves the pages every site has and no guest books on", () => {
    const got = selectInfoLinks(
      [
        link("/privacy_page.html", "プライバシーポリシー"),
        link("/sitemap.html", "サイトマップ"),
        link("/company/", "会社概要"),
        link("/price.html", "料金"),
      ],
      HOME,
      7,
    );
    expect(got).toEqual(["https://midori-camp.jp/price.html"]);
  });
});

describe("isStale", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");

  it("is due when never read", () => {
    expect(isStale(undefined, now)).toBe(true);
  });

  it("is not due inside the window", () => {
    expect(isStale("2026-09-20T00:00:00Z", now)).toBe(false);
  });

  it("is due past the window", () => {
    expect(isStale("2026-08-20T00:00:00Z", now)).toBe(true);
  });

  it("is due when the timestamp is unreadable", () => {
    expect(isStale("last tuesday", now)).toBe(true);
  });
});

describe("sharedWithMunicipalCrawl", () => {
  it("recognises the hosts the municipal crawl also visits", () => {
    expect(sharedWithMunicipalCrawl("https://www.town.wassamu.hokkaido.jp/camp/")).toBe(true);
    expect(sharedWithMunicipalCrawl("https://town.setana.lg.jp/camp/")).toBe(true);
    expect(sharedWithMunicipalCrawl("https://www.city.oita.oita.jp/camp/")).toBe(true);
    expect(sharedWithMunicipalCrawl("https://www.env.go.jp/park/")).toBe(true);
  });

  it("leaves an operator's own domain on the normal interval", () => {
    expect(sharedWithMunicipalCrawl("https://midori-camp.jp/")).toBe(false);
    expect(sharedWithMunicipalCrawl("https://pica-resort.jp/")).toBe(false);
    // A private site that merely mentions a town in its name is not a
    // government host.
    expect(sharedWithMunicipalCrawl("https://towncamp.jp/")).toBe(false);
  });

  it("says no rather than throwing on an unusable URL", () => {
    expect(sharedWithMunicipalCrawl("not a url")).toBe(false);
  });
});

describe("contentHash", () => {
  it("is stable for the same text", () => {
    expect(contentHash("ご利用料金 4,000円")).toBe(contentHash("ご利用料金 4,000円"));
  });

  it("changes when the page changes — the signal a consumer re-reads on", () => {
    expect(contentHash("ご利用料金 4,000円")).not.toBe(contentHash("ご利用料金 4,500円"));
  });
});

describe("normalizeUrl", () => {
  it("resolves relative links against the page", () => {
    expect(normalizeUrl("price.html", "https://midori-camp.jp/info/")).toBe(
      "https://midori-camp.jp/info/price.html",
    );
  });

  it("drops the fragment and keeps the query", () => {
    expect(normalizeUrl("/p?y=2026#tent", HOME)).toBe("https://midori-camp.jp/p?y=2026");
  });

  it("refuses non-http schemes", () => {
    expect(normalizeUrl("mailto:camp@example.jp", HOME)).toBeNull();
    expect(normalizeUrl("tel:0120000000", HOME)).toBeNull();
    expect(normalizeUrl("javascript:void(0)", HOME)).toBeNull();
  });
});

describe("mergeVisit", () => {
  const page = {
    url: "https://midori-camp.jp/price.html",
    final_url: "https://midori-camp.jp/price.html",
    title: "ご利用料金",
    http_status: 200,
    content_sha256: contentHash("4,000円"),
    chars: 7,
    charset: "utf-8",
    text: "ご利用料金 4,000円",
    fetched_at: "2026-09-08T00:00:00Z",
  };

  const held: CrawledSite = {
    id: "abc",
    name: "みどりのキャンプ場",
    prefecture_code: "20",
    homepage: "https://midori-camp.jp/",
    pages: [page],
    pages_attempted: 2,
    pages_failed: 0,
    crawled_at: "2026-09-08T00:00:00Z",
    pages_fetched_at: "2026-09-08T00:00:00Z",
  };

  function emptyVisit(overrides: Partial<CrawledSite> = {}): CrawledSite {
    return {
      ...held,
      pages: [],
      pages_attempted: 1,
      pages_failed: 1,
      crawled_at: "2026-10-08T00:00:00Z",
      pages_fetched_at: "2026-10-08T00:00:00Z",
      note: "homepage_unreadable",
      ...overrides,
    };
  }

  it("keeps the text when a visit finds the site down", () => {
    const got = mergeVisit(held, emptyVisit());
    expect(got.pages).toEqual([page]);
    // The text is dated when it was fetched, the attempt when it was tried.
    expect(got.pages_fetched_at).toBe("2026-09-08T00:00:00Z");
    expect(got.crawled_at).toBe("2026-10-08T00:00:00Z");
    expect(got.note).toBe("homepage_unreadable");
  });

  it("takes a fresh visit's pages over the held ones", () => {
    const newPage = { ...page, text: "ご利用料金 4,500円", fetched_at: "2026-10-08T00:00:00Z" };
    const got = mergeVisit(held, {
      ...held,
      pages: [newPage],
      crawled_at: "2026-10-08T00:00:00Z",
      pages_fetched_at: "2026-10-08T00:00:00Z",
    });
    expect(got.pages).toEqual([newPage]);
    expect(got.pages_fetched_at).toBe("2026-10-08T00:00:00Z");
    expect(got.note).toBeUndefined();
  });

  it("follows a changed homepage even on a failed visit", () => {
    const got = mergeVisit(held, emptyVisit({ homepage: "https://midori-camp.com/" }));
    expect(got.homepage).toBe("https://midori-camp.com/");
  });

  it("records an empty first visit as it is", () => {
    const visit = emptyVisit();
    expect(mergeVisit(undefined, visit)).toEqual(visit);
    expect(mergeVisit({ ...held, pages: [] }, visit)).toEqual(visit);
  });
});
