import { describe, it, expect } from "vitest";
import { tokenize } from "../../src/lib/hybrid.js";

describe("tokenize — empty / trivial", () => {
  it("returns [] for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns [] for input that contains only punctuation / whitespace", () => {
    expect(tokenize("   !!! ,. ")).toEqual([]);
  });

  it("drops single-character latin tokens (min length 2)", () => {
    expect(tokenize("a b c")).toEqual([]);
  });
});

describe("tokenize — Latin words", () => {
  it("lowercases and splits on non-alphanumeric", () => {
    expect(tokenize("Tokyo Tower")).toEqual(["tokyo", "tower"]);
  });

  it("keeps alphanumeric runs of length >= 2", () => {
    expect(tokenize("Top10 hotels")).toEqual(["top10", "hotels"]);
  });

  it("ignores punctuation between words", () => {
    expect(tokenize("kyoto-imperial.palace")).toEqual([
      "kyoto",
      "imperial",
      "palace",
    ]);
  });
});

describe("tokenize — CJK runs", () => {
  it("emits unigrams + bigrams for hiragana/katakana/CJK", () => {
    // 京都 → 京, 京都, 都 (interleaved unigram + bigram)
    expect(tokenize("京都")).toEqual(["京", "京都", "都"]);
  });

  it("emits unigrams + sliding bigrams for a longer run", () => {
    // 東京駅 → 東, 東京, 京, 京駅, 駅
    expect(tokenize("東京駅")).toEqual(["東", "東京", "京", "京駅", "駅"]);
  });

  it("treats hiragana the same as kanji", () => {
    // ひらがな (4 chars) → ひ, ひら, ら, らが, が, がな, な
    expect(tokenize("ひらがな")).toEqual([
      "ひ",
      "ひら",
      "ら",
      "らが",
      "が",
      "がな",
      "な",
    ]);
  });

  it("treats katakana as CJK", () => {
    expect(tokenize("カフェ")).toEqual(["カ", "カフ", "フ", "フェ", "ェ"]);
  });
});

describe("tokenize — mixed scripts", () => {
  it("emits CJK and Latin segments separately", () => {
    const tokens = tokenize("京都 hotel");
    expect(tokens).toContain("京");
    expect(tokens).toContain("都");
    expect(tokens).toContain("京都");
    expect(tokens).toContain("hotel");
  });

  it("a space between CJK runs prevents a bridging bigram", () => {
    const tokens = tokenize("京都 大阪");
    expect(tokens).toContain("京都");
    expect(tokens).toContain("大阪");
    expect(tokens).not.toContain("都大");
  });

  it("digits stick with latin alpha in a single token", () => {
    expect(tokenize("Hotel42")).toEqual(["hotel42"]);
  });
});

describe("tokenize — edge cases", () => {
  it("does not emit a bigram for the last char of a CJK run", () => {
    // 京 (1 char) → just the unigram
    expect(tokenize("京")).toEqual(["京"]);
  });

  it("returns a deterministic order (CJK by position)", () => {
    expect(tokenize("奈良")).toEqual(["奈", "奈良", "良"]);
  });
});
