import { describe, expect, it } from "vitest";

import {
  mergeOfficialTextPlaces,
  normalizeOfficialTextPlace,
  parseOfficialTextPlaces,
  type OfficialTextPlace,
} from "../../src/lib/official_text_places.js";
import type { MlitTagengoRecord } from "../../src/lib/official_texts.js";
import {
  choosePlace,
  hitsFromBindings,
  labelQuery,
  nearestMunicipality,
  placeQueries,
  type Centroid,
} from "../../scrapers/sources/match_tagengo_places.js";

const CENTROIDS: Centroid[] = [
  { code: "016306", name: "弟子屈町", lat: 43.485, lng: 144.459 },
  { code: "012025", name: "函館市", lat: 41.769, lng: 140.729 },
  { code: "232025", name: "岡崎市", lat: 34.954, lng: 137.174 },
  { code: "232017", name: "豊橋市", lat: 34.769, lng: 137.391 },
];

function place(over: Partial<OfficialTextPlace> = {}): OfficialTextPlace {
  return {
    qid: "Q1194619",
    wikidata_url: "https://www.wikidata.org/wiki/Q1194619",
    name_ja: "摩周湖",
    name_en: "Lake Mashū",
    name_zh: null,
    name_ko: null,
    description_en: "crater lake in Japan",
    coordinates: { lat: 43.583, lng: 144.517 },
    prefecture_code: "01",
    admin_code: "016306",
    admin_name: "弟子屈町",
    types: ["Q204324"],
    aliases: [],
    source_anchor: "official_text",
    official_entry_ids: ["R1-00002"],
    ...over,
  };
}

function entry(over: Partial<MlitTagengoRecord> = {}): MlitTagengoRecord {
  return {
    entry_id: "R1-00002",
    url: "https://www.mlit.go.jp/tagengo-db/R1-00002.html",
    title_ja: "摩周湖",
    prefectures: ["北海道"],
    prefecture_codes: ["01"],
    genres: ["自然"],
    media: [],
    fiscal_year: 2019,
    council: null,
    address: null,
    texts: { en: { title: "Lake Mashu", body: "x" } },
    fetched_at: "",
    ...over,
  };
}

describe("nearestMunicipality", () => {
  it("returns the nearest centroid, or null beyond 30 km", () => {
    expect(nearestMunicipality(43.58, 144.52, CENTROIDS)?.name).toBe("弟子屈町");
    expect(nearestMunicipality(26.2, 127.7, CENTROIDS)).toBeNull();
  });
});

describe("choosePlace", () => {
  it("keeps the only item in the entry's prefecture", () => {
    const hits = [
      { qid: "Q1194619", lat: 43.583, lng: 144.517 },
      { qid: "Q999", lat: 34.95, lng: 137.17 }, // same label, Aichi
    ];
    // The name is shared, so the town must appear in the location.
    expect(choosePlace(hits, entry({ address: "北海道川上郡弟子屈町" }), CENTROIDS)?.hit.qid).toBe("Q1194619");
    expect(choosePlace(hits, entry({ address: null }), CENTROIDS)).toBeNull();
    // A name only one item holds needs no location.
    expect(choosePlace([hits[0]], entry(), CENTROIDS)?.hit.qid).toBe("Q1194619");
  });

  it("accepts the item's own P131 label as the town", () => {
    const hits = [
      { qid: "Q1", lat: 34.95, lng: 137.17, admins: ["額田町"] },
      { qid: "Q2", lat: 41.77, lng: 140.73 },
    ];
    const e = entry({ prefecture_codes: ["23"], address: "愛知県額田郡額田町" });
    expect(choosePlace(hits, e, CENTROIDS)?.hit.qid).toBe("Q1");
  });

  it("refuses when two items share the name in the entry's prefecture", () => {
    const hits = [
      { qid: "Q1", lat: 34.95, lng: 137.17 },
      { qid: "Q2", lat: 34.77, lng: 137.39 },
    ];
    expect(choosePlace(hits, entry({ prefecture_codes: ["23"], address: "愛知県岡崎市" }), CENTROIDS)).toBeNull();
  });

  it("ignores rows that repeat one item", () => {
    const hits = [
      { qid: "Q1194619", lat: 43.583, lng: 144.517, admins: ["弟子屈町"] },
      { qid: "Q1194619", lat: 43.583, lng: 144.517, admins: [] },
    ];
    expect(choosePlace(hits, entry(), CENTROIDS)?.hit.qid).toBe("Q1194619");
  });
});

describe("placeQueries", () => {
  it("asks for the title's place forms, but not for event or food entries", () => {
    expect(placeQueries(entry({ title_ja: "硫黄山（アトサヌプリ）" }))).toEqual(["硫黄山(アトサヌプリ)", "硫黄山", "アトサヌプリ"]);
    expect(placeQueries(entry({ genres: ["年中行事"] }))).toEqual([]);
    expect(placeQueries(entry({ genres: ["年中行事", "自然"] }))).toEqual(["摩周湖"]);
  });
});

describe("label query", () => {
  it("excludes administrative units and reads points and P131 labels", () => {
    const q = labelQuery(["摩周湖", 'a"b']);
    expect(q).toContain('"摩周湖"@ja "ab"@ja');
    expect(q).toContain("FILTER NOT EXISTS { ?item wdt:P429 [] }");
    const hits = hitsFromBindings([
      {
        item: { value: "http://www.wikidata.org/entity/Q1194619" },
        name: { value: "摩周湖" },
        coord: { value: "Point(144.517 43.583)" },
        admName: { value: "弟子屈町" },
      },
      { item: { value: "http://www.wikidata.org/entity/L1" }, name: { value: "x" }, coord: { value: "Point(1 2)" } },
    ]);
    expect(hits.get("摩周湖")).toEqual([{ qid: "Q1194619", lat: 43.583, lng: 144.517, admins: ["弟子屈町"] }]);
    expect(hits.has("x")).toBe(false);
  });
});

describe("official text places file", () => {
  it("drops records without a QID, prefecture, coordinates or name", () => {
    expect(normalizeOfficialTextPlace(place())).not.toBeNull();
    expect(normalizeOfficialTextPlace({ ...place(), qid: "BUNKA-1" })).toBeNull();
    expect(normalizeOfficialTextPlace({ ...place(), coordinates: null })).toBeNull();
    expect(normalizeOfficialTextPlace({ ...place(), name_ja: null, name_en: null })).toBeNull();
    expect(parseOfficialTextPlaces({ records: [place(), null] })).toHaveLength(1);
  });

  it("adds a missing place, and gives a held one the text's name as an alias", () => {
    const prefs: Array<{ prefecture: { code: string }; wikidata_attractions?: Array<{ qid: string; aliases?: string[] | null }> }> = [
      { prefecture: { code: "01" }, wikidata_attractions: [{ qid: "Q2", aliases: null }] },
    ];
    const added = mergeOfficialTextPlaces(prefs, [place(), place({ qid: "Q2", aliases: ["阿寒湖畔"] }), place({ qid: "Q3", prefecture_code: "99" })], (p) => ({
      qid: p.qid,
      aliases: p.aliases,
    }));
    expect(added).toBe(1);
    expect(prefs[0].wikidata_attractions!.map((a) => a.qid)).toEqual(["Q2", "Q1194619"]);
    expect(prefs[0].wikidata_attractions![0].aliases).toEqual(["阿寒湖畔"]);
  });
});
