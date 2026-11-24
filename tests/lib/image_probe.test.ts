import { describe, expect, it } from "vitest";

import {
  imageSize,
  isGovernmentDefaultImage,
  isPhotoCandidate,
  pickPageImage,
} from "../../scrapers/lib/image_probe.js";
import {
  isPhotoSize,
  selectTargets,
  sharedImages,
} from "../../scrapers/sources/fetch_official_site_images.js";

describe("isPhotoCandidate", () => {
  it("keeps an ordinary photo URL", () => {
    expect(isPhotoCandidate("https://hikonecastle.com/img/ogp_hikone_castle.jpg")).toBe(true);
    expect(isPhotoCandidate("https://kochipark.jp/kochijyo/wp-content/uploads/2024/08/tenshu.jpg")).toBe(true);
  });

  it("drops data URIs, vector and icon formats, and site furniture", () => {
    for (const u of [
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      "https://osaka-info.jp/common/img/logo.svg",
      "https://example.jp/img/top.gif",
      "https://example.jp/favicon.ico",
      "https://example.jp/assets/images/logo.png",
      "https://example.jp/img/common/header_bg.jpg",
      "https://example.jp/img/sns/ico_facebook.png",
      "https://example.jp/images/noimage.jpg",
      "ftp://example.jp/a.jpg",
      "not a url",
    ]) {
      expect(isPhotoCandidate(u), u).toBe(false);
    }
  });
});

describe("isGovernmentDefaultImage", () => {
  it("drops a city site's generic share image, not a venue site's own", () => {
    expect(isGovernmentDefaultImage("https://www.city.yashio.lg.jp/images/ogp.png", "https://www.city.yashio.lg.jp/a/")).toBe(true);
    expect(isGovernmentDefaultImage("https://www.ohori-nougaku.jp/assets/img/base/ogp.png", "https://www.ohori-nougaku.jp/")).toBe(false);
    expect(isGovernmentDefaultImage("https://www.city.example.jp/images/castle_2024.jpg", "https://www.city.example.jp/c/")).toBe(false);
  });
});

describe("pickPageImage", () => {
  const page = "https://castle.example.jp/guide/";

  it("takes og:image, resolved against the page", () => {
    const html = '<html><head><meta property="og:image" content="/img/tenshu.jpg"></head></html>';
    expect(pickPageImage(html, page)).toBe("https://castle.example.jp/img/tenshu.jpg");
  });

  it("falls back to twitter:image when og:image is a logo", () => {
    const html =
      '<meta property="og:image" content="https://castle.example.jp/img/logo.png">' +
      '<meta name="twitter:image" content="https://castle.example.jp/img/keep.jpg">';
    expect(pickPageImage(html, page)).toBe("https://castle.example.jp/img/keep.jpg");
  });

  it("returns null when the page names no usable image", () => {
    expect(pickPageImage("<html><head><title>x</title></head></html>", page)).toBeNull();
    expect(pickPageImage('<meta property="og:image" content="">', page)).toBeNull();
  });
});

describe("imageSize", () => {
  it("reads a PNG header", () => {
    const b = new Uint8Array(32);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    const dv = new DataView(b.buffer);
    dv.setUint32(16, 1200);
    dv.setUint32(20, 630);
    expect(imageSize(b)).toEqual({ width: 1200, height: 630, format: "png" });
  });

  it("walks JPEG markers to the start of frame", () => {
    // SOI, APP0 (length 16), SOF0 with height 675 and width 1200.
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xa3, 0x04, 0xb0, 0x03, ...new Array(9).fill(0)];
    const b = new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
    expect(imageSize(b)).toEqual({ width: 1200, height: 675, format: "jpeg" });
  });

  it("reads a VP8X WebP header", () => {
    const b = new Uint8Array(32);
    b.set([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X")]);
    // canvas width-1 = 1279, height-1 = 599 (24-bit little endian)
    b.set([0xff, 0x04, 0x00, 0x57, 0x02, 0x00], 24);
    expect(imageSize(b)).toEqual({ width: 1280, height: 600, format: "webp" });
  });

  it("returns null for anything else", () => {
    expect(imageSize(new Uint8Array(40))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("official-site image targets and checks", () => {
  it("keeps one target per attraction, without non-official hosts or brand URLs", () => {
    const t = selectTargets([
      { qid: "Q1", official_url: "hikonecastle.com" },
      { qid: "Q1", official_url: "https://other.example.jp/" },
      { qid: "Q2", official_url: "https://www.instagram.com/some_shrine/" },
      { qid: "Q3", official_url: "https://brand.example.jp/" },
      { qid: "Q4", official_url: "https://brand.example.jp" },
      { qid: "Q5", official_url: "https://BRAND.example.jp/" },
      { qid: "Q6", official_url: null },
    ]);
    expect(t).toEqual([{ qid: "Q1", url: "https://hikonecastle.com/" }]);
  });

  it("finds images named by three or more pages", () => {
    const s = sharedImages([{ image: "a" }, { image: "a" }, { image: "a" }, { image: "b" }, { image: "b" }]);
    expect([...s]).toEqual(["a"]);
  });

  it("accepts photo shapes and refuses narrow images and strips", () => {
    expect(isPhotoSize(1200, 630)).toBe(true);
    expect(isPhotoSize(600, 800)).toBe(true);
    expect(isPhotoSize(399, 300)).toBe(false);
    expect(isPhotoSize(1200, 200)).toBe(false);
    expect(isPhotoSize(400, 1300)).toBe(false);
  });
});
