import { describe, it, expect } from "vitest";
import { isTourismLike } from "../../scrapers/lib/discover.js";

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
});
