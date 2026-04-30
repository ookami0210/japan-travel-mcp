import { describe, it, expect } from "vitest";
import { extract } from "../../scrapers/lib/extractor.js";

const BASE = "https://example.com/page";

describe("extract — title", () => {
  it("uses <title> when present", () => {
    const r = extract("<html><head><title> Hello </title></head></html>", BASE);
    expect(r.title).toBe("Hello");
  });

  it("falls back to <h1> when no title", () => {
    const r = extract("<html><body><h1>Headline</h1></body></html>", BASE);
    expect(r.title).toBe("Headline");
  });

  it("falls back to og:title when no title and no h1", () => {
    const r = extract(
      '<html><head><meta property="og:title" content="OG Title"></head></html>',
      BASE,
    );
    expect(r.title).toBe("OG Title");
  });

  it("returns empty string when nothing extractable", () => {
    expect(extract("<html></html>", BASE).title).toBe("");
  });
});

describe("extract — description", () => {
  it("prefers meta[name=description]", () => {
    const html = `
      <html><head>
        <meta name="description" content="Meta desc">
        <meta property="og:description" content="OG desc">
      </head></html>`;
    expect(extract(html, BASE).description).toBe("Meta desc");
  });

  it("falls back to og:description", () => {
    const html =
      '<html><head><meta property="og:description" content="OG fallback"></head></html>';
    expect(extract(html, BASE).description).toBe("OG fallback");
  });

  it("returns null when neither is present", () => {
    expect(extract("<html></html>", BASE).description).toBeNull();
  });
});

describe("extract — language", () => {
  it("detects ja from html[lang]", () => {
    expect(extract('<html lang="ja"></html>', BASE).language).toBe("ja");
  });

  it("detects en from variants like en-US", () => {
    expect(extract('<html lang="en-US"></html>', BASE).language).toBe("en");
  });

  it("returns 'unknown' when no lang attribute", () => {
    expect(extract("<html></html>", BASE).language).toBe("unknown");
  });
});

describe("extract — links", () => {
  it("resolves relative hrefs against baseUrl", () => {
    const html = `<html><body>
      <a href="/sub/page">Sub</a>
      <a href="https://other.example/x">Abs</a>
    </body></html>`;
    const r = extract(html, BASE);
    const hrefs = r.links.map((l) => l.href);
    expect(hrefs).toContain("https://example.com/sub/page");
    expect(hrefs).toContain("https://other.example/x");
  });

  it("filters out non-http(s) hrefs (mailto, javascript, tel)", () => {
    const html = `<html><body>
      <a href="mailto:x@y.z">m</a>
      <a href="javascript:void(0)">j</a>
      <a href="tel:+81-3-1234">t</a>
      <a href="/ok">ok</a>
    </body></html>`;
    const hrefs = extract(html, BASE).links.map((l) => l.href);
    expect(hrefs).toEqual(["https://example.com/ok"]);
  });
});

describe("extract — geo", () => {
  it("extracts geo from og:latitude / og:longitude", () => {
    const html = `<html><head>
      <meta property="og:latitude" content="35.6762">
      <meta property="og:longitude" content="139.6503">
    </head></html>`;
    expect(extract(html, BASE).geo).toEqual({ lat: 35.6762, lng: 139.6503 });
  });

  it("extracts geo from place:location:* fallback", () => {
    const html = `<html><head>
      <meta property="place:location:latitude" content="34.69">
      <meta property="place:location:longitude" content="135.50">
    </head></html>`;
    expect(extract(html, BASE).geo).toEqual({ lat: 34.69, lng: 135.5 });
  });

  it("extracts geo from JSON-LD GeoCoordinates", () => {
    const ld = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TouristAttraction",
      geo: {
        "@type": "GeoCoordinates",
        latitude: 34.2960,
        longitude: 132.3199,
      },
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    expect(extract(html, BASE).geo).toEqual({ lat: 34.296, lng: 132.3199 });
  });

  it("returns null when no geo signal", () => {
    expect(extract("<html></html>", BASE).geo).toBeNull();
  });
});

describe("extract — address", () => {
  it("prefers JSON-LD PostalAddress (string form)", () => {
    const ld = JSON.stringify({
      "@type": "Place",
      address: "東京都千代田区千代田1-1",
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    expect(extract(html, BASE).address).toBe("東京都千代田区千代田1-1");
  });

  it("composes JSON-LD PostalAddress (object form)", () => {
    const ld = JSON.stringify({
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        postalCode: "100-0001",
        addressRegion: "東京都",
        addressLocality: "千代田区",
        streetAddress: "千代田1-1",
      },
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const got = extract(html, BASE).address;
    expect(got).toContain("〒100-0001");
    expect(got).toContain("東京都");
    expect(got).toContain("千代田区");
  });

  it("falls back to 〒XXX-XXXX postal-code pattern in body text", () => {
    const html = `<html><body>
      <p>本社所在地 〒606-8501 京都府京都市左京区</p>
    </body></html>`;
    const got = extract(html, BASE).address;
    expect(got).toMatch(/〒606-8501/);
  });

  it("falls back to labelled '住所:' pattern", () => {
    const html = `<html><body>
      <p>住所: 大阪府大阪市北区梅田1-1-1</p>
    </body></html>`;
    expect(extract(html, BASE).address).toBe("大阪府大阪市北区梅田1-1-1");
  });

  it("returns null when no address signal at all", () => {
    expect(extract("<html><body><p>no address here</p></body></html>", BASE)
      .address).toBeNull();
  });
});

describe("extract — canonical", () => {
  it("picks <link rel=canonical> first", () => {
    const html = `<html><head>
      <link rel="canonical" href="https://example.com/canon">
      <meta property="og:url" content="https://example.com/og">
    </head></html>`;
    expect(extract(html, BASE).canonical).toBe("https://example.com/canon");
  });

  it("falls back to og:url", () => {
    const html =
      '<html><head><meta property="og:url" content="https://example.com/og"></head></html>';
    expect(extract(html, BASE).canonical).toBe("https://example.com/og");
  });

  it("resolves relative canonical against baseUrl", () => {
    const html = '<html><head><link rel="canonical" href="/canon"></head></html>';
    expect(extract(html, BASE).canonical).toBe("https://example.com/canon");
  });
});

describe("extract — hreflang alternates", () => {
  it("collects all hreflang alternates with absolute URLs", () => {
    const html = `<html><head>
      <link rel="alternate" hreflang="en" href="/en/">
      <link rel="alternate" hreflang="zh-CN" href="https://example.com/zh/">
      <link rel="alternate" hreflang="ko" href="/ko/">
    </head></html>`;
    const got = extract(html, BASE).hreflangs;
    expect(got).toHaveLength(3);
    expect(got).toContainEqual({ lang: "en", href: "https://example.com/en/" });
    expect(got).toContainEqual({
      lang: "zh-CN",
      href: "https://example.com/zh/",
    });
  });
});

describe("extract — image limits", () => {
  it("caps image list at 30", () => {
    const imgs = Array.from(
      { length: 50 },
      (_, i) => `<img src="/img${i}.jpg">`,
    ).join("");
    const html = `<html><body>${imgs}</body></html>`;
    expect(extract(html, BASE).images).toHaveLength(30);
  });
});

// ─────────────────────────────────────────────────────────────────────
// ADR 0001 / workstream C1 — body paragraph extraction
// Before this, even a rich feature page (festival write-up, tea-garden
// article) would only surface the meta description; the actual narrative
// was discarded.

describe("extract — body paragraphs", () => {
  it("collects substantive <p> nodes (>= 50 chars), drops shorts", () => {
    const long = "あ".repeat(60);
    const html = `<html><body>
      <p>short</p>
      <p>${long}</p>
      <p>another paragraph that is definitely longer than the fifty character minimum threshold</p>
    </body></html>`;
    const got = extract(html, BASE).body_paragraphs;
    expect(got).toHaveLength(2);
    expect(got[0]).toBe(long);
  });

  it("strips header/footer/nav/aside chrome before reading paragraphs", () => {
    const long = "あ".repeat(80);
    const html = `<html><body>
      <header><p>${"navchrome ".repeat(20)}</p></header>
      <nav><p>${"navchrome ".repeat(20)}</p></nav>
      <article><p>${long}</p></article>
      <footer><p>${"footchrome ".repeat(20)}</p></footer>
    </body></html>`;
    const got = extract(html, BASE).body_paragraphs;
    expect(got).toContain(long);
    expect(got.some((p) => p.startsWith("navchrome"))).toBe(false);
    expect(got.some((p) => p.startsWith("footchrome"))).toBe(false);
  });

  it("dedupes identical paragraphs", () => {
    const long = "あ".repeat(80);
    const html = `<html><body>
      <p>${long}</p>
      <p>${long}</p>
      <p>${long}</p>
    </body></html>`;
    const got = extract(html, BASE).body_paragraphs;
    expect(got).toHaveLength(1);
  });

  it("caps at 8 paragraphs even when more qualify", () => {
    const ps = Array.from(
      { length: 20 },
      (_, i) => `<p>paragraph ${i} ${"x".repeat(80)}</p>`,
    ).join("");
    const html = `<html><body>${ps}</body></html>`;
    expect(extract(html, BASE).body_paragraphs.length).toBeLessThanOrEqual(8);
  });

  it("skips giant blobs over 1200 chars (likely list dumps, not prose)", () => {
    const giant = "x".repeat(1500);
    const small = "y".repeat(80);
    const html = `<html><body>
      <p>${giant}</p>
      <p>${small}</p>
    </body></html>`;
    const got = extract(html, BASE).body_paragraphs;
    expect(got).not.toContain(giant);
    expect(got).toContain(small);
  });
});

// ADR 0001 / workstream C2 — Schema.org Event / Place extraction

describe("extract — schema_events", () => {
  it("captures a single Event with start/end dates and location", () => {
    const ld = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "吉田の火祭",
      startDate: "2026-08-26",
      endDate: "2026-08-27",
      location: { "@type": "Place", name: "北口本宮冨士浅間神社" },
      url: "https://example.com/yoshida-fire",
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const r = extract(html, BASE);
    expect(r.schema_events).toHaveLength(1);
    expect(r.schema_events[0]).toMatchObject({
      type: "Event",
      name: "吉田の火祭",
      start_date: "2026-08-26",
      end_date: "2026-08-27",
      location: "北口本宮冨士浅間神社",
      url: "https://example.com/yoshida-fire",
    });
  });

  it("recognises Festival / MusicEvent / FoodEvent subtypes", () => {
    const ld = JSON.stringify([
      { "@type": "Festival", name: "Festival A" },
      { "@type": "MusicEvent", name: "Concert B" },
      { "@type": "FoodEvent", name: "Food C" },
    ]);
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const r = extract(html, BASE);
    expect(r.schema_events).toHaveLength(3);
    const types = r.schema_events.map((e) => e.type);
    expect(types).toEqual(["Festival", "MusicEvent", "FoodEvent"]);
  });

  it("walks the @graph wrapper Schema.org sometimes uses", () => {
    const ld = JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Event", name: "Wrapped event" },
        { "@type": "TouristAttraction", name: "Wrapped place" },
      ],
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const r = extract(html, BASE);
    expect(r.schema_events.map((e) => e.name)).toContain("Wrapped event");
    expect(r.schema_places.map((p) => p.name)).toContain("Wrapped place");
  });

  it("ignores malformed JSON-LD blocks instead of throwing", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ this is not json</script>
      <script type="application/ld+json">${JSON.stringify({
        "@type": "Event",
        name: "Valid",
      })}</script>
    </head></html>`;
    const r = extract(html, BASE);
    expect(r.schema_events).toHaveLength(1);
    expect(r.schema_events[0].name).toBe("Valid");
  });
});

describe("extract — schema_places", () => {
  it("extracts a TouristAttraction with composed PostalAddress", () => {
    const ld = JSON.stringify({
      "@type": "TouristAttraction",
      name: "南山城村茶畑",
      address: {
        "@type": "PostalAddress",
        postalCode: "619-1411",
        addressRegion: "京都府",
        addressLocality: "相楽郡南山城村",
      },
      geo: { "@type": "GeoCoordinates", latitude: 34.7708, longitude: 136.0314 },
      url: "https://example.com/tea",
    });
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const r = extract(html, BASE);
    expect(r.schema_places).toHaveLength(1);
    expect(r.schema_places[0].type).toBe("TouristAttraction");
    expect(r.schema_places[0].address).toContain("南山城村");
    expect(r.schema_places[0].geo).toEqual({ lat: 34.7708, lng: 136.0314 });
  });

  it("recognises FoodEstablishment / Restaurant / Museum subtypes", () => {
    const ld = JSON.stringify([
      { "@type": "Restaurant", name: "Resto" },
      { "@type": "Museum", name: "Museum" },
      { "@type": "BuddhistTemple", name: "Temple" },
    ]);
    const html = `<html><head><script type="application/ld+json">${ld}</script></head></html>`;
    const r = extract(html, BASE);
    const names = r.schema_places.map((p) => p.name);
    expect(names).toEqual(["Resto", "Museum", "Temple"]);
  });

  it("returns empty arrays when no JSON-LD present", () => {
    const r = extract("<html><body><p>nothing</p></body></html>", BASE);
    expect(r.schema_events).toEqual([]);
    expect(r.schema_places).toEqual([]);
  });
});
