import { describe, it, expect } from "vitest";
import { parseList, parseDetail } from "../../scrapers/sources/fetch_hito_yu_kai.js";
import { parseListPage } from "../../scrapers/sources/fetch_koyasan_shukubo.js";

describe("hito_yu_kai parseList", () => {
  it("accepts both shapes of the member link", () => {
    const html = `
      <li><a href="/provider/589" class="defList05__link">A旅館</a></li>
      <li><a href="/provider/detail?providerId=591">B温泉</a></li>
      <li><a href="/provider/589">dup</a></li>
      <li><a href="/provider/list">list</a></li>`;
    const items = parseList(html);
    expect(items.map((i) => i.id)).toEqual(["589", "591"]);
    expect(items[0].url).toBe("https://www.hitou.or.jp/provider/589");
    expect(items[0].name_text).toBe("A旅館");
  });
});

describe("hito_yu_kai parseDetail", () => {
  it("reads the name from an h1 or h2 and the address cell", () => {
    const html = `
      <meta property="og:title" content="A旅館 - 日本秘湯を守る会 公式Webサイト">
      <meta property="og:description" content="山の宿">
      <h1 id="providerName" class="title02__h2">X温泉 A旅館 </h1>
      <table><tr><th class="table01__th">住所</th><td>〒000-0000 秋田県Y市Z 1-1 <a>[→MAP]</a></td></tr></table>`;
    const d = parseDetail(html, "fallback");
    expect(d.name_ja).toBe("X温泉 A旅館");
    expect(d.address_jp).toBe("〒000-0000 秋田県Y市Z 1-1");
    expect(d.prefecture_jp).toBe("秋田県");
    expect(d.description_ja).toBe("山の宿");
  });
});

describe("koyasan parseListPage", () => {
  it("lists temple pages and skips navigation pages", () => {
    const html = `<a href="ekoin.html?modal=1">a</a> <a href="index.html">b</a> <a href="fukuchiin.html">c</a>`;
    expect(parseListPage(html).map((i) => i.id)).toEqual(["ekoin", "fukuchiin"]);
  });
});
