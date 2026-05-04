import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_OPTIONS } from "../../scrapers/lib/types.js";
import { httpOk, httpStatus } from "./_helpers.js";

vi.mock("../../scrapers/lib/fetcher.js", () => ({
  rateLimitedFetch: vi.fn(),
  ErrorCounter: class {},
}));

import { rateLimitedFetch } from "../../scrapers/lib/fetcher.js";
import { geocodeAddress } from "../../scrapers/lib/geocode.js";

const mockedFetch = vi.mocked(rateLimitedFetch);

const GSI_URL_RE = /msearch\.gsi\.go\.jp\/address-search/;

/** GSI returns a GeoJSON-like array; coordinates are [lng, lat]. */
function gsiBody(lng: number, lat: number): string {
  return JSON.stringify([{ geometry: { coordinates: [lng, lat] } }]);
}

function mockGsiCoords(lng: number, lat: number): void {
  mockedFetch.mockResolvedValueOnce(
    httpOk(gsiBody(lng, lat), "application/json"),
  );
}

beforeEach(() => {
  mockedFetch.mockReset();
});

describe("geocodeAddress — happy path", () => {
  it("returns lat/lng for a Tokyo address", async () => {
    mockGsiCoords(139.7, 35.6);
    const r = await geocodeAddress("東京都千代田区丸の内1-1-1", DEFAULT_OPTIONS);
    expect(r).toEqual({ lat: 35.6, lng: 139.7 });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    expect(String(mockedFetch.mock.calls[0][0])).toMatch(GSI_URL_RE);
  });

  it("uses a 500ms rate limit override (polite to GSI)", async () => {
    mockGsiCoords(139.7, 35.6);
    await geocodeAddress("広島県広島市中区大手町1-2-3-fresh", DEFAULT_OPTIONS);
    expect(mockedFetch.mock.calls[0][1].rateLimitMs).toBe(500);
  });
});

describe("geocodeAddress — address cleaning", () => {
  it("strips a Japanese postal code prefix (〒xxx-xxxx)", async () => {
    mockGsiCoords(135.5, 34.7);
    await geocodeAddress(
      "〒530-0001 大阪府大阪市北区梅田1-1-1-clean",
      DEFAULT_OPTIONS,
    );
    const calledUrl = String(mockedFetch.mock.calls[0][0]);
    expect(calledUrl).not.toMatch(/530-0001/);
    expect(calledUrl).not.toMatch(/%E3%80%92/); // 〒 percent-encoded
  });

  it("cuts the address at the first parenthesis", async () => {
    mockGsiCoords(135, 35);
    await geocodeAddress(
      "京都府京都市東山区清水1-294 (清水寺) park-cut",
      DEFAULT_OPTIONS,
    );
    const calledUrl = String(mockedFetch.mock.calls[0][0]);
    expect(calledUrl).not.toMatch(/%E6%B8%85%E6%B0%B4%E5%AF%BA/); // 清水寺
  });

  it("returns null without fetching when cleaned address is too short", async () => {
    expect(await geocodeAddress("a b", DEFAULT_OPTIONS)).toBeNull();
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it("truncates very long inputs (>60 chars)", async () => {
    mockGsiCoords(140, 36);
    const long = "東京都" + "あ".repeat(200) + "trim-marker";
    await geocodeAddress(long, DEFAULT_OPTIONS);
    const calledUrl = decodeURIComponent(
      String(mockedFetch.mock.calls[0][0]),
    );
    expect(calledUrl).not.toContain("trim-marker");
  });
});

describe("geocodeAddress — failure modes", () => {
  it("returns null when GSI responds non-200", async () => {
    mockedFetch.mockResolvedValueOnce(httpStatus(500));
    expect(
      await geocodeAddress("青森県青森市本町a", DEFAULT_OPTIONS),
    ).toBeNull();
  });

  it.each([
    ["empty array", "[]"],
    ["malformed JSON", "{not json"],
    ["missing geometry", JSON.stringify([{}])],
  ])("returns null when GSI body is %s", async (_, body) => {
    mockedFetch.mockResolvedValueOnce(httpOk(body, "application/json"));
    // Use a unique address per row so the cache doesn't collapse them.
    expect(
      await geocodeAddress(
        `島根県松江市殿町1-${randomSuffix()}`,
        DEFAULT_OPTIONS,
      ),
    ).toBeNull();
  });
});

describe("geocodeAddress — Japan bounding box guard", () => {
  it.each([
    ["lat below 20", 139, 10],
    ["lng above 150", 160, 35],
    ["lat above 50", 139, 60],
    ["lng below 120", 119, 35],
  ])("rejects coordinates outside Japan bbox: %s", async (_, lng, lat) => {
    mockGsiCoords(lng, lat);
    expect(
      await geocodeAddress(
        `bbox-out-${randomSuffix()} 沖縄県那覇市1`,
        DEFAULT_OPTIONS,
      ),
    ).toBeNull();
  });

  it("accepts coordinates within bbox boundaries", async () => {
    mockGsiCoords(125, 26);
    expect(
      await geocodeAddress(
        "沖縄県石垣市八島町1-bbox-edge",
        DEFAULT_OPTIONS,
      ),
    ).toEqual({ lat: 26, lng: 125 });
  });
});

describe("geocodeAddress — caching", () => {
  it("memoises the cleaned-address result and skips a second fetch", async () => {
    mockGsiCoords(139, 35);
    const a = await geocodeAddress("東京都中央区銀座cache-1", DEFAULT_OPTIONS);
    const b = await geocodeAddress("東京都中央区銀座cache-1", DEFAULT_OPTIONS);
    expect(a).toEqual({ lat: 35, lng: 139 });
    expect(b).toEqual(a);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it("memoises null results too", async () => {
    mockedFetch.mockResolvedValueOnce(httpOk("[]", "application/json"));
    const a = await geocodeAddress("北海道苫小牧市本町cache-null", DEFAULT_OPTIONS);
    const b = await geocodeAddress("北海道苫小牧市本町cache-null", DEFAULT_OPTIONS);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Helpers

let suffixCounter = 0;
function randomSuffix(): string {
  suffixCounter += 1;
  return `s${suffixCounter}-${Math.random().toString(36).slice(2, 8)}`;
}
