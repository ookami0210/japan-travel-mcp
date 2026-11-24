import { describe, expect, it } from "vitest";

import {
  buildMunicipalImageRecords,
  isNamedThumbnail,
  pickMunicipalImage,
} from "../../scrapers/lib/municipal_images.js";

const PAGE = "https://www.example-kanko.jp/spot/castle.html";

describe("isNamedThumbnail", () => {
  it("flags thumb path words and small WordPress sizes", () => {
    expect(isNamedThumbnail("https://www.city.hokuto.example.jp/fs/_/thum_spot.jpg")).toBe(true);
    expect(isNamedThumbnail("https://x.example.jp/uploads/2019/07/photo-300x225.jpg")).toBe(true);
    expect(isNamedThumbnail("https://x.example.jp/thumbnails/a.jpg")).toBe(true);
  });

  it("keeps full-size files", () => {
    expect(isNamedThumbnail("https://x.example.jp/uploads/2022/02/IMG_1618-1100x580.jpg")).toBe(false);
    expect(isNamedThumbnail("https://x.example.jp/uploads/castle.jpg")).toBe(false);
  });
});

describe("pickMunicipalImage", () => {
  it("skips site furniture and takes the first photo", () => {
    const spot = {
      id: "a",
      source_url: PAGE,
      images: [
        "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
        "https://www.example-kanko.jp/common/img/logo.svg",
        "https://www.example-kanko.jp/upload/castle.jpg",
        "https://www.example-kanko.jp/upload/other.jpg",
      ],
    };
    expect(pickMunicipalImage(spot, new Map())).toBe("https://www.example-kanko.jp/upload/castle.jpg");
  });

  it("skips an image shared by three or more pages", () => {
    const shared = "https://www.example-kanko.jp/img/menu_photo.jpg";
    const spots = [1, 2, 3].map((n) => ({
      id: `s${n}`,
      source_url: `${PAGE}?n=${n}`,
      images: [shared, `https://www.example-kanko.jp/upload/p${n}.jpg`],
    }));
    const records = buildMunicipalImageRecords(spots);
    expect(records.map((r) => r.images[0].url)).toEqual([
      "https://www.example-kanko.jp/upload/p1.jpg",
      "https://www.example-kanko.jp/upload/p2.jpg",
      "https://www.example-kanko.jp/upload/p3.jpg",
    ]);
  });

  it("skips a city site's generic share image", () => {
    const spot = {
      id: "b",
      source_url: "https://www.city.example.lg.jp/kanko/park.html",
      images: ["https://www.city.example.lg.jp/images/ogp.png"],
    };
    expect(pickMunicipalImage(spot, new Map())).toBeNull();
  });
});

describe("buildMunicipalImageRecords", () => {
  it("keys records by spot id, once, sorted, with the page as provenance", () => {
    const records = buildMunicipalImageRecords([
      { id: "z", source_url: PAGE, images: ["https://www.example-kanko.jp/upload/z.jpg"] },
      { id: "a", url: PAGE, images: ["https://www.example-kanko.jp/upload/a.jpg"] },
      { id: "a", source_url: PAGE, images: ["https://www.example-kanko.jp/upload/dup.jpg"] },
      { id: "none", source_url: PAGE, images: [] },
      { source_url: PAGE, images: ["https://www.example-kanko.jp/upload/noid.jpg"] },
    ]);
    expect(records).toEqual([
      { key: "spot:a", images: [{ url: "https://www.example-kanko.jp/upload/a.jpg", source: "municipal_page", page_url: PAGE }] },
      { key: "spot:z", images: [{ url: "https://www.example-kanko.jp/upload/z.jpg", source: "municipal_page", page_url: PAGE }] },
    ]);
  });
});
