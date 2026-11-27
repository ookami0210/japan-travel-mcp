import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isInjected, mergePrefecture, type WikidataAttraction } from "../../scrapers/merge_wikidata.js";

const row = (qid: string, source_anchor?: string, extra: Record<string, unknown> = {}): WikidataAttraction => ({
  qid,
  prefecture_code: "13",
  ...(source_anchor ? { source_anchor } : {}),
  ...extra,
});

describe("mergePrefecture", () => {
  it("brings in the master's rows the file lacks", () => {
    const m = mergePrefecture([row("Q1")], [row("Q1", "v2"), row("Q615183", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q615183"]);
    expect(m.refused).toBe(false);
    expect(m.changed).toBe(true);
  });

  it("keeps the rows an inject script added, which the master never holds", () => {
    const current = [
      row("Q1"),
      row("Q900", "bunka_kunishitei"),
      row("Q901", "manual_canonical_injection"),
      row("Q902", "wikipedia_list:List of Important Cultural Properties"),
    ];
    const m = mergePrefecture(current, [row("Q1", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q900", "Q901", "Q902"]);
    expect(m.keptInjected).toBe(3);
  });

  it("drops a Wikidata row the refreshed master no longer holds", () => {
    const m = mergePrefecture([row("Q1"), row("Q2"), row("Q3")], [row("Q1", "v2"), row("Q3", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q3"]);
    expect(m.dropped).toBe(1);
  });

  it("keeps the fields only the file has, with the master's values over the rest", () => {
    const current = [row("Q1", undefined, { name_en: "old", osm_ids: ["way/1"], opening_hours: "9-17", description_en: "kept" })];
    const m = mergePrefecture(current, [row("Q1", "v2", { name_en: "new", description_en: null })]);
    expect(m.rows).toEqual([
      row("Q1", "v2", { name_en: "new", osm_ids: ["way/1"], opening_hours: "9-17", description_en: "kept" }),
    ]);
  });

  it("reports no change when the master adds nothing, so the file is not rewritten", () => {
    const current = [row("Q1", "v2", { name_en: "a", osm_ids: ["way/1"] }), row("Q900", "bunka_kunishitei")];
    const m = mergePrefecture(current, [row("Q1", "v2", { name_en: "a" })]);
    expect(m.changed).toBe(false);
  });

  it("leaves the file as it is when the master lost most of the prefecture", () => {
    const current = Array.from({ length: 10 }, (_, i) => row(`Q${i}`));
    const m = mergePrefecture(current, [row("Q0", "v2"), row("Q1", "v2")]);
    expect(m.refused).toBe(true);
    expect(m.changed).toBe(false);
    expect(m.rows).toEqual(current);
  });

  it("does not let injected rows hide a collapse of the Wikidata rows", () => {
    const current = [
      ...Array.from({ length: 10 }, (_, i) => row(`Q${i}`)),
      ...Array.from({ length: 20 }, (_, i) => row(`Q9${i}`, "bunka_kunishitei")),
    ];
    expect(mergePrefecture(current, [row("Q0", "v2"), row("Q1", "v2")]).refused).toBe(true);
  });

  it("lets an intended shrink through when allowed", () => {
    const current = Array.from({ length: 10 }, (_, i) => row(`Q${i}`));
    const m = mergePrefecture(current, [row("Q0", "v2")], { allowShrink: true });
    expect(m.refused).toBe(false);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q0"]);
  });
});

describe("isInjected", () => {
  it("covers every source_anchor an inject script writes", () => {
    const dir = fileURLToPath(new URL("../../scripts/", import.meta.url));
    const anchors = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => /^inject_.*\.py$/.test(n))) {
      const src = readFileSync(`${dir}${f}`, "utf8");
      for (const m of src.matchAll(/"source_anchor":\s*f?"([^"{]+)/g)) anchors.add(m[1]);
    }
    expect([...anchors].sort()).toEqual([
      "bunka_kunishitei",
      "landmark_by_name",
      "manual_canonical_injection",
      "wikidata_national_park",
      "wikidata_shukubo",
      "wikipedia_category",
      "wikipedia_list:",
    ]);
    for (const a of anchors) expect(isInjected(a), a).toBe(true);
  });

  it("does not take a Wikidata fetch anchor for an injected one", () => {
    for (const a of ["v2", "p1435", "p1435+v2", "direct_p31+v2", "both+v2", null, undefined]) {
      expect(isInjected(a)).toBe(false);
    }
  });
});
