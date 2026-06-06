import { describe, it, expect } from "vitest";
import { extractJsonObject } from "../../scrapers/translate/lib/parse.js";

describe("extractJsonObject", () => {
  it("parses a clean JSON object", () => {
    expect(extractJsonObject('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("strips a ```json fence", () => {
    const t = '```json\n{ "qid": "Q1", "descriptions": { "en": "hello" } }\n```';
    expect(extractJsonObject(t)).toEqual({
      qid: "Q1",
      descriptions: { en: "hello" },
    });
  });

  it("strips a bare ``` fence", () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("ignores prose around the object", () => {
    expect(extractJsonObject('Here you go:\n{"a":1}\nDone.')).toEqual({ a: 1 });
  });

  it("repairs a raw newline inside a string value (the real failure mode)", () => {
    // A literal newline inside the string is invalid JSON; strict parse throws.
    const broken = '{"en":"line one\nline two","confidence":"high"}';
    expect(() => JSON.parse(broken)).toThrow();
    expect(extractJsonObject(broken)).toEqual({
      en: "line one\nline two",
      confidence: "high",
    });
  });

  it("repairs raw tabs/CRs inside strings", () => {
    const broken = '{"a":"x\ty","b":"p\rq"}';
    expect(extractJsonObject(broken)).toEqual({ a: "x\ty", b: "p\rq" });
  });

  it("preserves already-escaped sequences and quotes", () => {
    const t = '{"a":"say \\"hi\\"","b":"c:\\\\path"}';
    expect(extractJsonObject(t)).toEqual({ a: 'say "hi"', b: "c:\\path" });
  });

  it("handles fenced JSON with escaped quotes and CJK (real sample shape)", () => {
    const t =
      '```json\n{ "qid": "Q1", "descriptions": { "ja": "「是より北 木曽路」の碑", "en": "\\"From here\\" monument" } }\n```';
    expect(extractJsonObject(t)).toEqual({
      qid: "Q1",
      descriptions: { ja: "「是より北 木曽路」の碑", en: '"From here" monument' },
    });
  });

  it("does not corrupt structural whitespace (newlines between tokens)", () => {
    const t = '{\n  "a": 1,\n  "b": 2\n}';
    expect(extractJsonObject(t)).toEqual({ a: 1, b: 2 });
  });

  it("throws when there is no object at all", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});
