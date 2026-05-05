/**
 * R-3 (官制 / official-program) record helpers.
 *
 * Pick the best-available name / description for a given language from a
 * pre-translated record, with a graceful fallback to the original
 * Japanese. Used by `get_japan_heritage`, `get_traditional_arts`,
 * `get_local_specialty`, and `get_dmo`.
 *
 * Pure functions only — no I/O.
 */

/**
 * Narrow input contract for the helpers below. Structurally compatible
 * with the `R3TranslationRecord` type in src/index.ts (and with
 * `SupportedLang` indexed by the `lang` argument). Using a generic string
 * indexer lets the same helpers serve any future supported-language list
 * without touching this file.
 */
export interface R3Translation {
  key: string;
  name?: Partial<Record<string, string>>;
  description?: Partial<Record<string, string>>;
  confidence?: "high" | "medium" | "low";
  source?: string;
  generated_at?: string;
}

/**
 * Provenance of an R-3 record's description. `official_translated` is
 * surfaced when the `lang`-keyed description came from the translation
 * record; `official_only` means the record was returned in Japanese
 * (either because no translation exists for that language or because the
 * caller didn't specify a `lang`).
 */
export interface R3TranslationMeta {
  source: "official_translated" | "official_only";
  generated_at: string | null;
  confidence: "high" | "medium" | "low" | null;
}

/**
 * Return the best-available name in `lang` for an R-3 record. Falls back
 * to `fallback` (typically the original Japanese name) when no
 * translation exists.
 */
export function pickR3Name(
  fallback: string | null,
  rec: R3Translation | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.name?.[lang]) return rec.name[lang]!;
  return fallback;
}

/**
 * Return the best-available description in `lang` for an R-3 record. The
 * fallback is the original Japanese — every R-3 record has at minimum a
 * `description_ja`, so callers always get *something* back.
 */
export function pickR3Description(
  fallbackJa: string | null,
  rec: R3Translation | undefined,
  lang: string | undefined,
): string | null {
  if (lang && rec?.description?.[lang]) return rec.description[lang]!;
  return fallbackJa;
}

/**
 * Build the `translation_meta` block for an R-3 response. Says whether
 * the description we returned came from an official translation or fell
 * back to the original Japanese, and surfaces the translator's
 * confidence + timestamp when applicable.
 */
export function r3Translation(
  rec: R3Translation | undefined,
  lang: string | undefined,
): R3TranslationMeta {
  if (lang && rec?.description?.[lang]) {
    return {
      source: "official_translated",
      generated_at: rec.generated_at ?? null,
      confidence: rec.confidence ?? null,
    };
  }
  return { source: "official_only", generated_at: null, confidence: null };
}
