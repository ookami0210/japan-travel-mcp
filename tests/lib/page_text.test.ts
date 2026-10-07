/**
 * Visible-text extraction (scrapers/lib/page_text.ts).
 */

import { describe, expect, it } from "vitest";
import { pageText } from "../../scrapers/lib/page_text.js";

describe("pageText", () => {
  it("returns the words a visitor sees, in page order", () => {
    const html =
      "<html><body><h1>みどりのキャンプ場</h1><p>ご利用料金</p><p>1区画 4,000円</p></body></html>";
    expect(pageText(html)).toBe("みどりのキャンプ場 ご利用料金 1区画 4,000円");
  });

  it("drops script, style and noscript content", () => {
    const html =
      "<body><script>var price = 9999;</script><style>.a{color:red}</style>" +
      "<noscript>JavaScriptを有効にしてください</noscript><p>4,000円</p></body>";
    expect(pageText(html)).toBe("4,000円");
  });

  it("drops comments, which often hold an old price", () => {
    expect(pageText("<p>4,000円</p><!-- 2025年は3,500円 -->")).toBe("4,000円");
  });

  it("decodes the entities a tag strip leaves behind", () => {
    expect(pageText("<p>大人&nbsp;2名&amp;子供&#51;名&#x3b;</p>")).toBe("大人 2名&子供3名;");
  });

  it("decodes the named entities a CMS writes into breadcrumbs and prices", () => {
    expect(pageText("<p>和寒町 &raquo; キャンプ場</p>")).toBe("和寒町 \u00bb キャンプ場");
    expect(pageText("<p>&yen;4,000&middot;1泊&hellip;</p>")).toBe("\u00a54,000\u00b71泊\u2026");
  });

  it("leaves an entity it does not know as written, rather than guessing", () => {
    expect(pageText("<p>&notanentity; 料金</p>")).toBe("&notanentity; 料金");
  });

  it("collapses the whitespace of hand-written markup", () => {
    expect(pageText("<td>  料金\n\n\t</td><td>4,000円  </td>")).toBe("料金 4,000円");
  });

  it("reads a page with unclosed tags rather than giving up", () => {
    expect(pageText("<p>料金<p>4,000円<br>税込")).toBe("料金 4,000円 税込");
  });

  it("is empty for markup with no text", () => {
    expect(pageText("<html><head><title></title></head><body><img src=a.jpg></body></html>")).toBe(
      "",
    );
  });
});
