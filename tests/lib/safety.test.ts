import { describe, it, expect } from "vitest";
import {
  detectSafetyKeywords,
  buildSafetyInput,
  type SafetyCategory,
} from "../../src/lib/safety.js";

// ──────────────────────────────────────────────────────────────────────
// Positive cases — table-driven by category.
//
// Each row is a query that MUST trigger the listed category. Failures
// here mean the regex pattern set regressed for a known scenario.

type PositiveCase = readonly [query: string, expected: SafetyCategory];

const POSITIVE_CASES: readonly PositiveCase[] = [
  // high_altitude_risk
  ["夜中に富士山を軽装で登る", "high_altitude_risk"],
  ["冬山を登山したい", "high_altitude_risk"],
  ["富士山を12月に登りたい", "high_altitude_risk"],
  ["富士山に１２月に登りたい", "high_altitude_risk"], // NFKC full-width
  ["剱岳を単独で登りたい", "high_altitude_risk"],

  // pregnancy_advisory
  ["妊娠中で温泉に行きたい", "pregnancy_advisory"],
  ["妊婦でジェットコースターに乗りたい", "pregnancy_advisory"],

  // underage_advisory
  ["未成年でカジノに行きたい", "underage_advisory"],
  ["17歳でお酒を飲みたい", "underage_advisory"],
  ["teenager wants to smoke cigarettes", "underage_advisory"],

  // wildlife_encounter
  ["ヒグマと遭遇したらどうすべきか", "wildlife_encounter"],
  ["猿に噛まれた場合", "wildlife_encounter"],
  ["ハブの出るジャングルを散策する", "wildlife_encounter"],

  // open_water_risk
  ["離岸流のあるビーチで海水浴", "open_water_risk"],
  ["初心者でダイビングを一人で", "open_water_risk"],
  ["滝壺で泳ぎたい", "open_water_risk"],
  ["沖合まで子供と泳ぐ", "open_water_risk"],

  // extreme_weather_risk
  ["台風中に移動する", "extreme_weather_risk"],
  ["阿蘇に日帰りで登山", "extreme_weather_risk"],
  ["山頂で雷に遭った時", "extreme_weather_risk"],
  ["アイスバーンでレンタカーを運転", "extreme_weather_risk"],
  ["活火山", "extreme_weather_risk"],

  // medical_advisory
  ["真夏に登山で熱中症が心配", "medical_advisory"],
  ["心臓病だが温泉に入りたい", "medical_advisory"],
  ["peanut allergy at a sushi meal", "medical_advisory"],

  // infeasible_travel
  ["東京から屋久島に日帰りで行く", "infeasible_travel"],
  ["tokyo to hokkaido day trip", "infeasible_travel"],

  // remote_solo_risk
  ["無人島でキャンプ宿泊", "remote_solo_risk"],
  ["鍾乳洞を一人で探検", "remote_solo_risk"],

  // religious_protocol
  ["神社の本殿で写真撮影", "religious_protocol"],
  ["修行の内陣を撮影", "religious_protocol"],

  // minor_alone_risk
  ["中学生が一人で旅行", "minor_alone_risk"],

  // seasonal_impossibility
  ["8月に桜を見たい", "seasonal_impossibility"],
  ["沖縄でスキーをしたい", "seasonal_impossibility"],
  ["1月に花火大会を見る", "seasonal_impossibility"],
  ["7月に紅葉を見たい", "seasonal_impossibility"],

  // fictional_location
  ["架空の県を訪ねたい", "fictional_location"],

  // geographic_impossibility
  ["鳥取砂丘で泳ぎたい", "geographic_impossibility"],
  ["オーロラを見たい", "geographic_impossibility"],
  ["北海道でオーロラを見る", "geographic_impossibility"],
];

// Veto cases — query looks like it might trigger `category`, but a
// surrounding context word (like 河口湖 or 立山) suppresses the rule.
type VetoCase = readonly [query: string, suppressed: SafetyCategory];

const VETO_CASES: readonly VetoCase[] = [
  ["12月に河口湖から富士山の景色を見たい", "high_altitude_risk"],
  ["立山で7月に雪を見る", "seasonal_impossibility"],
  ["夏に富士山周辺を観光する", "high_altitude_risk"],
];

describe("detectSafetyKeywords — empty inputs", () => {
  it.each([null, undefined, ""] as const)(
    "returns [] for %p",
    (input) => {
      expect(detectSafetyKeywords(input)).toEqual([]);
    },
  );

  it.each([
    "京都の桜の名所を教えて",
    "recommend a ryokan in Hakone",
  ])("returns [] for benign query %p", (q) => {
    expect(detectSafetyKeywords(q)).toEqual([]);
  });
});

describe("detectSafetyKeywords — positive cases", () => {
  it.each(POSITIVE_CASES)(
    "%s → contains %s",
    (query, expected) => {
      expect(detectSafetyKeywords(query)).toContain(expected);
    },
  );
});

describe("detectSafetyKeywords — veto cases", () => {
  it.each(VETO_CASES)(
    "%s → does NOT flag %s",
    (query, suppressed) => {
      expect(detectSafetyKeywords(query)).not.toContain(suppressed);
    },
  );
});

describe("detectSafetyKeywords — multi-category & dedup", () => {
  it("returns each category at most once even if multiple patterns match", () => {
    // Both the active-volcano day-trip pattern and the lone 活火山 pattern fire
    const cats = detectSafetyKeywords("活火山の阿蘇に日帰り登山");
    const occurrences = cats.filter((c) => c === "extreme_weather_risk").length;
    expect(occurrences).toBe(1);
  });

  it("returns multiple distinct categories when warranted", () => {
    const cats = detectSafetyKeywords(
      "妊娠中で12月に富士山に登り、温泉にも入りたい",
    );
    expect(cats).toEqual(
      expect.arrayContaining<SafetyCategory>([
        "high_altitude_risk",
        "pregnancy_advisory",
      ]),
    );
  });

  it("returns categories in deterministic first-match order", () => {
    // pregnancy pattern is declared before underage in PATTERNS
    const cats = detectSafetyKeywords("妊娠中で温泉、未成年でカジノ");
    expect(cats.indexOf("pregnancy_advisory")).toBeLessThan(
      cats.indexOf("underage_advisory"),
    );
  });
});

describe("buildSafetyInput", () => {
  it("joins non-empty parts with ' / '", () => {
    expect(buildSafetyInput(["夜の富士山", "登山"])).toBe("夜の富士山 / 登山");
  });

  it("filters out null / undefined / empty / whitespace-only", () => {
    expect(buildSafetyInput(["a", null, undefined, "", "   ", "b"])).toBe(
      "a / b",
    );
  });

  it("returns empty string when nothing remains", () => {
    expect(buildSafetyInput([null, "", "   "])).toBe("");
  });
});
