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
