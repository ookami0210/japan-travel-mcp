/**
 * Transit-side derivations: JR Pass coverage, line metadata.
 *
 * The Japan Rail Pass (普通車用 / グリーン車用) covers all six JR Group
 * passenger railways plus JR Bus (most lines), JR Ferry (Miyajima),
 * Tōkyō Monorail (limited), and Aoimori Railway (between specific stations).
 * The seventh JR (JR Freight) carries no passengers and is excluded.
 *
 * For station-level "is this station JR Pass accessible?", an operator-name
 * prefix match against the six passenger JR companies is sufficient. This
 * yields false positives only for "Nozomi" / "Mizuho" Tōkaidō / Sanyō / Kyūshū
 * Shinkansen services (which require a supplementary ticket), but those are
 * train-class concerns, not station-class.
 *
 * Source: https://www.japanrailpass.net/en/about_jrp.html
 */

const JR_OPERATOR_QIDS = new Set<string>([
  "Q499071",   // East Japan Railway Company (JR East)
  "Q325098",   // West Japan Railway Company (JR West)
  "Q1142186",  // Central Japan Railway Company (JR Central)
  "Q1247239",  // Kyūshū Railway Company (JR Kyushu)
  "Q1250090",  // Hokkaidō Railway Company (JR Hokkaido)
  "Q815072",   // Shikoku Railway Company (JR Shikoku)
  "Q1057215",  // Japanese National Railways (JNR, defunct — historical
               // marker; some still-active legacy stations remain tagged
               // with this QID and are now JR-operated, so we accept it)
]);

const JR_OPERATOR_NAME_PATTERNS: RegExp[] = [
  /東日本旅客鉄道/u,
  /西日本旅客鉄道/u,
  /東海旅客鉄道/u,
  /九州旅客鉄道/u,
  /北海道旅客鉄道/u,
  /四国旅客鉄道/u,
  /日本国有鉄道/u,
  /JR\s*East\b/i,
  /JR\s*West\b/i,
  /JR\s*Central\b/i,
  /JR\s*Kyushu\b/i,
  /JR\s*Hokkaido\b/i,
  /JR\s*Shikoku\b/i,
];

const JR_FREIGHT_QID = "Q139936";  // Japan Freight Railway Company (excluded)
const JR_FREIGHT_NAME_RE = /日本貨物鉄道|JR\s*Freight\b/iu;

/**
 * Decide whether a railway operator is covered by the standard Japan Rail
 * Pass. Pass either the QID, the name, or both — the function uses any
 * available signal.
 */
export function isJrPassAccessible(
  operatorQid: string | null | undefined,
  operatorName: string | null | undefined,
): boolean {
  // JR Freight is operated by JR but carries no passengers; explicit exclude.
  if (operatorQid === JR_FREIGHT_QID) return false;
  if (operatorName && JR_FREIGHT_NAME_RE.test(operatorName)) return false;

  if (operatorQid && JR_OPERATOR_QIDS.has(operatorQid)) return true;
  if (operatorName) {
    for (const re of JR_OPERATOR_NAME_PATTERNS) {
      if (re.test(operatorName)) return true;
    }
  }
  return false;
}

/**
 * Three-letter classification for routing-hint clarity. `jr` covers all
 * passenger JR Group; `private` covers private railways (Kintetsu, Tobu,
 * Hankyū, etc.); `public` covers municipal subways and 第三セクター like
 * Tōkyō Metro, Toei, Aoimori Railway.
 */
export type OperatorClass = "jr" | "private" | "public" | "unknown";

const PUBLIC_OPERATOR_NAME_PATTERNS: RegExp[] = [
  /東京都交通局|大阪市高速電気軌道|京都市交通局|横浜市交通局|札幌市交通局|名古屋市交通局|福岡市交通局/u,
  /東京地下鉄/u,  // Tokyo Metro is a publicly-owned private corp; treated as public for IC pass purposes
  /Toei|Tokyo\s*Metro|Osaka\s*Metro|Yokohama\s*Subway/i,
];

export function classifyOperator(
  operatorQid: string | null | undefined,
  operatorName: string | null | undefined,
): OperatorClass {
  if (isJrPassAccessible(operatorQid, operatorName)) return "jr";
  if (operatorName) {
    for (const re of PUBLIC_OPERATOR_NAME_PATTERNS) {
      if (re.test(operatorName)) return "public";
    }
  }
  if (operatorName || operatorQid) return "private";
  return "unknown";
}
