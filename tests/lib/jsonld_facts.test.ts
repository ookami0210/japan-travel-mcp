import { describe, it, expect } from "vitest";
import { extractJsonLdFacts } from "../../scrapers/lib/jsonld_facts.js";

function page(jsonld: unknown): string {
  return `<html><head><script type="application/ld+json">${JSON.stringify(jsonld)}</script></head><body/></html>`;
}

describe("extractJsonLdFacts", () => {
  it("extracts hours spec + priceRange + reservations from a Restaurant node", () => {
    const html = page({
      "@context": "https://schema.org",
      "@type": "Restaurant",
      name: "すし処テスト",
      priceRange: "¥5,000～¥9,999",
      acceptsReservations: "True",
      telephone: "+81-6-0000-0000",
      openingHoursSpecification: [
        { "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "11:00", closes: "22:00" },
      ],
    });
    const f = extractJsonLdFacts(html)!;
    expect(f.hours_spec).toHaveLength(1);
    expect(f.price_range_raw).toBe("¥5,000～¥9,999");
    expect(f.accepts_reservations).toBe("True");
    expect(f.telephone).toBe("+81-6-0000-0000");
  });

  it("finds venue nodes inside @graph and handles openingHours string form", () => {
    const html = page({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", name: "site" },
        { "@type": "CafeOrCoffeeShop", openingHours: "Mo-Su 09:00-18:00" },
      ],
    });
    const f = extractJsonLdFacts(html)!;
    expect(f.opening_hours).toEqual(["Mo-Su 09:00-18:00"]);
    expect(f.hours_spec).toBeNull();
  });

  it("ignores non-venue types and malformed JSON blocks", () => {
    const html =
      `<script type="application/ld+json">{"@type":"Article","headline":"x"}</script>` +
      `<script type="application/ld+json">{not json}</script>`;
    expect(extractJsonLdFacts(html)).toBeNull();
  });

  it("returns null for a page with no JSON-LD at all (honest null)", () => {
    expect(extractJsonLdFacts("<html><body>営業時間 11:00-22:00</body></html>")).toBeNull();
  });

  it("picks the richest node when multiple match", () => {
    const html = page([
      { "@type": "LocalBusiness", telephone: "1" },
      {
        "@type": "Restaurant",
        openingHoursSpecification: [{ dayOfWeek: "Friday", opens: "17:00", closes: "23:00" }],
        priceRange: "$$",
      },
    ]);
    const f = extractJsonLdFacts(html)!;
    expect(f.price_range_raw).toBe("$$");
    expect(f.hours_spec).toHaveLength(1);
  });
});
