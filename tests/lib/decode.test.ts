/**
 * Charset-aware decoding (scrapers/lib/decode.ts).
 *
 * The fixtures are real byte sequences, not strings: the whole point of the
 * module is what happens to bytes, and a test written over strings would pass
 * while the crawler stored mojibake. Each page carries the same Japanese text
 * so the assertions can be about the reading, not the content.
 */

import { describe, expect, it } from "vitest";
import { decodeHtml, declaredCharset, japaneseScore } from "../../scrapers/lib/decode.js";

const NAME = "みどりのキャンプ場";
const PRICE = "ご利用料金 1区画 4,000円";

/** Shift_JIS bytes, correctly declared as Shift_JIS. */
const SJIS_HONEST = Buffer.from(
  "PGh0bWw+PGhlYWQ+PG1ldGEgY2hhcnNldD0iU2hpZnRfSklTIj48dGl0bGU+gt2Cx4LogsyDTIODg5ODdo/qPC90aXRsZT48L2hlYWQ+PGJvZHk+PGgxPoLdgseC6ILMg0yDg4OTg3aP6jwvaDE+PHA+grKXmJdwl7+L4CAxi+aJ5iA0LDAwMIl+PC9wPjwvYm9keT48L2h0bWw+",
  "base64",
);

/** The same Shift_JIS bytes, declaring UTF-8 — a staple of this population. */
const SJIS_LYING = Buffer.from(
  "PGh0bWw+PGhlYWQ+PG1ldGEgY2hhcnNldD0idXRmLTgiPjx0aXRsZT6C3YLHguiCzINMg4ODk4N2j+o8L3RpdGxlPjwvaGVhZD48Ym9keT48aDE+gt2Cx4LogsyDTIODg5ODdo/qPC9oMT48cD6CspeYl3CXv4vgIDGL5onmIDQsMDAwiX48L3A+PC9ib2R5PjwvaHRtbD4=",
  "base64",
);

/** EUC-JP bytes, correctly declared. */
const EUCJP = Buffer.from(
  "PGh0bWw+PGhlYWQ+PG1ldGEgY2hhcnNldD0iRVVDLUpQIj48dGl0bGU+pN+kyaTqpM6lraXjpfOl177sPC90aXRsZT48L2hlYWQ+PGJvZHk+PGgxPqTfpMmk6qTOpa2l46Xzpde+7DwvaDE+PHA+pLTN+M3RzsG24iAxtuiy6CA0LDAwMLHfPC9wPjwvYm9keT48L2h0bWw+",
  "base64",
);

/** UTF-8 bytes with no declaration anywhere. */
const UTF8_BARE = Buffer.from(
  "PGh0bWw+PGhlYWQ+PHRpdGxlPuOBv+OBqeOCiuOBruOCreODo+ODs+ODl+WgtDwvdGl0bGU+PC9oZWFkPjxib2R5PjxoMT7jgb/jganjgorjga7jgq3jg6Pjg7Pjg5floLQ8L2gxPjxwPuOBlOWIqeeUqOaWmemHkSAx5Yy655S7IDQsMDAw5YaGPC9wPjwvYm9keT48L2h0bWw+",
  "base64",
);

describe("declaredCharset", () => {
  it("prefers the Content-Type header", () => {
    expect(declaredCharset(UTF8_BARE, "text/html; charset=Shift_JIS")).toBe("shift_jis");
  });

  it("falls back to the meta tag in the head", () => {
    expect(declaredCharset(SJIS_HONEST, "text/html")).toBe("shift_jis");
  });

  it("normalises the labels servers actually send", () => {
    expect(declaredCharset(UTF8_BARE, "text/html; charset=SHIFT-JIS")).toBe("shift_jis");
    expect(declaredCharset(UTF8_BARE, "text/html; charset=windows-31j")).toBe("shift_jis");
    expect(declaredCharset(UTF8_BARE, 'text/html; charset="EUC_JP"')).toBe("euc-jp");
  });

  it("is null when nothing declares anything", () => {
    expect(declaredCharset(UTF8_BARE, "text/html")).toBeNull();
  });
});

describe("decodeHtml", () => {
  it("reads a correctly declared Shift_JIS page", () => {
    const got = decodeHtml(SJIS_HONEST, "text/html; charset=Shift_JIS");
    expect(got.text).toContain(NAME);
    expect(got.text).toContain(PRICE);
    expect(got.charset).toBe("shift_jis");
    expect(got.overrode_declared).toBe(false);
  });

  it("reads Shift_JIS bytes that claim to be UTF-8", () => {
    const got = decodeHtml(SJIS_LYING, "text/html; charset=utf-8");
    expect(got.text).toContain(NAME);
    expect(got.charset).toBe("shift_jis");
    expect(got.overrode_declared).toBe(true);
    expect(got.text).not.toContain("\ufffd");
  });

  it("reads EUC-JP", () => {
    const got = decodeHtml(EUCJP, null);
    expect(got.text).toContain(NAME);
    expect(got.charset).toBe("euc-jp");
  });

  it("reads undeclared UTF-8 unchanged", () => {
    const got = decodeHtml(UTF8_BARE, "text/html");
    expect(got.text).toContain(NAME);
    expect(got.charset).toBe("utf-8");
    expect(got.declared).toBeNull();
  });

  it("leaves a Latin-only page alone", () => {
    const bytes = Buffer.from("<html><body><h1>Midori Campground</h1></body></html>", "utf8");
    const got = decodeHtml(bytes, "text/html; charset=utf-8");
    expect(got.text).toContain("Midori Campground");
    expect(got.charset).toBe("utf-8");
  });

  it("never throws on an unsupported declared label", () => {
    const got = decodeHtml(UTF8_BARE, "text/html; charset=x-not-a-charset");
    expect(got.text).toContain(NAME);
  });

  it("is what the UTF-8 read is not: the mojibake path is observable", () => {
    // What the shared fetcher did before this module existed, kept as the
    // contrast the fix is about.
    const naive = new TextDecoder("utf-8").decode(SJIS_HONEST);
    expect(naive).not.toContain(NAME);
    expect(japaneseScore(naive)).toBeLessThan(japaneseScore(decodeHtml(SJIS_HONEST, null).text));
  });
});

describe("japaneseScore", () => {
  it("counts kana and kanji", () => {
    expect(japaneseScore("キャンプ場")).toBeGreaterThan(0);
  });

  it("penalises replacement characters", () => {
    expect(japaneseScore("\ufffd\ufffd\ufffd")).toBeLessThan(0);
  });

  it("is about zero for plain ASCII", () => {
    expect(japaneseScore("campground price list")).toBe(0);
  });
});
