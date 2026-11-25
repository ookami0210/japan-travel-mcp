import { describe, expect, it } from "vitest";

import {
  matchOfficialTexts,
  normalizeTagengoRecord,
  officialTextsByEntity,
  officialTextsFor,
  parseTagengoFile,
  titleNames,
  type MatchableEntity,
  type MlitTagengoRecord,
} from "../../src/lib/official_texts.js";
import {
  commentaryText,
  listingEntryIds,
  listingTotal,
  parseEntryPage,
  prefectureCodes,
} from "../../scrapers/lib/mlit_tagengo.js";
import { selectEntriesToRead } from "../../scrapers/sources/fetch_mlit_tagengo.js";

function rec(over: Partial<MlitTagengoRecord> = {}): MlitTagengoRecord {
  return {
    entry_id: "R6-00001",
    url: "https://www.mlit.go.jp/tagengo-db/R6-00001.html",
    title_ja: "摩周湖",
    prefectures: ["北海道"],
    prefecture_codes: ["01"],
    genres: ["自然"],
    media: ["看板"],
    fiscal_year: 2024,
    council: "テスト協議会",
    address: null,
    texts: { en: { title: "Lake Mashu", body: "A caldera lake." } },
    fetched_at: "2026-11-25T00:00:00.000Z",
    ...over,
  };
}

describe("titleNames", () => {
  it("drops a section suffix and reads names in parentheses", () => {
    expect(titleNames("さぎの湯温泉 - 概要")).toEqual(["さぎの湯温泉"]);
    expect(titleNames("硫黄山（アトサヌプリ）")).toEqual(["硫黄山アトサヌプリ", "硫黄山", "アトサヌプリ"]);
  });

  it("reads the place after the last colon of a series title", () => {
    const names = titleNames("19世紀、欧州の絹産業を救った日本のシルク パンフレット：０２ 田島弥平旧宅");
    expect(names).toContain("田島弥平旧宅");
  });

  it("ignores one-character names and empty titles", () => {
    expect(titleNames("城")).toEqual([]);
    expect(titleNames(null)).toEqual([]);
  });
});

describe("matchOfficialTexts", () => {
  const wd = (key: string, name: string, pc = "01", municipality: string | null = null): MatchableEntity => ({
    key,
    prefecture_code: pc,
    names: [name],
    municipality,
  });

  it("links a title that names exactly one spot in the entry's prefecture", () => {
    const links = matchOfficialTexts([rec()], [wd("wd:Q1", "摩周湖"), wd("wd:Q2", "摩周湖", "13")]);
    expect(links.get("R6-00001")).toBe("wd:Q1");
  });

  it("prefers a Wikidata attraction over a municipal spot of the same name", () => {
    const links = matchOfficialTexts([rec()], [wd("spot:a", "摩周湖"), wd("wd:Q1", "摩周湖")]);
    expect(links.get("R6-00001")).toBe("wd:Q1");
  });

  it("uses the location to choose between same-named spots, else stays unlinked", () => {
    const entities = [wd("wd:Q1", "八幡神社", "01", "旭川市"), wd("wd:Q2", "八幡神社", "01", "函館市")];
    const located = rec({ title_ja: "八幡神社", address: "北海道旭川市神楽1" });
    const unlocated = rec({ entry_id: "R6-00002", title_ja: "八幡神社" });
    const links = matchOfficialTexts([located, unlocated], entities);
    expect(links.get("R6-00001")).toBe("wd:Q1");
    expect(links.has("R6-00002")).toBe(false);
  });

  it("falls back to the English title and leaves theme texts unlinked", () => {
    const en = rec({ title_ja: "神の湖", texts: { en: { title: "Lake Mashu", body: "x" } } });
    const theme = rec({ entry_id: "R6-00003", title_ja: "20世紀の旭川", texts: { en: { title: "Asahikawa in the Twentieth Century", body: "x" } } });
    const links = matchOfficialTexts([en, theme], [{ key: "wd:Q1", prefecture_code: "01", names: ["摩周湖", "Lake Mashu"] }]);
    expect(links.get("R6-00001")).toBe("wd:Q1");
    expect(links.has("R6-00003")).toBe(false);
  });

  it("groups linked texts by entity, newest first, each with its credit", () => {
    const older = rec({ entry_id: "H30-00005", fiscal_year: 2018, url: "https://www.mlit.go.jp/tagengo-db/H30-00005.html" });
    const links = new Map([["R6-00001", "wd:Q1"], ["H30-00005", "wd:Q1"]]);
    const by = officialTextsByEntity([older, rec()], links);
    const list = by.get("wd:Q1")!;
    expect(list.map((t) => t.entry_id)).toEqual(["R6-00001", "H30-00005"]);
    expect(list[0].credit).toBe(
      "出典：地域観光資源の多言語解説文データベース https://www.mlit.go.jp/tagengo-db/R6-00001.html / This English-language text was created by the Japan Tourism Agency.",
    );
  });
});

describe("officialTextsFor", () => {
  it("keeps a text only for an entity in a prefecture the text covers", () => {
    // One source id can name two places in different prefectures.
    const by = officialTextsByEntity([rec({ prefecture_codes: ["23"] })], new Map([["R6-00001", "wd:BUNKA-1"]]));
    expect(officialTextsFor(by, "wd:BUNKA-1", "23")).toHaveLength(1);
    expect(officialTextsFor(by, "wd:BUNKA-1", "21")).toBeNull();
    expect(officialTextsFor(by, "wd:BUNKA-1", null)).toBeNull();
  });
});

describe("titleNames markers", () => {
  it("drops numbering, bracket labels and an overview suffix", () => {
    expect(titleNames("No.19 ユートピア・ゲレンデ")).toContain("ユートピアゲレンデ");
    expect(titleNames("紅葉台全体概要")).toContain("紅葉台");
    expect(titleNames("タイトル：弁天岳")).toContain("弁天岳");
  });
});

describe("tagengo file validation", () => {
  it("drops records without an entry id, a source URL or any text", () => {
    expect(normalizeTagengoRecord(rec())).not.toBeNull();
    expect(normalizeTagengoRecord({ ...rec(), entry_id: "X-1" })).toBeNull();
    expect(normalizeTagengoRecord({ ...rec(), url: "https://evil.example/x" })).toBeNull();
    expect(normalizeTagengoRecord({ ...rec(), texts: { ko: { title: null, body: "x" } } })).toBeNull();
    expect(parseTagengoFile({ records: [rec(), null, { entry_id: "R6-00009" }] })).toHaveLength(1);
    expect(parseTagengoFile(null)).toEqual([]);
  });
});

const ENTRY_HTML = `<html><body><main class="main"><div class="search__detail">
<h2 class="title"><span class="sub">タイトル</span><strong>テスト灯台</strong></h2>
<ul class="list__region"><li>鳥取県</li><li>島根県</li></ul>
<dl class="list__division">
<div class="group"><dt>ジャンル：</dt><dd class="genre"><span>建造物・施設</span></dd></div>
<div class="group"><dt>媒体利用区分：</dt><dd class="media"><span>看板</span><span>Webページ</span></dd></div>
</dl>
<dl class="list__information">
<div class="group"><dt>作成年度：</dt><dd>2024年</dd></div>
<div class="group"><dt>地域協議会名：</dt><dd>テスト観光協議会</dd></div>
<div class="group"><dt>位置情報：</dt><dd><a href="#">鳥取県鳥取市テスト町1</a></dd></div>
</dl>
<div class="text"><!-- commentary_en -->
<p><b>Test Lighthouse</b></p><br><p>The lighthouse first lit in 1900.</p><br><p>It still guides ships &amp; boats.</p>
<!-- /commentary_en --></div>
<div class="text"><!-- commentary_zhcn -->
<p><b>测试灯塔</b></p><br><p>灯塔于1900年首次点亮。</p>
<!-- /commentary_zhcn --></div>
<div class="text"><!-- commentary_ja -->
<p>テスト灯台</p><br><p>灯台は1900年に初点灯しました。</p>
<!-- /commentary_ja --></div>
</div></main></body></html>`;

describe("mlit_tagengo page parsing", () => {
  it("reads an entry page into a record", () => {
    const r = parseEntryPage(ENTRY_HTML, "R6-90001", "2026-11-25T00:00:00.000Z")!;
    expect(r.title_ja).toBe("テスト灯台");
    expect(r.prefecture_codes).toEqual(["31", "32"]);
    expect(r.genres).toEqual(["建造物・施設"]);
    expect(r.media).toEqual(["看板", "Webページ"]);
    expect(r.fiscal_year).toBe(2024);
    expect(r.council).toBe("テスト観光協議会");
    expect(r.address).toBe("鳥取県鳥取市テスト町1");
    expect(r.texts.en).toEqual({ title: "Test Lighthouse", body: "The lighthouse first lit in 1900.\n\nIt still guides ships & boats." });
    expect(r.texts["zh-Hans"]?.title).toBe("测试灯塔");
    // An older page sets the title as a plain short line.
    expect(r.texts.ja).toEqual({ title: "テスト灯台", body: "灯台は1900年に初点灯しました。" });
    expect(r.url).toBe("https://www.mlit.go.jp/tagengo-db/R6-90001.html");
  });

  it("returns null for a page with no text, and keeps a one-paragraph text whole", () => {
    expect(parseEntryPage("<html><body>no text</body></html>", "R6-90002", "now")).toBeNull();
    expect(commentaryText("<p>One sentence only.</p>")).toEqual({ title: null, body: "One sentence only." });
  });

  it("reads the listing's entry ids and total", () => {
    const html = `<body><p>ジャンル 9369 件 1～100件を表示</p>
<article class="result__article"><h2 class="title__result"><a href="/tagengo-db/R2-00787.html">A</a></h2></article>
<article class="result__article"><h2 class="title__result"><a href="/tagengo-db/H30-00957.html">B</a></h2></article></body>`;
    expect(listingTotal(html)).toBe(9369);
    expect(listingEntryIds(html)).toEqual(["R2-00787", "H30-00957"]);
    expect(prefectureCodes(["北海道", "東京都", "不明"])).toEqual(["01", "13"]);
  });
});

describe("selectEntriesToRead", () => {
  it("reads new entries first, then the stalest past the re-read age", () => {
    const now = Date.parse("2026-11-25T00:00:00Z");
    const day = 86_400_000;
    const previous = new Map([
      ["R1-00001", rec({ entry_id: "R1-00001", fetched_at: new Date(now - 400 * day).toISOString() })],
      ["R1-00002", rec({ entry_id: "R1-00002", fetched_at: new Date(now - 10 * day).toISOString() })],
      ["R1-00003", rec({ entry_id: "R1-00003", fetched_at: new Date(now - 200 * day).toISOString() })],
    ]);
    expect(selectEntriesToRead(["R1-00002", "R6-00001", "R1-00003", "R1-00001"], previous, now, 180 * day)).toEqual([
      "R6-00001",
      "R1-00001",
      "R1-00003",
    ]);
  });
});
