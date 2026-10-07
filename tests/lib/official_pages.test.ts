/**
 * Official-page layer (src/lib/official_pages.ts).
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadOfficialPages,
  officialPageMeta,
  PAGE_TEXT_LIMIT,
  resetOfficialPagesCache,
  TextBudget,
  type OfficialPageRecord,
} from "../../src/lib/official_pages.js";

function page(over: Partial<OfficialPageRecord["pages"][number]> = {}) {
  return {
    url: "https://midori-camp.jp/price.html",
    final_url: "https://midori-camp.jp/price.html",
    title: "ご利用料金",
    http_status: 200,
    content_sha256: "a".repeat(64),
    chars: 18,
    charset: "utf-8",
    text: "ご利用料金 1区画 4,000円",
    fetched_at: "2026-10-08T00:00:00Z",
    ...over,
  };
}

function record(over: Partial<OfficialPageRecord> = {}): OfficialPageRecord {
  return {
    id: "abc123",
    name: "みどりのキャンプ場",
    prefecture_code: "20",
    homepage: "https://midori-camp.jp/",
    pages: [page()],
    pages_attempted: 2,
    pages_failed: 0,
    crawled_at: "2026-10-08T00:00:00Z",
    pages_fetched_at: "2026-10-08T00:00:00Z",
    ...over,
  };
}

async function corpusFile(lines: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "jtmcp-official-"));
  const path = join(dir, "official_pages.jsonl");
  await writeFile(path, lines.join("\n"), "utf8");
  return path;
}

beforeEach(() => {
  resetOfficialPagesCache();
});

describe("loadOfficialPages", () => {
  it("indexes the corpus by accommodation id", async () => {
    const path = await corpusFile([JSON.stringify(record()), JSON.stringify(record({ id: "def456" }))]);
    const index = await loadOfficialPages(path);
    expect([...index.keys()].sort()).toEqual(["abc123", "def456"]);
  });

  it("is an empty layer, not an error, when the file is absent", async () => {
    const index = await loadOfficialPages(join(tmpdir(), "jtmcp-nothing-here.jsonl"));
    expect(index.size).toBe(0);
  });

  it("keeps the layer when one line is malformed", async () => {
    const path = await corpusFile([
      JSON.stringify(record()),
      "{ this is not json",
      JSON.stringify(record({ id: "def456" })),
    ]);
    const index = await loadOfficialPages(path);
    expect(index.size).toBe(2);
  });

  it("skips a line that names no accommodation", async () => {
    const path = await corpusFile([JSON.stringify({ ...record(), id: "" })]);
    expect((await loadOfficialPages(path)).size).toBe(0);
  });
});

describe("officialPageMeta", () => {
  it("carries the page list, the dates and the hashes, and no text", () => {
    const meta = officialPageMeta(record());
    expect(meta.page_count).toBe(1);
    expect(meta.pages[0]).toEqual({
      url: "https://midori-camp.jp/price.html",
      title: "ご利用料金",
      chars: 18,
      content_sha256: "a".repeat(64),
    });
    expect(JSON.stringify(meta)).not.toContain("4,000円");
  });

  it("dates the text separately from the visit", () => {
    const meta = officialPageMeta(
      record({ crawled_at: "2026-10-08T00:00:00Z", pages_fetched_at: "2026-09-08T00:00:00Z" }),
    );
    expect(meta.crawled_at).toBe("2026-10-08T00:00:00Z");
    expect(meta.pages_fetched_at).toBe("2026-09-08T00:00:00Z");
  });

  it("passes on the reason the last visit produced nothing", () => {
    expect(officialPageMeta(record({ note: "homepage_unreadable" })).note).toBe(
      "homepage_unreadable",
    );
  });

  it("says whose text this is and as of when", () => {
    expect(officialPageMeta(record()).source_note).toMatch(/Rights remain with the operator/);
  });
});

describe("TextBudget", () => {
  it("attaches the text when there is room", () => {
    const got = new TextBudget().attach(record());
    expect(got.pages[0].text).toBe("ご利用料金 1区画 4,000円");
    expect(got.pages[0].text_truncated).toBeUndefined();
  });

  it("truncates a page that exceeds the per-page limit, and says so", () => {
    const long = "料".repeat(PAGE_TEXT_LIMIT + 500);
    const got = new TextBudget().attach(record({ pages: [page({ text: long })] }));
    expect(got.pages[0].text?.length).toBe(PAGE_TEXT_LIMIT);
    expect(got.pages[0].text_truncated).toBe(true);
  });

  it("reports what the response budget could not cover rather than dropping it", () => {
    const budget = new TextBudget(10);
    const got = budget.attach(record({ pages: [page({ text: "0123456789abcdef" }), page()] }));
    expect(got.pages[0].text).toBe("0123456789");
    expect(got.pages[1].text).toBeUndefined();
    expect(got.pages[1].text_omitted).toMatch(/budget/);
  });

  it("spends one budget across several accommodations", () => {
    const budget = new TextBudget(20);
    const first = budget.attach(record({ pages: [page({ text: "x".repeat(20) })] }));
    const second = budget.attach(record({ id: "def456" }));
    expect(first.pages[0].text?.length).toBe(20);
    expect(second.pages[0].text_omitted).toMatch(/budget/);
  });

  it("still reports the page list when the text is omitted", () => {
    const got = new TextBudget(0).attach(record());
    expect(got.page_count).toBe(1);
    expect(got.pages[0].url).toBe("https://midori-camp.jp/price.html");
  });
});
