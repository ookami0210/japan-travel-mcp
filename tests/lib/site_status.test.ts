import { describe, it, expect } from "vitest";
import {
  classifySiteStatus,
  isListingHost,
  type SiteStatusInput,
} from "../../scrapers/lib/site_status.js";

function input(over: Partial<SiteStatusInput> = {}): SiteStatusInput {
  return {
    url: "https://example.jp/",
    status: 200,
    text: null,
    name: null,
    ...over,
  };
}

// A page long enough to clear the "empty page" floor, with no telling words.
const filler = "あ".repeat(200);

describe("isListingHost", () => {
  it.each([
    ["https://www.nap-camp.com/aichi/12345", true],
    ["https://nap-camp.com/aichi/12345", true],
    ["https://travel.rakuten.co.jp/HOTEL/1234/1234.html", true],
    ["https://www.instagram.com/some_campground/", true],
    ["https://example-camp.jp/", false],
    ["not a url", false],
  ])("%s → %s", (url, expected) => {
    expect(isListingHost(url)).toBe(expected);
  });

  it("does not match a lookalike host that merely ends with the brand word", () => {
    expect(isListingHost("https://notbooking.com/x")).toBe(false);
  });
});

describe("classifySiteStatus — decided without reading a page", () => {
  it("no url on record", () => {
    expect(classifySiteStatus(input({ url: null })).status).toBe("no_official_site");
  });

  it("a booking-portal URL is a listing, never fetched", () => {
    expect(classifySiteStatus(input({ url: "https://www.nap-camp.com/x/1" })).status).toBe(
      "ota_listing",
    );
  });
});

describe("classifySiteStatus — dead URLs", () => {
  it.each([
    ["network failure", 0],
    ["404", 404],
    ["500", 500],
  ])("%s", (_label, status) => {
    expect(classifySiteStatus(input({ status, text: filler })).status).toBe("url_dead");
  });

  it("an empty body is dead even with 200", () => {
    expect(classifySiteStatus(input({ text: "  " })).status).toBe("url_dead");
  });

  it("a parked domain answers 200 but is dead", () => {
    const text = `このドメインは お名前.com で取得されています ${filler}`;
    expect(classifySiteStatus(input({ text })).status).toBe("url_dead");
  });
});

describe("classifySiteStatus — page content", () => {
  it("a closure notice outranks the rest of the page", () => {
    const text = `キャンプ場のご予約 ${filler} 当キャンプ場は2026年3月をもって閉鎖しました`;
    const got = classifySiteStatus(input({ text, name: "○○キャンプ場" }));
    expect(got.status).toBe("closed_suspected");
  });

  it("the facility name on the page makes it active", () => {
    const text = `ようこそ 羽鳥湖畔オートキャンプ場 へ ${filler}`;
    expect(classifySiteStatus(input({ text, name: "羽鳥湖畔オートキャンプ場" })).status).toBe(
      "active",
    );
  });

  it("matches when the page drops the descriptor from the name", () => {
    const text = `ようこそ 羽鳥湖畔 へ ${filler}`;
    const got = classifySiteStatus(input({ text, name: "羽鳥湖畔オートキャンプ場" }));
    expect(got).toEqual({ status: "active", reason: "name on page" });
  });

  it("lodging vocabulary alone is enough when the name does not match", () => {
    const text = `ご予約・チェックインのご案内 ${filler}`;
    expect(classifySiteStatus(input({ text, name: "まったく違う名前" })).status).toBe("active");
  });

  it("a live page about something else is left for a human, not called dead", () => {
    const got = classifySiteStatus(input({ text: filler, name: "○○キャンプ場" }));
    expect(got.status).toBe("closed_suspected");
    expect(got.reason).toMatch(/does not mention/);
  });

  it("英語のページも語彙で拾う", () => {
    const text = `Reservations and check-in information ${"x".repeat(200)}`;
    expect(classifySiteStatus(input({ text, name: null })).status).toBe("active");
  });
});
