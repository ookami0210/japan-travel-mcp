/**
 * Deterministic category classifier for municipal-scrape spots.
 *
 * The scrape extractor only sets `category` when the source page carries an
 * explicit machine signal, which left the field empty on ~100% of municipal
 * spots — consumers can't tell a shrine from a market from a beach, so
 * those records can't participate in category-constrained planning.
 *
 * This classifier maps official-page text (name + description) onto the
 * same coarse taxonomy the OSM-derived attraction categories use. It is
 * pure keyword→tag mapping — the editorial test ("could another person
 * reading the same source produce the same tag?") passes by construction.
 * No popularity, no curation, no ranking.
 *
 * Precedence: more specific patterns first; the first match wins. Records
 * matching nothing stay null (honest null) rather than guessing.
 */

export type SpotCategory =
  | "shrine_temple"
  | "castle"
  | "museum_gallery"
  | "park_garden"
  | "onsen"
  | "beach_coast"
  | "mountain_outdoor"
  | "food"
  | "market_shopping"
  | "festival_event"
  | "activity_leisure"
  | "nature"
  | "historic_site"
  | "viewpoint"
  | "transport_access";

interface Rule {
  category: SpotCategory;
  re: RegExp;
}

// Order matters: specific → general. Patterns target official-page Japanese
// with common English equivalents for pages scraped in English.
const RULES: Rule[] = [
  { category: "onsen", re: /(温泉|露天風呂|足湯|湯治|スパ|銭湯|hot\s*spring|onsen)/i },
  { category: "shrine_temple", re: /(神社|大社|八幡|稲荷|天満宮|寺院|[^市区町村]寺(?![こ子])|観音|不動|地蔵|大仏|shrine|temple)/i },
  { category: "castle", re: /(城跡|城址|[^宮]城(?:公園)?$|天守|castle)/i },
  { category: "museum_gallery", re: /(博物館|美術館|資料館|記念館|文学館|歴史館|科学館|水族館|動物園|植物園|museum|gallery|aquarium|zoo)/i },
  { category: "festival_event", re: /(祭り?$|祭り|まつり|花火大会|おどり$|をどり|盆踊り|イベント|festival|fireworks)/i },
  { category: "beach_coast", re: /(海水浴場|ビーチ|海岸|浜辺|[^横]浜$|岬|灯台|beach|coast|cape|lighthouse)/i },
  { category: "market_shopping", re: /(市場|朝市|直売所|道の駅|商店街|土産|物産|market|shopping)/i },
  { category: "food", re: /(名物料理|郷土料理|グルメ|食べ歩き|酒蔵|ワイナリー|ブルワリー|蕎麦|ラーメン|寿司|brewery|winery|sake|gourmet|cuisine)/i },
  { category: "viewpoint", re: /(展望台|展望所|見晴らし|眺望|夜景|absolute?\s*view|observation|viewpoint|lookout)/i },
  { category: "mountain_outdoor", re: /(登山|ハイキング|トレッキング|渓谷|峡谷|[^久]山$|岳$|峠|スキー場|キャンプ場|hiking|trekking|gorge|ski|camp)/i },
  // Bare 〜園 catches the famous strolling gardens (偕楽園 / 兼六園 / 後楽園
  // / 縮景園). 動物園 / 植物園 / 水族館 never reach here — the earlier
  // museum_gallery rule claims them first.
  { category: "park_garden", re: /(公園|庭園|緑地|花園|バラ園|梅林|園$|garden|park$)/i },
  { category: "historic_site", re: /(史跡|遺跡|古墳|城下町|宿場|旧跡|旧家|武家屋敷|歴史的|重要文化財|国宝|heritage|historic|ruins)/i },
  { category: "nature", re: /(滝|湖|沼|池$|川$|河川|湿原|森林|洞窟|鍾乳洞|桜並木|紅葉|waterfall|lake|marsh|forest|cave|nature)/i },
  { category: "activity_leisure", re: /(体験|工房|遊園地|テーマパーク|プール|ゴルフ|サイクリング|カヌー|釣り|experience|workshop|amusement|leisure)/i },
  { category: "transport_access", re: /(駅$|空港|港$|フェリー|ロープウェイ|ケーブルカー|station|airport|ferry|ropeway)/i },
];

/**
 * Classify a spot from its official-page text. Returns null when nothing
 * matches — an honest null beats a guessed tag.
 */
export function classifySpot(
  name: string | null | undefined,
  description?: string | null,
): SpotCategory | null {
  const nameText = (name ?? "").trim();
  if (!nameText) return null;
  // Name is the strongest signal — try it alone first so a description
  // mentioning "祭りも開催" doesn't reclassify a shrine as a festival.
  for (const rule of RULES) {
    if (rule.re.test(nameText)) return rule.category;
  }
  const desc = (description ?? "").slice(0, 200);
  if (desc) {
    for (const rule of RULES) {
      if (rule.re.test(desc)) return rule.category;
    }
  }
  return null;
}
