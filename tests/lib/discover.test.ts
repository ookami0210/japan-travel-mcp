import { describe, it, expect } from "vitest";
import { isTourismLike, isFeaturePage } from "../../scrapers/lib/discover.js";

describe("isTourismLike", () => {
  it("matches English tourism keywords (case-insensitive)", () => {
    expect(isTourismLike("/kanko/spots")).toBe(true);
    expect(isTourismLike("/Sightseeing/areas")).toBe(true);
    expect(isTourismLike("Tourism information")).toBe(true);
    expect(isTourismLike("/visit/")).toBe(true);
    expect(isTourismLike("attraction list")).toBe(true);
  });

  it("matches Japanese tourism keywords", () => {
    expect(isTourismLike("観光案内")).toBe(true);
    expect(isTourismLike("見どころ紹介")).toBe(true);
    expect(isTourismLike("名所旧跡")).toBe(true);
    expect(isTourismLike("散策コース")).toBe(true);
    expect(isTourismLike("文化財一覧")).toBe(true);
  });

  it("matches event / festival keywords", () => {
    expect(isTourismLike("Festival in May")).toBe(true);
    expect(isTourismLike("祭り情報")).toBe(true);
    expect(isTourismLike("/events/2026")).toBe(true);
  });

  it("returns false for unrelated text", () => {
    expect(isTourismLike("city office hours")).toBe(false);
    expect(isTourismLike("税金の納付について")).toBe(false);
    expect(isTourismLike("ごみ収集")).toBe(false);
    expect(isTourismLike("/admin/login")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isTourismLike("")).toBe(false);
  });

  // ADR 0001 / workstream B1 — broaden tourism-like keywords so the BFS
  // doesn't bail out the moment it leaves /kanko/. Local food, crafts,
  // model courses, and "things to do" are all first-class signals now.
  it("matches the broadened ADR 0001 keywords (food / crafts / courses)", () => {
    expect(isTourismLike("/グルメ/お土産")).toBe(true);
    expect(isTourismLike("ご当地名物のページ")).toBe(true);
    expect(isTourismLike("郷土料理一覧")).toBe(true);
    expect(isTourismLike("和菓子の銘菓")).toBe(true);
    expect(isTourismLike("/特産品/")).toBe(true);
    expect(isTourismLike("/things-to-do/")).toBe(true);
    expect(isTourismLike("must-see spots")).toBe(true);
    expect(isTourismLike("local cuisine guide")).toBe(true);
    expect(isTourismLike("/モデルコース/spring")).toBe(true);
  });

  it("matches festival-specific keywords added in B1", () => {
    expect(isTourismLike("祭礼の歴史")).toBe(true);
    expect(isTourismLike("神事の準備")).toBe(true);
    expect(isTourismLike("催し物カレンダー")).toBe(true);
    expect(isTourismLike("年中行事")).toBe(true);
    expect(isTourismLike("matsuri season")).toBe(true);
  });
});

describe("isFeaturePage — ADR 0001 / workstream B3", () => {
  it("recognises English feature URL paths", () => {
    expect(isFeaturePage("https://example.com/feature/spring")).toBe(true);
    expect(isFeaturePage("https://example.com/event/2026")).toBe(true);
    expect(isFeaturePage("https://example.com/spot/12345")).toBe(true);
    expect(isFeaturePage("https://example.com/article/foo")).toBe(true);
    expect(isFeaturePage("https://example.com/festival/yoshida-fire")).toBe(true);
  });

  it("recognises Japanese feature URL segments", () => {
    expect(isFeaturePage("https://example.com/特集/spring")).toBe(true);
    expect(isFeaturePage("https://example.com/イベント/2026")).toBe(true);
    expect(isFeaturePage("https://example.com/モデルコース/")).toBe(true);
    expect(isFeaturePage("https://example.com/グルメ/sushi")).toBe(true);
    expect(isFeaturePage("https://example.com/特産/wagyu")).toBe(true);
  });

  it("returns false for plain landing / list URLs", () => {
    expect(isFeaturePage("https://example.com/")).toBe(false);
    expect(isFeaturePage("https://example.com/about")).toBe(false);
    expect(isFeaturePage("https://example.com/kanko/")).toBe(false);
  });
});
