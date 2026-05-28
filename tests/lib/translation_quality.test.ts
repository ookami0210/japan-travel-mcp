import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Language constants (mirrors src/index.ts) ────────────────────────

const SUPPORTED_LANGUAGES = [
  "en", "ja", "zh", "ko", "fr", "es", "de", "it", "pt",
  "ru", "th", "vi", "id", "ms", "ar", "hi", "tl",
] as const;

type SupportedLang = (typeof SUPPORTED_LANGUAGES)[number];

// ─── Types (mirrors src/index.ts) ─────────────────────────────────────

interface DescriptionRecord {
  qid: string;
  descriptions: Partial<Record<SupportedLang, string>>;
  confidence: "high" | "medium" | "low";
  source: string;
}

interface MultilingualNameRecord {
  qid: string;
  translations: Partial<Record<SupportedLang | "ja", string | null>>;
}

// ─── Placeholder patterns that suggest a failed translation ───────────
// These are artifacts that can silently slip through the Anthropic Batch
// API pipeline when a translation job partially fails or returns malformed JSON.

const PLACEHOLDER_PATTERNS = [
  /^translation pending$/i,
  /^\[translation\]$/i,
  /^\[.*\]$/,
  /^tbd$/i,
  /^n\/a$/i,
  /^todo$/i,
  /^null$/i,
  /^undefined$/i,
];

// ─── Validation helpers ────────────────────────────────────────────────

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERNS.some((p) => p.test(value.trim()));
}

export function validateDescriptionRecord(rec: DescriptionRecord): string[] {
  const errors: string[] = [];

  if (!rec.qid) errors.push("missing qid");

  if (!rec.descriptions || typeof rec.descriptions !== "object") {
    errors.push("missing descriptions object");
    return errors;
  }

  if (!rec.descriptions.en) errors.push("missing English description");
  if (!rec.descriptions.ja) errors.push("missing Japanese description");

  for (const [lang, text] of Object.entries(rec.descriptions)) {
    if (typeof text === "string" && text.trim() === "") {
      errors.push(`empty string for language: ${lang}`);
    }
    if (typeof text === "string" && isPlaceholder(text)) {
      errors.push(`placeholder text for language ${lang}: "${text}"`);
    }
  }

  if (!["high", "medium", "low"].includes(rec.confidence)) {
    errors.push(`invalid confidence value: "${rec.confidence}"`);
  }

  const unknownLangs = Object.keys(rec.descriptions).filter(
    (l) => !(SUPPORTED_LANGUAGES as readonly string[]).includes(l),
  );
  if (unknownLangs.length > 0) {
    errors.push(`unknown language codes: ${unknownLangs.join(", ")}`);
  }

  return errors;
}

export function validateMultilingualRecord(rec: MultilingualNameRecord): string[] {
  const errors: string[] = [];

  if (!rec.qid) errors.push("missing qid");

  if (!rec.translations || typeof rec.translations !== "object") {
    errors.push("missing translations object");
    return errors;
  }

  if (!rec.translations.en && !rec.translations.ja) {
    errors.push("missing both English and Japanese names");
  }

  for (const [lang, text] of Object.entries(rec.translations)) {
    if (typeof text === "string" && text.trim() === "") {
      errors.push(`empty string for language: ${lang}`);
    }
    if (typeof text === "string" && isPlaceholder(text)) {
      errors.push(`placeholder text for language ${lang}: "${text}"`);
    }
  }

  return errors;
}

export function parseJsonLines<T>(
  content: string,
): { records: T[]; malformedCount: number } {
  const records: T[] = [];
  let malformedCount = 0;
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      malformedCount++;
    }
  }
  return { records, malformedCount };
}

// ─── Unit tests: isPlaceholder ─────────────────────────────────────────

describe("isPlaceholder", () => {
  it("flags known placeholder strings", () => {
    expect(isPlaceholder("Translation Pending")).toBe(true);
    expect(isPlaceholder("translation pending")).toBe(true);
    expect(isPlaceholder("[TRANSLATION]")).toBe(true);
    expect(isPlaceholder("[FILL ME]")).toBe(true);
    expect(isPlaceholder("TBD")).toBe(true);
    expect(isPlaceholder("N/A")).toBe(true);
    expect(isPlaceholder("TODO")).toBe(true);
    expect(isPlaceholder("null")).toBe(true);
    expect(isPlaceholder("undefined")).toBe(true);
  });

  it("passes normal translation text", () => {
    expect(isPlaceholder("Mount Fuji")).toBe(false);
    expect(isPlaceholder("富士山")).toBe(false);
    expect(isPlaceholder("A beautiful mountain in Shizuoka Prefecture.")).toBe(false);
    expect(isPlaceholder("후지산")).toBe(false);
  });
});

// ─── Unit tests: validateDescriptionRecord ─────────────────────────────

describe("validateDescriptionRecord", () => {
  const valid: DescriptionRecord = {
    qid: "Q39736",
    descriptions: { en: "A historic temple.", ja: "歴史ある寺院。" },
    confidence: "high",
    source: "wikidata",
  };

  it("passes a valid record", () => {
    expect(validateDescriptionRecord(valid)).toEqual([]);
  });

  it("flags missing qid", () => {
    expect(validateDescriptionRecord({ ...valid, qid: "" })).toContain("missing qid");
  });

  it("flags missing English description", () => {
    const { en: _en, ...withoutEn } = valid.descriptions;
    const errors = validateDescriptionRecord({ ...valid, descriptions: withoutEn });
    expect(errors).toContain("missing English description");
  });

  it("flags missing Japanese description", () => {
    const { ja: _ja, ...withoutJa } = valid.descriptions;
    const errors = validateDescriptionRecord({ ...valid, descriptions: withoutJa });
    expect(errors).toContain("missing Japanese description");
  });

  it("flags empty string translations", () => {
    const errors = validateDescriptionRecord({
      ...valid,
      descriptions: { en: "", ja: "歴史ある寺院。" },
    });
    expect(errors.some((e) => e.includes("empty string") && e.includes("en"))).toBe(true);
  });

  it("flags placeholder text", () => {
    const errors = validateDescriptionRecord({
      ...valid,
      descriptions: { en: "Translation Pending", ja: "歴史ある寺院。" },
    });
    expect(errors.some((e) => e.includes("placeholder") && e.includes("en"))).toBe(true);
  });

  it("flags invalid confidence value", () => {
    const errors = validateDescriptionRecord({
      ...valid,
      confidence: "very_high" as "high",
    });
    expect(errors.some((e) => e.includes("confidence"))).toBe(true);
  });

  it("flags unknown language codes", () => {
    const errors = validateDescriptionRecord({
      ...valid,
      descriptions: { ...valid.descriptions, xx: "Unknown" } as DescriptionRecord["descriptions"],
    });
    expect(errors.some((e) => e.includes("unknown language"))).toBe(true);
  });

  it("reports no errors for a full 17-language record", () => {
    const full: DescriptionRecord = {
      qid: "Q99",
      confidence: "medium",
      source: "wikidata",
      descriptions: {
        en: "en", ja: "ja", zh: "zh", ko: "ko", fr: "fr",
        es: "es", de: "de", it: "it", pt: "pt", ru: "ru",
        th: "th", vi: "vi", id: "id", ms: "ms", ar: "ar",
        hi: "hi", tl: "tl",
      },
    };
    expect(validateDescriptionRecord(full)).toEqual([]);
  });
});

// ─── Unit tests: validateMultilingualRecord ────────────────────────────

describe("validateMultilingualRecord", () => {
  const valid: MultilingualNameRecord = {
    qid: "Q39736",
    translations: { en: "Senso-ji Temple", ja: "浅草寺" },
  };

  it("passes a valid record", () => {
    expect(validateMultilingualRecord(valid)).toEqual([]);
  });

  it("allows null translations (incomplete pipeline run is expected)", () => {
    expect(
      validateMultilingualRecord({
        qid: "Q39736",
        translations: { en: "Senso-ji Temple", ja: "浅草寺", ko: null },
      }),
    ).toEqual([]);
  });

  it("flags empty string translations", () => {
    const errors = validateMultilingualRecord({
      ...valid,
      translations: { en: "", ja: "浅草寺" },
    });
    expect(errors.some((e) => e.includes("empty string") && e.includes("en"))).toBe(true);
  });

  it("flags placeholder text", () => {
    const errors = validateMultilingualRecord({
      ...valid,
      translations: { en: "TBD", ja: "浅草寺" },
    });
    expect(errors.some((e) => e.includes("placeholder") && e.includes("en"))).toBe(true);
  });

  it("flags records missing both en and ja", () => {
    const errors = validateMultilingualRecord({
      qid: "Q39736",
      translations: { fr: "Temple Senso-ji" },
    });
    expect(errors.some((e) => e.includes("English and Japanese"))).toBe(true);
  });

  it("flags missing qid", () => {
    const errors = validateMultilingualRecord({ ...valid, qid: "" });
    expect(errors).toContain("missing qid");
  });
});

// ─── Unit tests: parseJsonLines ────────────────────────────────────────

describe("parseJsonLines", () => {
  it("parses well-formed JSONL", () => {
    const input = `{"qid":"Q1","v":"a"}\n{"qid":"Q2","v":"b"}\n`;
    const { records, malformedCount } = parseJsonLines<{ qid: string; v: string }>(input);
    expect(records).toHaveLength(2);
    expect(malformedCount).toBe(0);
  });

  it("skips blank lines", () => {
    const input = `{"qid":"Q1"}\n\n{"qid":"Q2"}\n`;
    const { records } = parseJsonLines<{ qid: string }>(input);
    expect(records).toHaveLength(2);
  });

  it("counts malformed lines without throwing", () => {
    const input = `{"qid":"Q1"}\n{bad json\n{"qid":"Q3"}\n`;
    const { records, malformedCount } = parseJsonLines<{ qid: string }>(input);
    expect(records).toHaveLength(2);
    expect(malformedCount).toBe(1);
  });

  it("handles an empty string", () => {
    const { records, malformedCount } = parseJsonLines<unknown>("");
    expect(records).toHaveLength(0);
    expect(malformedCount).toBe(0);
  });
});

// ─── Data quality tests (skipped when no local dataset is present) ─────
// These run against the real Hugging Face dataset when it has been
// downloaded (via `resolveDataRoot`). In CI without the dataset they are
// skipped automatically — they're most useful when run locally or in a
// scheduled job that has already fetched the data.

function findDataRoot(): string | null {
  const trigger = "translations/descriptions_complete.jsonl";
  const fromEnv = process.env.JAPAN_TRAVEL_MCP_CACHE;
  if (fromEnv && existsSync(join(fromEnv, trigger))) return fromEnv;
  const defaultCache = join(homedir(), ".japan-travel-mcp", "data");
  if (existsSync(join(defaultCache, trigger))) return defaultCache;
  return null;
}

const DATA_ROOT = findDataRoot();

describe.skipIf(!DATA_ROOT)("translation data quality — real dataset", () => {
  it("descriptions_complete.jsonl: zero malformed lines", async () => {
    const content = await readFile(
      join(DATA_ROOT!, "translations/descriptions_complete.jsonl"),
      "utf8",
    );
    const { malformedCount } = parseJsonLines(content);
    expect(malformedCount).toBe(0);
  });

  it("descriptions_complete.jsonl: all records pass structural validation", async () => {
    const content = await readFile(
      join(DATA_ROOT!, "translations/descriptions_complete.jsonl"),
      "utf8",
    );
    const { records } = parseJsonLines<DescriptionRecord>(content);

    const failures: string[] = [];
    for (const rec of records) {
      const errors = validateDescriptionRecord(rec);
      if (errors.length > 0) {
        failures.push(`${rec.qid ?? "?"}: ${errors.join("; ")}`);
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 10).join("\n");
      expect.fail(
        `${failures.length} record(s) with validation errors (first 10 shown):\n${sample}`,
      );
    }
  });

  it("multilingual_complete.jsonl: zero malformed lines", async () => {
    const content = await readFile(
      join(DATA_ROOT!, "translations/multilingual_complete.jsonl"),
      "utf8",
    );
    const { malformedCount } = parseJsonLines(content);
    expect(malformedCount).toBe(0);
  });

  it("multilingual_complete.jsonl: all records pass structural validation", async () => {
    const content = await readFile(
      join(DATA_ROOT!, "translations/multilingual_complete.jsonl"),
      "utf8",
    );
    const { records } = parseJsonLines<MultilingualNameRecord>(content);

    const failures: string[] = [];
    for (const rec of records) {
      const errors = validateMultilingualRecord(rec);
      if (errors.length > 0) {
        failures.push(`${rec.qid ?? "?"}: ${errors.join("; ")}`);
      }
    }

    if (failures.length > 0) {
      const sample = failures.slice(0, 10).join("\n");
      expect.fail(
        `${failures.length} record(s) with validation errors (first 10 shown):\n${sample}`,
      );
    }
  });

  it("multilingual_complete.jsonl: null translation ratio is below 20%", async () => {
    const content = await readFile(
      join(DATA_ROOT!, "translations/multilingual_complete.jsonl"),
      "utf8",
    );
    const { records } = parseJsonLines<MultilingualNameRecord>(content);

    let total = 0;
    let nulls = 0;
    for (const rec of records) {
      for (const val of Object.values(rec.translations ?? {})) {
        total++;
        if (val === null) nulls++;
      }
    }

    const ratio = total > 0 ? nulls / total : 0;
    expect(ratio, `null translation ratio ${(ratio * 100).toFixed(1)}% exceeds 20%`).toBeLessThan(0.2);
  });
});
