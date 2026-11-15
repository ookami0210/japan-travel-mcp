import { describe, it, expect } from "vitest";
import { jsonLdHoursToOsm, readOfficialPage } from "../../scrapers/lib/official_page_facts.js";

function page(body: string, jsonld?: unknown): string {
  const head = jsonld
    ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>`
    : "";
  return `<html><head>${head}</head><body>${body}</body></html>`;
}

describe("jsonLdHoursToOsm", () => {
  it("groups days that share a window", () => {
    const osm = jsonLdHoursToOsm([
      { "@type": "OpeningHoursSpecification", dayOfWeek: ["Monday", "Tuesday", "Wednesday"], opens: "09:00", closes: "17:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "https://schema.org/Saturday", opens: "10:00", closes: "18:00" },
      { "@type": "OpeningHoursSpecification", dayOfWeek: "Sunday" },
    ]);
    expect(osm).toBe("Mo-We 09:00-17:00; Sa 10:00-18:00; Su off");
  });
  it("reads 00:00-00:00 as all day and skips unparseable specs", () => {
    expect(jsonLdHoursToOsm([{ dayOfWeek: "Monday", opens: "00:00", closes: "00:00" }])).toBe("Mo 00:00-24:00");
    expect(jsonLdHoursToOsm([{ dayOfWeek: "Monday", opens: "nine", closes: "five" }])).toBeNull();
  });
});

describe("readOfficialPage", () => {
  const base = { id: "wd:Q1", layer: "attraction" as const, url: "https://example.jp/", final_url: null, fetched_at: "2026-11-14T00:00:00Z", http_status: 200 };

  it("prefers JSON-LD hours and still reads the price from text", () => {
    const html = page("<p>入館料 大人600円</p>", {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      openingHoursSpecification: [{ dayOfWeek: ["Monday", "Friday"], opens: "09:00", closes: "17:00" }],
    });
    const { record, snippet } = readOfficialPage({ ...base, html, text: "入館料 大人600円" });
    expect(record.method).toBe("jsonld");
    expect(record.opening_hours).toBe("Mo,Fr 09:00-17:00");
    expect(record.price?.adult_jpy).toBe(600);
    expect(record.needs_llm).toBe(false);
    expect(snippet).toBeNull();
  });

  it("falls back to the text rules", () => {
    const text = "開館時間 9:30〜16:30 休館日 月曜日 入館料 大人300円 小人100円";
    const { record } = readOfficialPage({ ...base, html: page(text), text });
    expect(record.method).toBe("rule");
    expect(record.opening_hours).toBe("09:30-16:30; Mo off");
    expect(record.price?.child_jpy).toBe(100);
    expect(record.hours_evidence[0]).toContain("開館時間 9:30〜16:30");
  });

  it("queues a snippet when nothing was read", () => {
    const text = "ようこそ。美しい庭園をお楽しみください。";
    const { record, snippet } = readOfficialPage({ ...base, html: page(text), text });
    expect(record.method).toBe("none");
    expect(record.needs_llm).toBe(true);
    expect(snippet).toContain("庭園");
  });

  it("treats check-in/out as the lodging equivalent of hours", () => {
    const text = "チェックイン 15:00 チェックアウト 11:00 宿泊料金 9,800円〜";
    const { record } = readOfficialPage({ ...base, id: "hotel:1", layer: "hotel", html: page(text), text });
    expect(record.lodging).toEqual({ checkin: "15:00", checkout: "11:00" });
    expect(record.price?.from_jpy).toBe(9800);
    expect(record.needs_llm).toBe(false);
  });

  it("handles a failed fetch without throwing", () => {
    const { record, snippet } = readOfficialPage({ ...base, http_status: 404, html: null, text: null });
    expect(record.method).toBe("none");
    expect(record.text_chars).toBe(0);
    expect(snippet).toBeNull();
  });
});

describe("modelHoursToOsm", () => {
  it("structures the sentence a model located, or refuses", async () => {
    const { modelHoursToOsm } = await import("../../scrapers/merge_llm_facts.js");
    expect(modelHoursToOsm("月〜金 10:00〜翌2:00; 土日祝 7:00〜翌2:00")).toBe("Mo-Fr 10:00-02:00; Sa,Su,PH 07:00-02:00");
    expect(modelHoursToOsm("11:30〜22:00(Lo.21:00)")).toBe("11:30-22:00");
    expect(modelHoursToOsm("Mo-Fr 09:00-17:00; Sa off")).toBe("Mo-Fr 09:00-17:00; Sa off");
    expect(modelHoursToOsm("季節により異なります")).toBeNull();
  });
});
