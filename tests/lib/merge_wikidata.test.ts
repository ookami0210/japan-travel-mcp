import { describe, it, expect } from "vitest";
import { mergePrefecture, type WikidataAttraction } from "../../scrapers/merge_wikidata.js";

const row = (qid: string, source_anchor?: string): WikidataAttraction => ({
  qid,
  prefecture_code: "13",
  ...(source_anchor ? { source_anchor } : {}),
});

describe("mergePrefecture", () => {
  it("brings in the master's rows the file lacks", () => {
    const m = mergePrefecture([row("Q1")], [row("Q1", "v2"), row("Q615183", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q615183"]);
    expect(m.refused).toBe(false);
  });

  it("keeps the rows an inject script added, which the master never holds", () => {
    const current = [row("Q1"), row("Q900", "bunka_kunishitei"), row("Q901", "landmark_by_name")];
    const m = mergePrefecture(current, [row("Q1", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q900", "Q901"]);
    expect(m.keptInjected).toBe(2);
  });

  it("drops a Wikidata row the refreshed master no longer holds", () => {
    const m = mergePrefecture([row("Q1"), row("Q2"), row("Q3")], [row("Q1", "v2"), row("Q3", "v2")]);
    expect(m.rows.map((r) => r.qid)).toEqual(["Q1", "Q3"]);
    expect(m.dropped).toBe(1);
  });

  it("takes the master's copy of a row both hold", () => {
    const m = mergePrefecture([{ ...row("Q1"), name_en: "old" }], [{ ...row("Q1", "v2"), name_en: "new" }]);
    expect(m.rows).toEqual([{ ...row("Q1", "v2"), name_en: "new" }]);
  });

  it("leaves the file as it is when the master lost most of the prefecture", () => {
    const current = Array.from({ length: 10 }, (_, i) => row(`Q${i}`));
    const m = mergePrefecture(current, [row("Q0", "v2"), row("Q1", "v2")]);
    expect(m.refused).toBe(true);
    expect(m.rows).toEqual(current);
  });
});
