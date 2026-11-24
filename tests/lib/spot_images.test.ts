import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  applySpotImagesToAttractions,
  buildCredit,
  clearSpotImagesCache,
  htmlToText,
  isAllowedLicense,
  loadSpotImages,
  normalizeSpotImage,
  orderSpotImages,
  parseSpotImageFile,
  type SpotImage,
} from "../../src/lib/spot_images.js";
import {
  cleanThumbUrl,
  commonsFileFromInfo,
  fileNameFromP18,
  foldEntityRows,
  leadImagesFromResponse,
} from "../../scrapers/sources/fetch_wikidata_images.js";

function img(over: Partial<SpotImage> = {}): SpotImage {
  return {
    url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a1/A.jpg/960px-A.jpg",
    width: 960,
    height: 640,
    source: "wikidata_p18",
    page_url: "https://commons.wikimedia.org/wiki/File:A.jpg",
    license: "CC BY-SA 4.0",
    license_url: null,
    author: "Someone",
    attribution_required: true,
    credit: "Photo: Someone / CC BY-SA 4.0 (Wikimedia Commons)",
    ...over,
  };
}

describe("isAllowedLicense", () => {
  it("keeps CC0, public domain, CC BY and CC BY-SA", () => {
    for (const l of ["CC0", "Public domain", "PD-old", "CC BY 4.0", "CC BY-SA 3.0", "CC BY 2.1 jp", "cc-by-sa-2.0"]) {
      expect(isAllowedLicense(l)).toBe(true);
    }
  });

  it("drops anything else, and a missing license", () => {
    for (const l of ["GFDL", "CC BY-NC 4.0", "CC BY-ND 4.0", "Copyrighted", "", null, undefined]) {
      expect(isAllowedLicense(l)).toBe(false);
    }
  });
});

describe("htmlToText", () => {
  it("keeps the text of a Commons Artist fragment", () => {
    expect(htmlToText('<a href="//commons.wikimedia.org/wiki/User:X" title="User:X">X &amp; Y</a>')).toBe("X & Y");
    expect(htmlToText("<span> </span>")).toBeNull();
  });
});

describe("buildCredit", () => {
  it("names the author and license for a Wikimedia image", () => {
    expect(buildCredit({ source: "wikipedia_lead", author: null, license: "CC0", page_url: "x" })).toBe(
      "Photo: Wikimedia Commons / CC0 (Wikimedia Commons)",
    );
  });

  it("names the site an official or municipal image came from", () => {
    expect(
      buildCredit({ source: "municipal_page", author: null, license: null, page_url: "https://www.city.example.jp/a/b.html" }),
    ).toBe("Source: www.city.example.jp");
  });
});

describe("normalizeSpotImage", () => {
  it("accepts a complete record", () => {
    expect(normalizeSpotImage(img())).toEqual(img());
  });

  it("drops a record without an http URL, a page or a known source", () => {
    expect(normalizeSpotImage(img({ url: "data:image/gif;base64,AAA" }))).toBeNull();
    expect(normalizeSpotImage({ ...img(), page_url: undefined })).toBeNull();
    expect(normalizeSpotImage(img({ source: "search" as never }))).toBeNull();
  });

  it("drops a narrow image and a Wikimedia image whose license is not allowed", () => {
    expect(normalizeSpotImage(img({ width: 120 }))).toBeNull();
    expect(normalizeSpotImage(img({ license: "CC BY-NC 4.0" }))).toBeNull();
  });

  it("keeps a municipal image whose page states no license, and builds its credit", () => {
    const m = normalizeSpotImage({
      url: "https://www.city.example.jp/img/castle.jpg",
      source: "municipal_page",
      page_url: "https://www.city.example.jp/kanko/castle.html",
    });
    expect(m?.license).toBeNull();
    expect(m?.credit).toBe("Source: www.city.example.jp");
  });
});

describe("orderSpotImages", () => {
  it("puts P18 first, drops the same file reached twice and keeps three", () => {
    const lead = img({ source: "wikipedia_lead" });
    const other = img({
      source: "wikipedia_lead",
      url: "https://upload.wikimedia.org/x/B.jpg",
      page_url: "https://commons.wikimedia.org/wiki/File:B.jpg",
    });
    const official = img({ source: "official_site", url: "https://o.example.jp/a.jpg", page_url: "https://o.example.jp/" });
    const muni = img({ source: "municipal_page", url: "https://m.example.jp/a.jpg", page_url: "https://m.example.jp/" });
    const out = orderSpotImages([muni, lead, official, other, img()]);
    expect(out.map((i) => [i.source, i.page_url])).toEqual([
      ["wikidata_p18", "https://commons.wikimedia.org/wiki/File:A.jpg"],
      ["wikipedia_lead", "https://commons.wikimedia.org/wiki/File:B.jpg"],
      ["official_site", "https://o.example.jp/"],
    ]);
  });
});

describe("image layer file", () => {
  let dir: string | null = null;
  afterEach(async () => {
    clearSpotImagesCache();
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = null;
  });

  it("parses records keyed by qid and skips torn ones", () => {
    const map = parseSpotImageFile({
      records: [{ qid: "Q1", images: [img()] }, { qid: "Q2", images: [{ url: "nope" }] }, null, { images: [img()] }],
    });
    expect([...map.keys()]).toEqual(["wd:Q1"]);
  });

  it("merges files and attaches images to attractions; a missing file is no images", async () => {
    dir = await mkdtemp(join(tmpdir(), "spot-images-"));
    const a = join(dir, "a.json");
    await writeFile(a, JSON.stringify({ records: [{ qid: "Q1", images: [img({ source: "wikipedia_lead" })] }] }));
    const b = join(dir, "b.json");
    await writeFile(
      b,
      JSON.stringify({
        records: [{ key: "wd:Q1", images: [img({ url: "https://x.example/p.jpg", page_url: "https://commons.wikimedia.org/wiki/File:P.jpg" })] }],
      }),
    );
    const map = await loadSpotImages([a, join(dir, "missing.json"), b]);
    const attractions: Array<{ qid?: string; images?: SpotImage[] }> = [{ qid: "Q1" }, { qid: "Q2" }, {}];
    expect(applySpotImagesToAttractions(attractions, map)).toBe(1);
    expect(attractions[0].images?.map((i) => i.source)).toEqual(["wikidata_p18", "wikipedia_lead"]);
    expect(attractions[1].images).toBeUndefined();
  });
});

describe("fetch_wikidata_images helpers", () => {
  it("reads the file name from a P18 value", () => {
    expect(fileNameFromP18("http://commons.wikimedia.org/wiki/Special:FilePath/Sensoji%202023.jpg")).toBe("Sensoji 2023.jpg");
  });

  it("prefers a preferred-rank P18, never a deprecated one, and keeps sitelinks", () => {
    const e = (q: string) => ({ value: `http://www.wikidata.org/entity/${q}` });
    const f = (n: string) => ({ value: `http://commons.wikimedia.org/wiki/Special:FilePath/${n}` });
    const r = (n: string) => ({ value: `http://wikiba.se/ontology#${n}` });
    const out = foldEntityRows([
      { item: e("Q1"), img: f("B.jpg"), rank: r("NormalRank"), jaTitle: { value: "記事" } },
      { item: e("Q1"), img: f("C.jpg"), rank: r("PreferredRank") },
      { item: e("Q1"), img: f("A.jpg"), rank: r("NormalRank") },
      { item: e("Q2"), img: f("Old.jpg"), rank: r("DeprecatedRank"), enTitle: { value: "Article" } },
      { item: e("Q3"), img: f("Z.jpg"), rank: r("NormalRank") },
      { item: e("Q3"), img: f("Y.jpg"), rank: r("NormalRank") },
    ]);
    expect(out.get("Q1")).toEqual({ p18: "C.jpg", jawiki: "記事", enwiki: null });
    expect(out.get("Q2")).toEqual({ p18: null, jawiki: null, enwiki: "Article" });
    expect(out.get("Q3")?.p18).toBe("Y.jpg");
  });

  it("follows normalisation and redirects to an article's lead image", () => {
    const out = leadImagesFromResponse(["金閣寺", "Nothing"], {
      query: {
        redirects: [{ from: "金閣寺", to: "鹿苑寺" }],
        pages: { "1": { title: "鹿苑寺", pageimage: "Kinkaku-ji_2023.jpg" }, "-1": { title: "Nothing", missing: "" } },
      },
    });
    expect(out.get("金閣寺")).toBe("Kinkaku-ji 2023.jpg");
    expect(out.has("Nothing")).toBe(false);
  });

  it("keeps a free raster file and reads its license and author", () => {
    const kept = commonsFileFromInfo({
      mime: "image/jpeg",
      width: 3466,
      height: 2476,
      thumburl: "https://thumb.wikimedia.org/x/960px-S.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo",
      thumbwidth: 960,
      thumbheight: 686,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:S.jpg",
      extmetadata: {
        LicenseShortName: { value: "CC0" },
        Artist: { value: '<a href="//commons.wikimedia.org/wiki/User:A">A</a>' },
        AttributionRequired: { value: "false" },
      },
    });
    expect(kept).toEqual({
      url: "https://thumb.wikimedia.org/x/960px-S.jpg",
      width: 960,
      height: 686,
      page_url: "https://commons.wikimedia.org/wiki/File:S.jpg",
      license: "CC0",
      license_url: null,
      author: "A",
      attribution_required: false,
    });
  });

  it("drops SVG, narrow and non-free files", () => {
    const base = {
      mime: "image/jpeg",
      width: 2000,
      url: "https://upload.wikimedia.org/x.jpg",
      descriptionurl: "https://commons.wikimedia.org/wiki/File:x.jpg",
      extmetadata: { LicenseShortName: { value: "CC BY 4.0" } },
    };
    expect(commonsFileFromInfo(base)).not.toBeNull();
    expect(commonsFileFromInfo({ ...base, mime: "image/svg+xml" })).toBeNull();
    expect(commonsFileFromInfo({ ...base, width: 300 })).toBeNull();
    expect(commonsFileFromInfo({ ...base, extmetadata: { LicenseShortName: { value: "GFDL" } } })).toBeNull();
    expect(commonsFileFromInfo(undefined)).toBeNull();
  });

  it("strips Commons tracking parameters from thumbnail URLs", () => {
    expect(cleanThumbUrl("https://t.example/a.jpg?utm_source=x&utm_campaign=y")).toBe("https://t.example/a.jpg");
    expect(cleanThumbUrl("https://t.example/a.jpg")).toBe("https://t.example/a.jpg");
  });
});
