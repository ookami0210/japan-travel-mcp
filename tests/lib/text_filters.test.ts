import { describe, it, expect } from "vitest";
import {
  compileKeywordMatcher,
  isPrefWidePortalUrl,
  isNavChromeSpotName,
  isFoodText,
  isFestivalText,
  PREF_WIDE_PORTAL_DOMAINS,
} from "../../src/lib/text_filters.js";

// ─── compileKeywordMatcher ───────────────────────────────────────────

describe("compileKeywordMatcher — keyword absent / empty", () => {
  it.each([undefined, "", "   ", "\t"])(
    "accepts everything when keyword is %j",
    (kw) => {
      const m = compileKeywordMatcher(kw);
      expect(m()).toBe(true);
      expect(m(null, undefined, "anything")).toBe(true);
    },
  );
});

describe("compileKeywordMatcher — substring matching", () => {
  it("matches when any field contains the keyword as-is", () => {
    const m = compileKeywordMatcher("花火");
    expect(m("○○花火大会")).toBe(true);
    expect(m(null, undefined, "○○花火祭")).toBe(true);
  });

  it("matches case-insensitively for ASCII keywords", () => {
    const m = compileKeywordMatcher("Sakura");
    expect(m("sakura matsuri")).toBe(true);
    expect(m("SAKURA viewing")).toBe(true);
  });

  it("returns false when no field contains the keyword", () => {
    const m = compileKeywordMatcher("花火");
    expect(m("○○祭")).toBe(false);
    expect(m(null, undefined, null)).toBe(false);
  });

  it("trims surrounding whitespace from the keyword", () => {
    const m = compileKeywordMatcher("  花火  ");
    expect(m("○○花火大会")).toBe(true);
  });

  it("skips null / undefined / empty fields", () => {
    const m = compileKeywordMatcher("test");
    expect(m(null, undefined, "")).toBe(false);
    expect(m(null, "test value", undefined)).toBe(true);
  });
});

// ─── isPrefWidePortalUrl ─────────────────────────────────────────────

describe("isPrefWidePortalUrl", () => {
  it("returns false for null / undefined / empty URL", () => {
    expect(isPrefWidePortalUrl(null)).toBe(false);
    expect(isPrefWidePortalUrl(undefined)).toBe(false);
    expect(isPrefWidePortalUrl("")).toBe(false);
  });

  it("returns true for a known prefecture-wide portal domain", () => {
    expect(isPrefWidePortalUrl("https://dive-hiroshima.com/about")).toBe(true);
    expect(isPrefWidePortalUrl("https://www.japan.travel/jp/en/")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isPrefWidePortalUrl("https://DIVE-HIROSHIMA.com/x")).toBe(true);
  });

  it("returns false for a city-level municipal site", () => {
    expect(isPrefWidePortalUrl("https://city.kyoto.lg.jp/")).toBe(false);
  });

  it("matches every documented portal domain", () => {
    for (const d of PREF_WIDE_PORTAL_DOMAINS) {
      expect(isPrefWidePortalUrl(`https://${d}/abc`)).toBe(true);
    }
  });
});

// ─── isNavChromeSpotName ─────────────────────────────────────────────

describe("isNavChromeSpotName — empty / structural rejection", () => {
  it("rejects null / undefined / empty / whitespace-only", () => {
    expect(isNavChromeSpotName(null)).toBe(true);
    expect(isNavChromeSpotName(undefined)).toBe(true);
    expect(isNavChromeSpotName("")).toBe(true);
    expect(isNavChromeSpotName("   ")).toBe(true);
  });

  it("rejects mojibake / encoding garbage", () => {
    expect(isNavChromeSpotName("test�broken")).toBe(true);
    expect(isNavChromeSpotName("¿À\xff")).toBe(true);
  });

  it("rejects pure-symbol names", () => {
    expect(isNavChromeSpotName("---")).toBe(true);
    expect(isNavChromeSpotName("・・")).toBe(true);
    expect(isNavChromeSpotName("•")).toBe(true);
  });

  it("rejects very short hiragana-only / katakana-only labels", () => {
    expect(isNavChromeSpotName("あ")).toBe(true);
    expect(isNavChromeSpotName("カナ")).toBe(true);
  });
});

describe("isNavChromeSpotName — exact nav matches", () => {
  it.each([
    "Home",
    "MENU",
    "Sitemap",
    "ホーム",
    "プライバシーポリシー",
    "お問い合わせ",
    "サイトマップ",
    "観光情報",
    "イベント情報",
  ])("rejects exact nav label '%s'", (name) => {
    expect(isNavChromeSpotName(name)).toBe(true);
  });

  it("rejects 'Special Feature' boilerplate", () => {
    expect(isNavChromeSpotName("おすすめ特集")).toBe(true);
    expect(isNavChromeSpotName("Special Feature")).toBe(true);
  });

  it("rejects extra-list nav titles (exact match, case-sensitive for ASCII)", () => {
    expect(isNavChromeSpotName("文化・観光")).toBe(true);
    expect(isNavChromeSpotName("見る・遊ぶ")).toBe(true);
    // The NAV_EXACT_EXTRA list stores "404 not found" lowercase; the
    // implementation only does a case-folded compare for NAV_EXACT_WORDS,
    // so the uppercase form falls through. Exact lowercase match works.
    expect(isNavChromeSpotName("404 not found")).toBe(true);
  });
});

describe("isNavChromeSpotName — suffix portal regex", () => {
  it.each([
    "兵庫観光navi",
    "○○観光協会公式サイト",
    "○○観光物産協会",
    "○○エコツーリズム推進協議会",
  ])("rejects portal-suffix name '%s'", (name) => {
    expect(isNavChromeSpotName(name)).toBe(true);
  });
});

describe("isNavChromeSpotName — contains-style chrome", () => {
  it.each([
    "Cookie consent banner",
    "本サイトについて",
    "Skip to content",
    "予約サイトへのリンク",
    "観光振興課業務案内",
  ])("rejects '%s' (contains-style match)", (name) => {
    expect(isNavChromeSpotName(name)).toBe(true);
  });
});

describe("isNavChromeSpotName — accepts real spots", () => {
  it.each([
    "金閣寺",
    "Kinkaku-ji Temple",
    "鳥取砂丘",
    "厳島神社",
    "兼六園",
    "Mount Fuji Visitor Centre",
  ])("keeps real attraction name '%s'", (name) => {
    expect(isNavChromeSpotName(name)).toBe(false);
  });
});

// ─── isFoodText / isFestivalText ─────────────────────────────────────

describe("isFoodText", () => {
  it("returns false for null / undefined / empty", () => {
    expect(isFoodText(null)).toBe(false);
    expect(isFoodText(undefined)).toBe(false);
    expect(isFoodText("")).toBe(false);
  });

  it.each([
    "京都の郷土料理",
    "○○ご当地グルメ",
    "○○ラーメン専門店",
    "○○の地酒",
  ])("matches Japanese food keyword in '%s'", (text) => {
    expect(isFoodText(text)).toBe(true);
  });

  it.each(["Local cuisine of Kyoto", "RAMEN shops", "Sake brewery tour"])(
    "matches English food keyword in '%s' (case-insensitive)",
    (text) => {
      expect(isFoodText(text)).toBe(true);
    },
  );

  it("returns false for unrelated text", () => {
    expect(isFoodText("○○神社の歴史")).toBe(false);
    expect(isFoodText("Mountain hiking trail")).toBe(false);
  });
});

describe("isFestivalText", () => {
  it("returns false for null / undefined / empty", () => {
    expect(isFestivalText(null)).toBe(false);
    expect(isFestivalText(undefined)).toBe(false);
    expect(isFestivalText("")).toBe(false);
  });

  it.each([
    "○○祭り",
    "夏祭礼",
    "○○神事",
    "○○花火大会",
    "山車巡行",
  ])("matches Japanese festival keyword in '%s'", (text) => {
    expect(isFestivalText(text)).toBe(true);
  });

  it.each(["Summer Festival", "MATSURI parade", "Lantern Festival"])(
    "matches English festival keyword in '%s'",
    (text) => {
      expect(isFestivalText(text)).toBe(true);
    },
  );

  it("returns false for non-festival text", () => {
    expect(isFestivalText("Hot spring ryokan")).toBe(false);
  });
});
