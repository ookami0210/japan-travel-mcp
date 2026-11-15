import { describe, it, expect } from "vitest";
import {
  extractHours,
  extractLodgingTimes,
  extractPageFacts,
  extractPrice,
  factsSnippet,
  normalizeJa,
  parseDays,
  parseJaTime,
} from "../../scrapers/lib/ja_hours_rules.js";
import { parseOpeningHours } from "../../src/lib/opening_hours.js";

describe("parseJaTime", () => {
  it("reads the common clock forms", () => {
    expect(parseJaTime("9:00")).toBe(540);
    expect(parseJaTime("17:30")).toBe(1050);
    expect(parseJaTime("9時")).toBe(540);
    expect(parseJaTime("9時30分")).toBe(570);
    expect(parseJaTime("17時半")).toBe(1050);
    expect(parseJaTime("午前9時")).toBe(540);
    expect(parseJaTime("午後5時")).toBe(1020);
    expect(parseJaTime("午後12時")).toBe(720);
    expect(parseJaTime("PM5:00")).toBe(1020);
    expect(parseJaTime("AM9:00")).toBe(540);
  });
  it("rejects prose numbers", () => {
    expect(parseJaTime("500")).toBeNull();
    expect(parseJaTime("9:75")).toBeNull();
    expect(parseJaTime("")).toBeNull();
  });
});

describe("parseDays", () => {
  it("expands ranges and lists", () => {
    expect(parseDays("月〜金")?.days).toEqual(["Mo", "Tu", "We", "Th", "Fr"]);
    expect(parseDays("月曜日〜金曜日")?.days).toEqual(["Mo", "Tu", "We", "Th", "Fr"]);
    expect(parseDays("土日祝")?.days).toEqual(["Sa", "Su", "PH"]);
    expect(parseDays("土・日・祝日")?.days).toEqual(["Sa", "Su", "PH"]);
    expect(parseDays("平日")?.days).toEqual(["Mo", "Tu", "We", "Th", "Fr"]);
    expect(parseDays("毎週水曜日")?.days).toEqual(["We"]);
    expect(parseDays("日曜・祝日")?.days).toEqual(["Su", "PH"]);
  });
  it("does not read a lone day kanji inside prose as a weekday", () => {
    expect(parseDays("本日の天気")).toBeNull();
    expect(parseDays("金額")).toBeNull();
  });
  it("flags constructs it does not model", () => {
    const r = parseDays("第2・4火曜日");
    expect(r?.unmodelled).toBe(true);
    expect(r?.days).toEqual([]);
    expect(parseDays("不定休")?.unmodelled).toBe(true);
  });
});

describe("extractHours", () => {
  it("reads a plain museum line and the server can structure it", () => {
    const r = extractHours(normalizeJa("開館時間 9:00〜17:00（入館は16:30まで）\n休館日 月曜日（祝日の場合は翌日）"));
    expect(r?.opening_hours).toBe("09:00-17:00; Mo off");
    expect(r?.partial).toBe(true);
    expect(r?.closed_days).toEqual(["Mo"]);
    const s = parseOpeningHours(r!.opening_hours!);
    expect(s?.weekly.tu?.[0]).toEqual({ open: 540, close: 1020 });
    expect(s?.weekly.mo).toEqual([]);
  });

  it("reads weekday and weekend blocks written in Japanese", () => {
    const text = normalizeJa(
      "営業時間\n平日 11:00〜22:00\n土日祝 10:00〜23:00\n定休日 水曜日",
    );
    const r = extractHours(text);
    expect(r?.opening_hours).toBe("Mo-Fr 11:00-22:00; Sa,Su,PH 10:00-23:00; We off");
  });

  it("handles fullwidth digits, 時 forms and 年中無休", () => {
    const r = extractHours(normalizeJa("営業時間：９時〜１７時　年中無休"));
    expect(r?.opening_hours).toBe("09:00-17:00");
    expect(r?.open_every_day).toBe(true);
  });

  it("reads a 24 h-clock close earlier than the open as the next morning", () => {
    expect(extractHours(normalizeJa("営業時間 10:30〜5:00"))?.opening_hours).toBe("10:30-05:00");
    expect(extractHours(normalizeJa("営業時間 11:00 - 00:00"))?.opening_hours).toBe("11:00-24:00");
    expect(extractHours(normalizeJa("営業時間 9〜5"))).toBeNull();
  });

  it("refuses a page whose hours blocks disagree (several stores)", () => {
    const text = normalizeJa("本店 営業時間 11:00〜22:00 定休日 月曜日\n駅前店 営業時間 5:00〜23:00 定休日 火曜日");
    const r = extractHours(text);
    expect(r?.ambiguous).toBe(true);
    expect(r?.opening_hours).toBeNull();
  });

  it("collapses a repeated block and drops a service window inside the main one", () => {
    const text = normalizeJa("営業時間 9:00〜18:00 ランチタイム 11:00〜15:00 定休日 無休\nフッター 営業時間 9:00〜18:00");
    const r = extractHours(text);
    expect(r?.ambiguous).toBe(false);
    expect(r?.opening_hours).toBe("09:00-18:00");
    expect(r?.open_every_day).toBe(true);
  });

  it("ignores hours that belong to parking, a phone desk or a bath", () => {
    expect(extractHours(normalizeJa("駐車場はパーキングメーター(利用時間9時〜19時)"))).toBeNull();
    expect(extractHours(normalizeJa("受付時間:9:00〜20:00"))).toBeNull();
    expect(extractHours(normalizeJa("大浴場のご利用時間 夜 18:00〜25:00"))).toBeNull();
  });

  it("reads day words joined by ・ and a trailing day list", () => {
    expect(extractHours(normalizeJa("営業時間 平日・土 8:00〜23:00 / 日祝 8:00〜22:00"))?.opening_hours).toBe(
      "Mo-Sa 08:00-23:00; Su,PH 08:00-22:00",
    );
    expect(extractHours(normalizeJa("営業時間 10:00〜16:00 17:00〜23:00(土・日・月) 定休日 火曜日"))?.opening_hours).toBe(
      "10:00-16:00; Mo,Sa,Su 17:00-23:00; Tu off",
    );
  });

  it("reads a label-less weekday block and 24時間営業", () => {
    expect(extractHours(normalizeJa("朝マック 平日 7:00〜23:00 土曜 7:00〜23:00 休日 7:00〜23:00"))?.opening_hours).toBe(
      "Mo-Fr 07:00-23:00; Sa 07:00-23:00; Su,PH 07:00-23:00",
    );
    expect(extractHours(normalizeJa("コンビニ 24時間営業"))?.opening_hours).toBe("00:00-24:00");
  });

  it("does not read 月一回 as Monday, and flags 第二・第四", () => {
    const r = extractHours(normalizeJa("営業時間 11:30〜14:30 定休日 木曜日 / 月一回水曜日"));
    expect(r?.closed_days).toEqual(["Th"]);
    expect(r?.partial).toBe(true);
    const r2 = extractHours(normalizeJa("定休日:毎月第二・第四 火曜日・水曜日"));
    expect(r2?.partial).toBe(true);
  });

  it("reads a past-midnight window", () => {
    const r = extractHours(normalizeJa("営業時間 18:00〜翌2:00"));
    expect(r?.opening_hours).toBe("18:00-02:00");
    expect(r?.rules[0].close).toBe("26:00");
    const s = parseOpeningHours(r!.opening_hours!);
    expect(s?.weekly.mo?.[0]).toEqual({ open: 1080, close: 1560 });
  });

  it("reads 午前/午後 prose", () => {
    const r = extractHours(normalizeJa("拝観時間 午前9時から午後4時30分まで"));
    expect(r?.opening_hours).toBe("09:00-16:30");
  });

  it("returns null when no label carries a time range", () => {
    expect(extractHours(normalizeJa("営業時間はお問い合わせください。"))).toBeNull();
    expect(extractHours(normalizeJa("2026年9月の営業について"))).toBeNull();
  });

  it("keeps evidence verbatim", () => {
    const r = extractHours(normalizeJa("営業時間 10:00〜18:00"));
    expect(r?.evidence[0]).toContain("営業時間 10:00〜18:00");
  });
});

describe("extractPrice", () => {
  it("reads adult and child admission", () => {
    const r = extractPrice(normalizeJa("入館料 大人 500円 小学生 200円"));
    expect(r?.adult_jpy).toBe(500);
    expect(r?.child_jpy).toBe(200);
    expect(r?.free).toBe(false);
  });
  it("reads thousands separators and 一般", () => {
    const r = extractPrice(normalizeJa("拝観料：一般1,200円、中学生以下無料"));
    expect(r?.adult_jpy).toBe(1200);
  });
  it("reads 無料", () => {
    const r = extractPrice(normalizeJa("入場料 無料"));
    expect(r?.free).toBe(true);
    expect(r?.adult_jpy).toBeNull();
  });
  it("reads a bare amount after the label", () => {
    expect(extractPrice(normalizeJa("入園料 300円"))?.adult_jpy).toBe(300);
  });
  it("reads a lodging from-rate and ignores a hotel's other fees", () => {
    const r = extractPrice(normalizeJa("宿泊料金 1泊2食付 12,000円〜"), true);
    expect(r?.from_jpy).toBe(12000);
    expect(r?.adult_jpy).toBeNull();
    expect(extractPrice(normalizeJa("料金:200円 駐車場 料金 【旧料金】1,500円"), true)).toBeNull();
    expect(extractPrice(normalizeJa("料金の改定について 無料Wi-Fiの案内"), true)).toBeNull();
  });
  it("returns null without a price label", () => {
    expect(extractPrice(normalizeJa("駐車場は50台"))).toBeNull();
  });
});

describe("extractLodgingTimes", () => {
  it("reads check-in and check-out", () => {
    const r = extractLodgingTimes(normalizeJa("チェックイン 15:00 チェックアウト 10:00"));
    expect(r?.checkin).toBe("15:00");
    expect(r?.checkout).toBe("10:00");
  });
  it("rejects implausible times and a bare OUT in the afternoon", () => {
    expect(extractLodgingTimes(normalizeJa("チェックイン 3:00"))).toBeNull();
    expect(extractLodgingTimes(normalizeJa("OUT 15:00"))).toBeNull();
    expect(extractLodgingTimes(normalizeJa("IN 15:00 / OUT 10:00"))).toEqual({ checkin: "15:00", checkout: "10:00", evidence: ["IN 15:00", "OUT 10:00"] });
  });
});

describe("extractPageFacts / factsSnippet", () => {
  it("combines the readers, and a hotel page yields lodging facts not hours", () => {
    const f = extractPageFacts("営業時間 9:00〜17:00\n入場料 大人500円");
    expect(f.hours?.opening_hours).toBe("09:00-17:00");
    expect(f.price?.adult_jpy).toBe(500);
    const h = extractPageFacts("レストラン営業時間 11:00〜14:00\nチェックイン 15:00 宿泊料金 9,800円〜", true);
    expect(h.hours).toBeNull();
    expect(h.lodging?.checkin).toBe("15:00");
    expect(h.price?.from_jpy).toBe(9800);
  });
  it("notices a closure announcement", () => {
    expect(extractPageFacts("【閉店のお知らせ】平素よりご愛顧いただき").closure_notice).toContain("閉店のお知らせ");
    expect(extractPageFacts("営業時間 9:00〜17:00").closure_notice).toBeNull();
  });
  it("snippet starts just before the first label", () => {
    const long = `${"前置き。".repeat(100)}営業時間 9:00〜17:00 ${"後。".repeat(100)}`;
    const s = factsSnippet(long, 300);
    expect(s).toContain("営業時間 9:00〜17:00");
    expect(s.length).toBeLessThanOrEqual(300);
  });
});
