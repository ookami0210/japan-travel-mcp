/**
 * Shared fixture builder for the MCP server integration suites.
 *
 * The server reads its dataset from JAPAN_TRAVEL_MCP_CACHE (when set) or
 * ~/.japan-travel-mcp/data; if neither has every RUNTIME_FILES entry on
 * disk, ensureDataFromHf() will try to download from Hugging Face. To keep
 * the test offline we materialise minimal-but-valid stand-ins for every
 * runtime file into a tmpdir and point JAPAN_TRAVEL_MCP_CACHE at it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { RUNTIME_FILES } from "../../src/lib/hf_data.js";

/**
 * Documented MCP tool registry. Shared between the stdio and HTTP smoke
 * suites so both transports assert the exact same contract — adding /
 * removing / renaming a tool fails both at once and forces the author to
 * update this single list.
 */
export const EXPECTED_TOOLS = [
  "get_description",
  "get_dmo",
  "get_entities_bulk",
  "get_entity_full",
  "get_events",
  "get_festivals",
  "get_hotels",
  "get_japan_heritage",
  "get_local_food",
  "get_local_specialty",
  "get_multilingual",
  "get_spots",
  "get_traditional_arts",
  "get_transport",
  "plan_feasibility_check",
  "search_area",
  "search_hybrid",
  "search_semantic",
] as const;

export type PrefectureFixture = {
  code: string;
  nameJa: string;
  nameEn: string;
  attractions?: Array<Record<string, unknown>>;
};

const SLUG_TO_FIXTURE: Record<string, PrefectureFixture> = {
  tottori: {
    code: "31",
    nameJa: "鳥取県",
    nameEn: "Tottori",
    attractions: [
      {
        qid: "Q-TEST-TOTTORI-1",
        wikidata_url: "https://www.wikidata.org/wiki/Q-TEST-TOTTORI-1",
        name_ja: "鳥取砂丘",
        name_en: "Tottori Sand Dunes",
        name_zh: null,
        name_ko: null,
        description_en: "Test fixture sand dunes.",
        coordinates: { lat: 35.5, lng: 134.2 },
        prefecture_code: "31",
        admin_code: null,
        admin_name: null,
        types: ["Q207326"],
      },
    ],
  },
  kochi: {
    code: "39",
    nameJa: "高知県",
    nameEn: "Kochi",
    attractions: [],
  },
};

function defaultFixtureForSlug(slug: string): PrefectureFixture {
  return (
    SLUG_TO_FIXTURE[slug] ?? {
      code: "00",
      nameJa: slug,
      nameEn: slug,
      attractions: [],
    }
  );
}

export function pickFixtureContent(rel: string): string {
  if (rel.startsWith("prefectures/")) {
    const fx = defaultFixtureForSlug(basename(rel, ".json"));
    return JSON.stringify({
      prefecture: { code: fx.code, name: fx.nameJa, name_en: fx.nameEn },
      data_as_of: "2026-01-01",
      source: "test-fixture",
      municipalities: [],
      wikidata_attractions: fx.attractions ?? [],
    });
  }
  if (rel === "hotels/master.json") {
    return JSON.stringify({ generated_at: "2026-01-01", hotels: [] });
  }
  if (rel === "_state/wikidata_attractions.json") {
    return JSON.stringify({ attractions: [] });
  }
  if (rel === "translations/descriptions_complete.jsonl") {
    return `${JSON.stringify({
      qid: "Q-TEST-DESC-1",
      name_ja: "テスト名所",
      descriptions: { en: "Test description.", ja: "テスト説明。" },
    })}\n`;
  }
  if (rel === "translations/multilingual_complete.jsonl") {
    return `${JSON.stringify({
      qid: "Q-TEST-ML-1",
      names: { ja: "テスト", en: "Test", zh: "测试", ko: "테스트" },
    })}\n`;
  }
  if (rel === "r3/translations/r3_translations.jsonl") {
    return `${JSON.stringify({ id: "fixture", lang: "en", text: "test" })}\n`;
  }
  if (rel.startsWith("r3/")) {
    return JSON.stringify({
      source: { name: "test", authority: "test", url: "", license: "" },
      fetched_at: "2026-01-01",
      total: 0,
      records: [],
    });
  }
  if (rel.startsWith("_state/")) return JSON.stringify({});
  if (rel.startsWith("glossary/")) return JSON.stringify([]);
  return "{}";
}

export async function materialiseFixtures(cacheDir: string): Promise<void> {
  for (const rel of RUNTIME_FILES) {
    const full = join(cacheDir, rel);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, pickFixtureContent(rel), "utf8");
  }
}
