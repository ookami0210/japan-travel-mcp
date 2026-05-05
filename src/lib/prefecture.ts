/**
 * Prefecture utilities — name ↔ JIS-code mapping, plus the upstream-data
 * correction layer for Wikidata entries whose prefecture_code is wrong at
 * source.
 *
 * Pure functions. `applyWikidataPrefCorrections` mutates the array it
 * receives (in place) — a deliberate choice so we don't double-allocate
 * the per-prefecture arrays at startup.
 */

// ──────────────────────────────────────────────────────────────────────
// Prefecture-name → 2-digit JIS code map.
//
// The 47-prefecture canonical list. Used by `inferPrefCode` to extract a
// prefecture from free text (R-3 record descriptions, scraped page bodies).

export const PREF_NAME_TO_CODE: Record<string, string> = {
  "北海道": "01", "青森県": "02", "岩手県": "03", "宮城県": "04", "秋田県": "05",
  "山形県": "06", "福島県": "07", "茨城県": "08", "栃木県": "09", "群馬県": "10",
  "埼玉県": "11", "千葉県": "12", "東京都": "13", "神奈川県": "14", "新潟県": "15",
  "富山県": "16", "石川県": "17", "福井県": "18", "山梨県": "19", "長野県": "20",
  "岐阜県": "21", "静岡県": "22", "愛知県": "23", "三重県": "24", "滋賀県": "25",
  "京都府": "26", "大阪府": "27", "兵庫県": "28", "奈良県": "29", "和歌山県": "30",
  "鳥取県": "31", "島根県": "32", "岡山県": "33", "広島県": "34", "山口県": "35",
  "徳島県": "36", "香川県": "37", "愛媛県": "38", "高知県": "39", "福岡県": "40",
  "佐賀県": "41", "長崎県": "42", "熊本県": "43", "大分県": "44", "宮崎県": "45",
  "鹿児島県": "46", "沖縄県": "47",
};

/** Reverse map: 2-digit JIS code → Japanese prefecture name. */
export const PREF_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(PREF_NAME_TO_CODE).map(([k, v]) => [v, k]),
);

/**
 * Extract the first prefecture mentioned in `text`. Returns `null` when no
 * prefecture name is present, or when `text` is empty/null.
 *
 * Match is by `String.includes` against full Japanese names ("北海道",
 * "京都府" etc.). Iteration order is the insertion order of
 * `PREF_NAME_TO_CODE` (北海道 → 沖縄県). When a text mentions multiple
 * prefectures the first one wins — by design, since R-3 records typically
 * lead with the primary prefecture.
 */
export function inferPrefCode(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const [name, code] of Object.entries(PREF_NAME_TO_CODE)) {
    if (text.includes(name)) return code;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Wikidata prefecture-correction layer.
//
// Some Wikidata entries have an upstream-wrong prefecture_code. Random-130
// testing surfaced Q11337011 (ベネッセアートサイト直島) tagged as Okayama
// (33) when it's actually in Kagawa (37). Fix at load time so every tool
// sees correct data without a re-scrape. Add new entries here as more
// upstream errors are discovered.

export const WIKIDATA_PREF_CORRECTIONS: Record<string, string> = {
  Q11337011: "37",  // ベネッセアートサイト直島 — Naoshima is Kagawa, not Okayama
};

/**
 * Narrow input contract for `applyWikidataPrefCorrections`. Structurally
 * compatible with the `WikidataAttraction` type in src/index.ts.
 */
export interface CorrectableAttraction {
  qid: string;
  prefecture_code: string;
}

/**
 * Narrow input contract for `applyWikidataPrefCorrections`. Structurally
 * compatible with the `PrefectureFile` type in src/index.ts.
 */
export interface CorrectablePrefectureFile<A extends CorrectableAttraction = CorrectableAttraction> {
  prefecture: { code: string };
  wikidata_attractions?: A[];
}

/**
 * Move each corrected Wikidata entry from its current (wrong) prefecture
 * to its correct one, in place.
 */
export function applyWikidataPrefCorrections<A extends CorrectableAttraction>(
  prefs: CorrectablePrefectureFile<A>[],
): void {
  const byCode = new Map(prefs.map((p) => [p.prefecture.code, p]));
  for (const [qid, correctCode] of Object.entries(WIKIDATA_PREF_CORRECTIONS)) {
    let moved: A | null = null;
    for (const p of prefs) {
      const idx = (p.wikidata_attractions ?? []).findIndex((a) => a.qid === qid);
      if (idx >= 0) {
        moved = (p.wikidata_attractions ?? [])[idx];
        p.wikidata_attractions!.splice(idx, 1);
        break;
      }
    }
    if (!moved) continue;
    moved.prefecture_code = correctCode;
    const target = byCode.get(correctCode);
    if (target) {
      target.wikidata_attractions = target.wikidata_attractions ?? [];
      target.wikidata_attractions.push(moved);
    }
  }
}
