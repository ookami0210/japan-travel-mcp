/**
 * Where-to-look pointer for campgrounds with no page of their own
 * (src/lib/listing_pointer.ts).
 */

import { describe, expect, it } from "vitest";
import {
  directoryUrlForPrefecture,
  isDirectoryUrl,
  listingPointer,
} from "../../src/lib/listing_pointer.js";

describe("directoryUrlForPrefecture", () => {
  it("names the directory's own page for a prefecture code", () => {
    expect(directoryUrlForPrefecture("01")).toBe("https://www.nap-camp.com/hokkaido/list");
    expect(directoryUrlForPrefecture("26")).toBe("https://www.nap-camp.com/kyoto/list");
    expect(directoryUrlForPrefecture("47")).toBe("https://www.nap-camp.com/okinawa/list");
  });

  it("says nothing when there is no prefecture to point at", () => {
    expect(directoryUrlForPrefecture(null)).toBeNull();
    expect(directoryUrlForPrefecture("00")).toBeNull();
    expect(directoryUrlForPrefecture("48")).toBeNull();
    expect(directoryUrlForPrefecture("not a code")).toBeNull();
  });
});

describe("listingPointer", () => {
  const input = {
    prefecture_code: "20",
    name: "みどりのキャンプ場",
    name_en: "Midori Campground",
  };

  it("points at the prefecture page and says what to look for", () => {
    const p = listingPointer(input)!;
    expect(p.directory_prefecture_url).toBe("https://www.nap-camp.com/nagano/list");
    expect(p.search_for).toBe("みどりのキャンプ場");
    expect(p.directory_host).toBe("nap-camp.com");
  });

  it("never claims the campground is listed", () => {
    const p = listingPointer(input)!;
    // The whole point: we have not looked, and the record says so.
    expect(p.listing_verified).toBe(false);
    expect(p.note).toMatch(/do not crawl that directory/);
  });

  it("carries no directory content — only a host, a page and a name", () => {
    const keys = Object.keys(listingPointer(input)!).sort();
    expect(keys).toEqual([
      "directory_host",
      "directory_name_en",
      "directory_name_ja",
      "directory_prefecture_url",
      "listing_verified",
      "note",
      "search_for",
    ]);
  });

  it("falls back to the English name when there is no Japanese one", () => {
    expect(listingPointer({ ...input, name: null })!.search_for).toBe("Midori Campground");
  });

  it("is null when there is nothing to search for, or nowhere to look", () => {
    expect(listingPointer({ ...input, name: null, name_en: null })).toBeNull();
    expect(listingPointer({ ...input, prefecture_code: null })).toBeNull();
  });
});

describe("isDirectoryUrl", () => {
  it("recognises a record whose website is the directory, not an operator site", () => {
    expect(isDirectoryUrl("https://www.nap-camp.com/nagasaki/12127")).toBe(true);
    expect(isDirectoryUrl("https://nap-camp.com/nagasaki/12127")).toBe(true);
  });

  it("leaves an operator's own site alone", () => {
    expect(isDirectoryUrl("https://midori-camp.jp/")).toBe(false);
    expect(isDirectoryUrl("https://nap-camp.com.example.jp/")).toBe(false);
  });

  it("says no rather than throwing on nothing or nonsense", () => {
    expect(isDirectoryUrl(null)).toBe(false);
    expect(isDirectoryUrl("not a url")).toBe(false);
  });
});
