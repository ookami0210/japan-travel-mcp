import { describe, expect, it } from "vitest";
import {
  hasStructuredEvent,
  isEventPageRecord,
  isEventSpecificUrl,
} from "../../src/lib/event_page.js";

describe("event page classification", () => {
  it.each([
    "https://example.jp/event/123",
    "https://example.jp/events/detail/123",
    "https://example.jp/festival/summer",
    "https://example.jp/matsuri/autumn",
    "https://example.jp/%E3%82%A4%E3%83%99%E3%83%B3%E3%83%88/123",
  ])("recognizes an event-specific path: %s", (url) => {
    expect(isEventSpecificUrl(url)).toBe(true);
  });

  it.each([
    "https://events.example.jp/spot/123",
    "https://example.jp/spot/event-hall",
    "https://example.jp/article/123?category=event",
    "not a URL",
  ])("does not classify non-event paths from host, slug, or query text: %s", (url) => {
    expect(isEventSpecificUrl(url)).toBe(false);
  });

  it("treats non-empty Schema.org Event data as authoritative", () => {
    expect(hasStructuredEvent({ schema_events: [{ type: "Event" }] })).toBe(true);
    expect(isEventPageRecord({ url: "https://example.jp/spot/123", schema_events: [{}] })).toBe(true);
  });

  it("checks both canonical and source URLs", () => {
    expect(
      isEventPageRecord({
        url: "https://example.jp/article/123",
        source_url: "https://example.jp/events/123",
        schema_events: [],
      }),
    ).toBe(true);
  });
});
