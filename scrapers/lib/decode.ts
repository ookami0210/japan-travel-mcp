/**
 * Character-set aware decoding for fetched HTML.
 *
 * WHY: `Response.text()` always decodes as UTF-8, by specification. Most of
 * the Japanese web is UTF-8 and that is fine, but the small-operator tail is
 * not: campground, minshuku and village-office pages built a decade ago and
 * never migrated still serve Shift_JIS or EUC-JP. Decoding those bytes as
 * UTF-8 does not fail loudly, it yields replacement characters — so the page
 * text looks present, carries no Japanese at all, and every reader downstream
 * draws a wrong conclusion from it: a site-status pass decides the page never
 * mentions the place, an extractor stores a mojibake title, a consumer formats
 * answers from nothing.
 *
 * So the charset the page declares is honoured, and the result is checked:
 * declared labels lie often enough (a Shift_JIS page declaring UTF-8 is a
 * classic of this population) that a decode which comes out as mojibake is
 * rejected in favour of one that reads as Japanese.
 *
 * The scoring is deliberately simple and observable: count the characters a
 * Japanese page must have, subtract the signatures of a decode gone wrong.
 */

/** Encoding labels seen in the wild, mapped to labels TextDecoder accepts. */
const LABEL_ALIASES: Record<string, string> = {
  "shift-jis": "shift_jis",
  shiftjis: "shift_jis",
  sjis: "shift_jis",
  "x-sjis": "shift_jis",
  "windows-31j": "shift_jis",
  ms932: "shift_jis",
  cp932: "shift_jis",
  euc_jp: "euc-jp",
  eucjp: "euc-jp",
  "x-euc-jp": "euc-jp",
  "iso-2022-jp": "iso-2022-jp",
  utf8: "utf-8",
};

/** Tried in this order when the declared label is absent or unusable. */
const FALLBACK_CANDIDATES = ["utf-8", "shift_jis", "euc-jp", "iso-2022-jp"];

/**
 * Kanji that appear when UTF-8 bytes are read as Shift_JIS or EUC-JP. They are
 * real characters, so no decoder errors — they are just never what a Japanese
 * page is actually made of, and they cluster densely when a decode is wrong.
 */
const MOJIBAKE_MARKERS = /[縺繧繝蜷荳譁蛛郢晏嶺遐遯]/g;

/** Latin-1 artefacts of the opposite mistake (legacy bytes read as UTF-8). */
const LATIN_ARTEFACTS = /[ÃÂ¤¢£å¾ƒ]/g;

export interface DecodeResult {
  text: string;
  /** The label actually used to decode. */
  charset: string;
  /** What the response claimed, when it claimed anything. */
  declared: string | null;
  /** True when the declared label was rejected for reading as mojibake. */
  overrode_declared: boolean;
}

function normalizeLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase().replace(/^["']|["']$/g, "");
  if (!lower) return null;
  return LABEL_ALIASES[lower] ?? lower;
}

/**
 * The charset from the Content-Type header, else from a `<meta>` in the head.
 * The head is sniffed as Latin-1 so byte values survive whatever the real
 * encoding turns out to be — charset declarations are pure ASCII.
 */
export function declaredCharset(bytes: Uint8Array, contentType: string | null): string | null {
  // The parameter value may be quoted (RFC 9110 §5.6.6) — `charset="EUC_JP"`
  // is as valid as the bare form and both are served.
  const fromHeader = normalizeLabel(
    contentType?.match(/charset\s*=\s*"?([\w:.-]+)"?/i)?.[1],
  );
  if (fromHeader) return fromHeader;

  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8192));
  const fromMeta =
    head.match(/<meta[^>]+charset\s*=\s*["']?([\w:.-]+)/i)?.[1] ??
    head.match(/<\?xml[^>]+encoding\s*=\s*["']?([\w:.-]+)/i)?.[1];
  return normalizeLabel(fromMeta);
}

/**
 * How much the text reads like Japanese: kana and kanji earn, the signatures
 * of a wrong decode cost. Weights are set so that a page of dense mojibake
 * always scores below the same bytes decoded correctly, while a genuinely
 * Latin page (an English-only site) scores near zero either way and keeps
 * whatever the page declared.
 */
export function japaneseScore(text: string): number {
  const sample = text.slice(0, 60_000);
  const kana = sample.match(/[\u3040-\u30ff]/g)?.length ?? 0;
  const kanji = sample.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const replacement = (sample.match(/\ufffd/g)?.length ?? 0) * 5;
  const mojibake = (sample.match(MOJIBAKE_MARKERS)?.length ?? 0) * 3;
  const latin = sample.match(LATIN_ARTEFACTS)?.length ?? 0;
  return kana + kanji - replacement - mojibake - latin;
}

function tryDecode(bytes: Uint8Array, label: string): string | null {
  try {
    return new TextDecoder(label as never, { fatal: false }).decode(bytes);
  } catch {
    return null; // unsupported label — fall through to the candidates
  }
}

/**
 * Decode a response body using the page's own charset, falling back to the
 * encoding that reads most like Japanese when the declared one does not.
 *
 * The declared label carries a bonus rather than an override, so a correctly
 * declared page is never second-guessed over a few stray characters, but a
 * page whose declaration is simply wrong still comes out readable.
 */
export function decodeHtml(bytes: Uint8Array, contentType: string | null): DecodeResult {
  const declared = declaredCharset(bytes, contentType);
  const candidates = [declared, ...FALLBACK_CANDIDATES].filter(
    (c, i, all): c is string => !!c && all.indexOf(c) === i,
  );

  let best: { text: string; charset: string; score: number } | null = null;
  for (const label of candidates) {
    const text = tryDecode(bytes, label);
    if (text === null) continue;
    // The declared encoding wins ties and survives small amounts of noise.
    const score = japaneseScore(text) + (label === declared ? 20 : 0);
    if (!best || score > best.score) best = { text, charset: label, score };
  }

  if (!best) {
    // Every candidate was rejected by the platform: read the bytes as UTF-8
    // with replacement so callers always get a string.
    return {
      text: new TextDecoder("utf-8").decode(bytes),
      charset: "utf-8",
      declared,
      overrode_declared: declared !== null && declared !== "utf-8",
    };
  }

  return {
    text: best.text,
    charset: best.charset,
    declared,
    overrode_declared: declared !== null && best.charset !== declared,
  };
}
