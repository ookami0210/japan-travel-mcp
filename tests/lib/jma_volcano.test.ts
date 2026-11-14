/**
 * The decisions the JMA volcanic-alert fetcher makes without the network
 * (scrapers/lib/jma_volcano.ts).
 *
 * Fixtures under tests/fixtures/jma_volcano/ are real JMA responses (long
 * free-text fields shortened): an excerpt of the eqvol_l Atom feed, a
 * VFVO50 噴火警報・予報 (雌阿寒岳, Level 2 → 1), a VFVO51 解説情報
 * (口永良部島, Level 1 継続), two bosai warning JSONs (阿蘇山 Level 2,
 * 口永良部島 Level 1), one bosai 解説情報 JSON (有珠山) and a slice of the
 * bosai volcano list.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  levelFromKindCode,
  parseAtomFeed,
  parseBosaiBulletin,
  parseBulletinXml,
  parseVolcanoList,
  readAlert,
  reportTypeFromUrl,
  resolveVolcanoRecords,
  STALE_AFTER_HOURS,
  type AlertObservation,
} from "../../scrapers/lib/jma_volcano.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/jma_volcano/${name}`, import.meta.url)),
    "utf8",
  );
}

const VFVO50_URL =
  "https://www.data.jma.go.jp/developer/xml/data/20261104010017_0_VFVO50_016000.xml";
const VFVO51_URL =
  "https://www.data.jma.go.jp/developer/xml/data/20261109070157_0_VFVO51_400000.xml";
const AS_OF = "2026-11-09T12:00:00.000Z";

const volcanoes = parseVolcanoList(JSON.parse(fixture("bosai_volcano_list.json")));

describe("reportTypeFromUrl", () => {
  it("reads the report-type code from a JMA XML file name", () => {
    expect(reportTypeFromUrl(VFVO50_URL)).toBe("VFVO50");
    expect(reportTypeFromUrl("https://example.org/feed.xml")).toBeNull();
  });
});

describe("parseAtomFeed", () => {
  it("keeps the alert bulletins and drops ashfall, observation and earthquake reports", () => {
    const entries = parseAtomFeed(fixture("eqvol_l_excerpt.xml"));
    expect(entries.map((e) => e.report_type).sort()).toEqual(["VFVO50", "VFVO51"]);
    for (const e of entries) {
      expect(e.url).toMatch(/^https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\//);
    }
  });
});

describe("parseBulletinXml", () => {
  it("reads the level a 噴火警報・予報 sets for its volcano", () => {
    const obs = parseBulletinXml(fixture("VFVO50_meakandake.xml"), VFVO50_URL);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({
      volcano_code: "105",
      volcano_name_ja: "雌阿寒岳",
      kind_name: "レベル１（活火山であることに留意）",
      kind_code: "11",
      condition: "引下げ",
      issued_at: "2026-11-04T10:00:00+09:00",
      bulletin_url: VFVO50_URL,
      channel: "jma_xml_atom",
      cancelled: false,
    });
  });

  it("reads the level a 解説情報 restates as continuing", () => {
    const obs = parseBulletinXml(fixture("VFVO51_kuchinoerabujima.xml"), VFVO51_URL);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({
      volcano_code: "509",
      kind_code: "11",
      condition: "継続",
      issued_at: "2026-11-09T16:00:00+09:00",
    });
  });

  it("ignores training and test messages", () => {
    const xml = fixture("VFVO50_meakandake.xml").replace(
      "<Status>通常</Status>",
      "<Status>訓練</Status>",
    );
    expect(parseBulletinXml(xml, VFVO50_URL)).toEqual([]);
  });

  it("marks a cancellation and strips the kind it would otherwise carry", () => {
    const xml = fixture("VFVO50_meakandake.xml").replace(
      "<InfoType>発表</InfoType>",
      "<InfoType>取消</InfoType>",
    );
    const obs = parseBulletinXml(xml, VFVO50_URL);
    expect(obs[0].cancelled).toBe(true);
    expect(obs[0].kind_code).toBe("");
  });
});

describe("parseBosaiBulletin", () => {
  it("reads the volcano item and points at JMA's own warning page", () => {
    const obs = parseBosaiBulletin(JSON.parse(fixture("bosai_warning_503.json")), "warning");
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({
      volcano_code: "503",
      kind_name: "レベル２（火口周辺規制）",
      kind_code: "12",
      issued_at: "2026-09-01T16:00:00+09:00",
      bulletin_url: "https://www.jma.go.jp/bosai/volcano/#type=warning&event_id=503",
      channel: "jma_bosai_json",
    });
  });

  it("reads a 解説情報 and points at JMA's own commentary page", () => {
    const obs = parseBosaiBulletin(JSON.parse(fixture("bosai_info_112.json")), "info");
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({
      volcano_code: "112",
      volcano_name_ja: "有珠山",
      issued_at: "2021-03-12T16:15:00+09:00",
      bulletin_url: "https://www.jma.go.jp/bosai/volcano/#type=info&event_id=112",
      channel: "jma_bosai_json",
    });
    expect(obs[0].kind_code).toMatch(/^1[1-5]$/);
  });

  it("returns nothing for a payload without a report time", () => {
    expect(parseBosaiBulletin({}, "warning")).toEqual([]);
    expect(parseBosaiBulletin(null, "info")).toEqual([]);
  });
});

describe("parseVolcanoList", () => {
  it("keeps real volcanoes and drops the 900-series grouping entries", () => {
    expect(volcanoes.map((v) => v.code)).toEqual(["105", "314", "503", "509", "550"]);
    const aso = volcanoes.find((v) => v.code === "503");
    expect(aso?.name_ja).toBe("阿蘇山");
    expect(typeof aso?.lat).toBe("number");
  });
});

describe("levelFromKindCode", () => {
  it("maps 11–15 to levels 1–5 and nothing else", () => {
    expect([11, 12, 13, 14, 15].map((c) => levelFromKindCode(String(c)))).toEqual([1, 2, 3, 4, 5]);
    for (const c of ["21", "22", "36", "45", "", "1"]) {
      expect(levelFromKindCode(c)).toBeNull();
    }
  });
});

describe("resolveVolcanoRecords", () => {
  const atom = [
    ...parseBulletinXml(fixture("VFVO50_meakandake.xml"), VFVO50_URL),
    ...parseBulletinXml(fixture("VFVO51_kuchinoerabujima.xml"), VFVO51_URL),
  ];
  const bosai = [
    ...parseBosaiBulletin(JSON.parse(fixture("bosai_warning_503.json")), "warning"),
    ...parseBosaiBulletin(JSON.parse(fixture("bosai_warning_509.json")), "warning"),
  ];
  const records = resolveVolcanoRecords(volcanoes, [...atom, ...bosai], AS_OF);
  const byCode = new Map(records.map((r) => [r.volcano_code, r]));

  it("writes one record per listed volcano, each stamped with as_of", () => {
    expect(records.map((r) => r.volcano_code)).toEqual(["105", "314", "503", "509", "550"]);
    for (const r of records) expect(r.as_of).toBe(AS_OF);
  });

  it("reports a level from the bosai channel when no recent XML bulletin exists", () => {
    expect(byCode.get("503")).toMatchObject({
      status: "reported",
      alert_level: 2,
      alert_kind: "レベル２（火口周辺規制）",
      channel: "jma_bosai_json",
    });
  });

  it("lets the newer bulletin win across channels", () => {
    // 口永良部島: bosai warning of 2026-09-28 vs XML 解説情報 of 2026-11-09.
    expect(byCode.get("509")).toMatchObject({
      status: "reported",
      alert_level: 1,
      issued_at: "2026-11-09T16:00:00+09:00",
      bulletin_url: VFVO51_URL,
      channel: "jma_xml_atom",
    });
  });

  it("never fills a volcano without a bulletin with Level 1", () => {
    // 富士山 has no bulletin in either channel in these fixtures.
    expect(byCode.get("314")).toMatchObject({
      status: "unknown",
      alert_level: null,
      alert_kind: null,
      issued_at: null,
      bulletin_url: null,
      unknown_reason: "no_bulletin_on_file",
    });
  });

  it("separates a failed lookup from nothing on file", () => {
    const r = resolveVolcanoRecords(volcanoes, [], AS_OF, new Set(["314"]));
    expect(r.find((x) => x.volcano_code === "314")?.unknown_reason).toBe("lookup_failed");
    expect(r.find((x) => x.volcano_code === "550")?.unknown_reason).toBe("no_bulletin_on_file");
    expect(r.every((x) => x.status === "unknown" && x.alert_level === null)).toBe(true);
  });

  it("reports unknown when the newest bulletin is a cancellation", () => {
    const cancel: AlertObservation = {
      ...atom[0],
      issued_at: "2026-11-05T10:00:00+09:00",
      kind_name: "",
      kind_code: "",
      cancelled: true,
    };
    const r = resolveVolcanoRecords(volcanoes, [...atom, cancel], AS_OF);
    expect(r.find((x) => x.volcano_code === "105")).toMatchObject({
      status: "unknown",
      alert_level: null,
      unknown_reason: "latest_bulletin_cancelled",
    });
  });

  it("keeps a kind without a level as a kind, not as a level", () => {
    const nishinoshima: AlertObservation = {
      ...bosai[0],
      volcano_code: "326",
      volcano_name_ja: "西之島",
      kind_name: "火口周辺危険",
      kind_code: "22",
    };
    const r = resolveVolcanoRecords(volcanoes, [nishinoshima], AS_OF);
    expect(r.find((x) => x.volcano_code === "326")).toMatchObject({
      status: "reported",
      name_ja: "西之島",
      alert_level: null,
      alert_kind: "火口周辺危険",
    });
  });
});

describe("readAlert", () => {
  const reported = {
    status: "reported" as const,
    alert_level: 2,
    alert_kind: "レベル２（火口周辺規制）",
    as_of: AS_OF,
  };

  it("passes a fresh record through", () => {
    const now = new Date(Date.parse(AS_OF) + 3600_000);
    expect(readAlert(reported, now)).toEqual({
      status: "reported",
      alert_level: 2,
      alert_kind: "レベル２（火口周辺規制）",
      stale: false,
    });
  });

  it("reads a stale record as unknown, never as its old level", () => {
    const now = new Date(Date.parse(AS_OF) + (STALE_AFTER_HOURS + 1) * 3600_000);
    expect(readAlert(reported, now)).toEqual({
      status: "unknown",
      alert_level: null,
      alert_kind: null,
      stale: true,
    });
  });

  it("reads a record with an unreadable as_of as unknown", () => {
    expect(readAlert({ ...reported, as_of: "" }).status).toBe("unknown");
  });
});
