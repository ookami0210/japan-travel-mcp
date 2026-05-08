/**
 * Kind / heritage classification.
 *
 * Maps Wikidata type QIDs and Japanese name patterns to the human-readable
 * `kinds[]` tags surfaced on tourist-attraction records. Also handles the
 * companion mapping for heritage-designation P1435 QIDs and detects
 * kind/heritage intent in user queries.
 *
 * Pure functions only — no I/O. Used by `src/index.ts` (`get_spots`,
 * `get_entity_full`, `search_*`) and exercised directly by unit tests.
 */

// ──────────────────────────────────────────────────────────────────────
// Wikidata type QID → kind label
//
// Coverage follows fetch_wikidata_attractions_v2.ATTRACTION_TYPES. Verified
// QIDs against rdfs:label@ja (earlier draft had typos that mapped to
// Hungarian opera singers, etc., now removed).

export const WD_TYPE_KIND: Record<string, string> = {
  Q570116: "tourist_attraction",
  Q15303351: "historic_site",
  Q839954: "archaeological_site",
  Q44613: "buddhist_temple",
  Q845945: "shinto_shrine",
  Q23413: "castle",
  Q33506: "museum",
  Q22698: "park",
  Q1107656: "garden",
  Q4989906: "monument",
  Q4087053: "natural_monument",
  Q174782: "plaza",
  Q34038: "waterfall",
  Q23397: "lake",
  Q35509: "cave",
  Q40080: "beach",
  Q204324: "volcano",
  Q39816: "valley",
  Q46831: "mountain_range",
  Q14888011: "onsen_resort",
  Q12536: "hot_spring",
  Q1542076: "national_park",
  Q1370978: "great_buddha",
  Q488205: "designated_cultural_property_jp",
  Q1496967: "pilgrimage_site",
  Q15243209: "preservation_district",
  Q3960: "lighthouse",
  Q1500350: "resort",
  Q2087181: "memorial",
  Q635155: "theater",
  Q1248784: "airport",
  // Japanese castle subclasses (P31 chain to Q23413 does not reach these —
  // fetcher v2 silently dropped 2,047 of these).
  Q92026: "japanese_castle",
  Q11482498: "hilltop_castle",
  Q11482300: "plains_castle",
  Q15710038: "mountain_castle",
  Q11588709: "sacred_mountain",
  Q1051606: "great_buddha",
  // Alt-type QIDs that v2 fetcher uses but were missing from the kind map.
  // Many items have ONLY these types in their `types` array.
  Q5393308: "buddhist_temple",        // alt to Q44613 — Kōtoku-in tagged here
  Q697295: "shinto_shrine",           // alt to Q845945
  Q24398318: "religious_building",    // broader (some items only have this)
  Q830356: "designated_cultural_property_jp",  // alt to Q488205
  Q8502: "mountain",
  Q11197: "active_volcano",            // alt to Q204324
  Q16560: "palace",
  Q39614: "buddhist_monastery",        // alt to Q44613
  Q11455614: "shukubo",                // shukubō (Japanese Buddhist lodging)
  Q1071482: "national_park",           // national park of Japan (環境省指定)
  Q11832860: "quasi_national_park",    // quasi-national park of Japan (国定公園)
  // 2026-05-08 batch: high-coverage Japan-tourism QIDs that surfaced in
  // master.types[] but had no entry in this map. Each is a meaningful
  // tourism category, not a generic structural type.
  Q1141225: "kofun",                   // ancient burial mound (241 hits)
  Q11268718: "zenpou_kouenfun",        // keyhole-shaped kofun (115 hits)
  Q11411019: "kofungun",               // tumulus cluster (84 hits)
  Q11394747: "circular_kofun",         // round kofun (43 hits)
  Q11381412: "traditional_craft",      // 伝統工芸品 (234 hits)
  Q5773747: "historic_house",          // 歴史的家屋 (85 hits)
  Q35112127: "historic_building",      // 歴史的建造物 (66 hits)
  Q11411321: "kominka",                // 日本の古民家 (60 hits)
  Q11486287: "former_buddhist_temple", // 廃寺 (45 hits)
  Q1000809: "buddha_statue",           // 仏像 (79 hits)
  Q10901138: "chokuganji",             // 勅願寺 (61 hits)
  Q134917286: "shikinaisha",           // 式内社 — Engishiki-listed shrine (70 hits)
  Q17051413: "temple_main_hall",       // 本堂 (55 hits)
  Q2044994: "shrine_main_building",    // 本殿 (43 hits)
  Q1152199: "midden",                  // 貝塚 (52 hits)
  Q4312270: "railway_station",         // 鉄道の地上駅 (48 hits) — alt to Q55488
  Q55488: "railway_station",           // 鉄道駅 (56 hits)
  Q1081138: "historic_site",           // 史跡 — alt to Q15303351 (37 hits)
  Q207694: "art_museum",               // 美術館 — narrower alt to Q33506 (42 hits)
  Q811534: "remarkable_tree",          // 著名な木 (44 hits)
  Q11479807: "giant_tree",             // 巨樹 (30 hits)
  Q23442: "island",                    // 島 (48 hits)
  // Garden / shrine / temple specialised types
  Q11420231: "strolling_garden",       // 回遊式庭園 (29 hits)
  Q11433351: "daimyo_garden",          // 大名庭園 (29 hits)
  Q15835: "japanese_garden",           // 日本庭園 (26 hits)
  Q11390939: "hachiman_shrine",        // 八幡宮 (27 hits)
  Q1207757: "provincial_temple",       // 国分寺 (26 hits)
  Q131908135: "provincial_nunnery",    // 国分尼寺 (28 hits)
  Q9769742: "tatchu_subtemple",        // 塔頭 (22 hits)
  Q1129474: "cultural_landscape",      // 文化的景観 (27 hits)
  Q1044204: "gusuku",                  // グスク (Ryukyu castle, 22 hits)
  Q11504353: "square_kofun",           // 方墳 (26 hits)
  Q39715: "lighthouse",                // 灯台 — alt to Q3960 (24 hits)
  Q10624527: "biographical_museum",    // 人物記念館 (26 hits)
  Q537127: "road_bridge",              // 道路橋 (21 hits)
  Q96086399: "former_school_building", // 旧学校施設 (24 hits)
  Q85882206: "unmanned_station",       // 無人駅 (23 hits)
};

// ──────────────────────────────────────────────────────────────────────
// Name-regex semantic tag enrichment
//
// Wikidata types[] alone misses common Japanese travel concepts whose
// Wikidata type is generic (Q570116 tourist_attraction etc.) but whose
// name encodes the concept (○○横丁 / ○○棚田 / ○○宿 / ○○商店街). Adding
// these tags to `kinds[]` so the intent dictionary's recommended_kinds
// path can match them in get_spots / search_area.
//
// IMPORTANT: regex must be precise (anchored with prefix or suffix) to
// avoid false positives on long entity names.

export const NAME_KIND_RE: { kinds: string[]; re: RegExp }[] = [
  // ── Lodging / district patterns ─────────────────────────────────────
  { kinds: ["yokocho"], re: /(横丁|横町)/u },
  { kinds: ["shotengai"], re: /(商店街)/u },
  { kinds: ["jokamachi"], re: /(城下町)/u },
  { kinds: ["shukuba"], re: /(宿場|宿場町)/u },
  { kinds: ["shukubo"], re: /(宿坊)/u },
  // 海道 alone false-positives on 北海道 (prefecture name); restrict to
  // specific kaido tokens.
  { kinds: ["kaido"], re: /(街道|古道|東海道|中山道|甲州街道|奥州街道|日光街道|熊野古道|善光寺街道|京街道)/u },
  { kinds: ["buke_yashiki"], re: /(武家屋敷|侍屋敷)/u },
  { kinds: ["machiya", "preservation_district"], re: /(町家|町並み|古い町並)/u },
  // ── Landscape / agriculture ─────────────────────────────────────────
  { kinds: ["tanada"], re: /(棚田|段々畑)/u },
  { kinds: ["sand_dune"], re: /(砂丘|砂漠)/u },
  { kinds: ["yakei", "observation"], re: /(展望(台|所|広場|室)|スカイデッキ|スカイ.{0,2}ツリー|ロープウェイ)/u },
  // ── Industrial / mining heritage ────────────────────────────────────
  { kinds: ["mining_heritage"], re: /(鉱山|銀山|金山|炭鉱|炭礦|鉱業)/u },
  { kinds: ["industrial_heritage"], re: /(製鉄所|工場跡|紡績|造船|発電所跡)/u },
  // ── Active volcanoes (most-famous JMA-monitored peaks). Wikidata types
  //    Q204324 / Q11197 only catch ~24 crater-lakes; the famous active
  //    volcanoes themselves are typed Q8502 (mountain). Anchored name
  //    match — name must equal the volcano name exactly, else ~600 false
  //    positives on shrines/visitor centres.
  { kinds: ["active_volcano", "volcano", "mountain"],
    re: /^(阿蘇山|阿蘇中岳|桜島|浅間山|御嶽山|雲仙岳|普賢岳|有珠山|草津白根山|霧島山|新燃岳|三原山|北海道駒ヶ岳|樽前山|十勝岳|蔵王連峰|安達太良山|磐梯山|吾妻山|富士山|焼岳|焼山|那須岳|日光白根山|諏訪之瀬島|口永良部島|箱根山|大涌谷|岩木山|岩手山|秋田駒ヶ岳|鳥海山|栗駒山|赤城山|榛名山|白山|蔵王山|妙高山|新潟焼山|乗鞍岳|燧ヶ岳|九重山|阿武火山群|男鹿目潟火山群|新潟焼山|阿寒岳)$/u },
  // ── Henro / 88-temple pilgrimage ────────────────────────────────────
  { kinds: ["pilgrimage_site", "buddhist_temple"],
    re: /(.+番札所|遍路.+寺|.+霊場|.+巡礼)/u },
  // ── Kominka / traditional-house lodging — Wikidata typing is ad-hoc
  //    (some are Q3947 house, Q1497364 farmhouse).
  { kinds: ["kominka", "preservation_district"],
    re: /(古民家|庄屋(屋敷)?|曲屋|曲り家|武家屋敷)/u },
  // ── Local railway lines — restricted to 4+ char names ending in 線 to
  //    avoid 桜井線 noise.
  { kinds: ["local_railway", "railway_line"],
    re: /^[一-龥ァ-ヴーぁ-ん]{1,5}線$/u },
  // ── Crane wintering / nature reserves — narrowed to crane_wintering;
  //    natural_monument was too broad (sand_dune query regression).
  { kinds: ["crane_wintering"],
    re: /(ツル渡来|鶴渡来|タンチョウ|丹頂鶴|ツルセンター|鶴居)/u },
  // ── Sake brewery / brand ────────────────────────────────────────────
  //    Wikidata typing uses Q220659 which is NOT in our ATTRACTION_TYPES,
  //    so name regex is the only signal.
  { kinds: ["sake_brewery"],
    re: /(酒造(株式会社|株式|有限会社|有限|社|所)?$|.+酒造$|蔵元|.+酒造店$|醸造所|造り酒屋)/u },
  { kinds: ["sake_brand"],
    re: /(.+正宗$|.+菊酒$|.+大関$|越の三梅|越乃寒梅|八海山(?!尊神社)|久保田(?!児童公園)|獺祭|十四代|黒龍)/u },
  // ── Hanabi event names ──────────────────────────────────────────────
  { kinds: ["hanabi"],
    re: /(.+花火大会$|.+花火祭$|花火フェスティバル|納涼花火)/u },
  // ── Yuki matsuri / snow festivals ───────────────────────────────────
  { kinds: ["yuki_matsuri"],
    re: /(.+雪まつり|.+雪祭|.+氷瀑|スノーフェスティバル|氷雪まつり)/u },
  // ── Religious patterns (extras to WD_TYPE_KIND) ─────────────────────
  { kinds: ["shinto_shrine"], re: /(神社|大社|稲荷|八幡宮|天満宮|宮$)/u },
  { kinds: ["buddhist_temple"], re: /(寺$|寺院|大師堂|観音堂|本堂|奥之院|奥の院)/u },
  { kinds: ["pilgrimage_site"], re: /(霊場|札所|遍路|巡礼)/u },
  { kinds: ["sacred_mountain"], re: /(霊山|御山|出羽三山|大峰山|高野山)/u },
  // ── Architectural style ─────────────────────────────────────────────
  { kinds: ["giyofu"], re: /(擬洋風|洋館|旧.{0,5}館|レトロ建築)/u },
  // ── Food / venues ───────────────────────────────────────────────────
  { kinds: ["depachika"], re: /(デパ地下)/u },
  { kinds: ["michi_no_eki"], re: /(道の駅)/u },
  // ── Recreation ──────────────────────────────────────────────────────
  { kinds: ["ski_resort"], re: /(スキー場|ゲレンデ|スキー\s*リゾート)/u },
  { kinds: ["onsen_resort"], re: /(温泉郷|温泉街|温泉地)/u },
  { kinds: ["aquarium"], re: /(水族館)/u },
  { kinds: ["zoo"], re: /(動物園|サファリパーク)/u },
  // ── Industrial / scenic infrastructure ──────────────────────────────
  { kinds: ["bridge"], re: /(大橋$|橋$|つり橋|吊り橋|跨線橋)/u },
  { kinds: ["lighthouse"], re: /(灯台)/u },
  { kinds: ["dam"], re: /(ダム)/u },
];

/** Append name-regex-derived kind tags to `dst`, deduplicating. */
export function nameKindEnrich(name: string | null | undefined, dst: string[]): void {
  if (!name) return;
  for (const { kinds, re } of NAME_KIND_RE) {
    if (re.test(name)) {
      for (const k of kinds) if (!dst.includes(k)) dst.push(k);
    }
  }
}

/**
 * Narrow input contract for `wikidataKinds`. Structurally compatible with
 * the `WikidataAttraction` type in src/index.ts.
 */
export interface WikidataKindsInput {
  types?: string[];
  name_ja: string | null;
  name_en: string | null;
  wikipedia_kind_tags?: string[];
}

/**
 * Derive the `kinds[]` array for a Wikidata attraction by combining:
 *   1. Wikidata type QIDs → kind labels (WD_TYPE_KIND)
 *   2. Name-regex semantic tags (NAME_KIND_RE) — runs against ja + en
 *   3. Wikipedia category tags (already enriched upstream)
 */
export function wikidataKinds(a: WikidataKindsInput): string[] {
  const out: string[] = [];
  for (const t of a.types ?? []) {
    const k = WD_TYPE_KIND[t];
    if (k && !out.includes(k)) out.push(k);
  }
  nameKindEnrich(a.name_ja, out);
  nameKindEnrich(a.name_en, out);
  if (a.wikipedia_kind_tags) {
    for (const t of a.wikipedia_kind_tags) {
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────
// Heritage-designation (Wikidata P1435) labels
//
// Built from the most-common P1435 values in the 5,567-item heritage fetch.
// Verified against rdfs:label@ja. Agents consuming
// `heritage_designations: ["Q9259", "Q1188622"]` shouldn't need an extra
// Wikidata lookup to know what those mean.

export const HERITAGE_QID_LABEL: Record<string, { ja: string; en: string }> = {
  Q1188622:     { ja: "重要文化財", en: "Important Cultural Property of Japan" },
  Q1139795:     { ja: "国宝", en: "National Treasure of Japan" },
  Q30834580:    { ja: "国の史跡", en: "Historic Site of Japan" },
  Q11579194:    { ja: "登録有形文化財", en: "Registered Tangible Cultural Property of Japan" },
  Q43113623:    { ja: "国の天然記念物", en: "Natural Monument of Japan" },
  Q11414752:    { ja: "名勝", en: "Place of Scenic Beauty (Japan)" },
  Q122904442:   { ja: "国指定天然記念物", en: "Nationally-designated Natural Monument" },
  Q23790:       { ja: "天然記念物", en: "Natural Monument" },
  Q850649:      { ja: "重要伝統的建造物群保存地区", en: "Important Preservation District for Groups of Traditional Buildings" },
  Q26764449:    { ja: "国の特別史跡", en: "Special Historic Site of Japan" },
  Q11423672:    { ja: "土木学会選奨土木遺産", en: "JSCE Selected Civil Engineering Heritage" },
  Q123010864:   { ja: "都道府県指定史跡", en: "Prefecture-designated Historic Site" },
  Q19683138:    { ja: "ラムサール条約登録地", en: "Ramsar Wetland (Japan)" },
  Q9259:        { ja: "UNESCO世界遺産", en: "UNESCO World Heritage Site" },
  Q11525886:    { ja: "東京都選定歴史的建造物", en: "Tokyo Selected Historic Building" },
  Q94987823:    { ja: "特別名勝", en: "Special Place of Scenic Beauty" },
  Q123130241:   { ja: "日本国指定史跡構成資産", en: "Component of Nationally-designated Historic Site" },
  Q123011316:   { ja: "市町村指定有形民俗文化財", en: "Municipality-designated Folkloric Property" },
  Q11403686:    { ja: "北海道遺産", en: "Hokkaido Heritage" },
  Q24398318:    { ja: "宗教的建造物", en: "Religious Building" },
  Q24405128:    { ja: "ユネスコ無形文化遺産", en: "UNESCO Intangible Cultural Heritage" },
  Q1186017:     { ja: "国宝（建造物）", en: "National Treasure (architectural)" },
  Q64576748:    { ja: "重要文化的景観", en: "Important Cultural Landscape (Japan)" },
  Q7309389:     { ja: "登録記念物", en: "Registered Monument of Japan" },
  Q96207459:    { ja: "特別天然記念物", en: "Special Natural Monument of Japan" },
  Q18382798:    { ja: "日本遺産", en: "Japan Heritage (Bunka-cho program)" },
  Q114950428:   { ja: "市町村指定文化財", en: "Municipality-designated Cultural Property" },
  Q2901860:     { ja: "有形文化財", en: "Tangible Cultural Property of Japan" },
  Q123010988:   { ja: "市町村指定史跡", en: "Municipality-designated Historic Site" },
  Q95652804:    { ja: "被爆建造物", en: "Atomic-bombed Building" },
  Q11638384:    { ja: "近代化産業遺産", en: "Modernization Industrial Heritage (METI)" },
  Q123197814:   { ja: "日本国宝構成資産", en: "Component of National Treasure (Japan)" },
  Q123011498:   { ja: "都道府県指定有形文化財", en: "Prefecture-designated Tangible Cultural Property" },
  Q858308:      { ja: "日本の文化財", en: "Cultural Property of Japan" },
  Q11644858:    { ja: "重要有形民俗文化財", en: "Important Tangible Folk Cultural Property" },
  Q22127466:    { ja: "かんがい施設遺産", en: "Heritage Irrigation Structure" },
  Q114967308:   { ja: "都道府県指定文化財", en: "Prefecture-designated Cultural Property" },
  Q1459900:     { ja: "暫定世界遺産", en: "Tentative UNESCO World Heritage Site" },
  Q11462154:    { ja: "小樽市指定歴史的建造物", en: "Otaru-designated Historic Building" },
  Q11543174:    { ja: "横浜市認定歴史的建造物", en: "Yokohama-certified Historic Building" },
  Q137572758:   { ja: "原生自然環境保全地域", en: "Wilderness Area (Japan, Nature Conservation Law)" },
  Q106611640:   { ja: "保護林", en: "Protected Forest (Japan, Forestry Agency)" },
  Q123011161:   { ja: "市町村指定天然記念物", en: "Municipality-designated Natural Monument" },
};

/**
 * Map a list of P1435 designation QIDs to their English labels. Unmapped
 * QIDs surface as raw — better than dropping. Returns `undefined` when the
 * input is empty or undefined (so callers can `if (heritage_designations_label)`
 * without an explicit length check).
 */
export function heritageLabels(designations: string[] | undefined): string[] | undefined {
  if (!designations || designations.length === 0) return undefined;
  const out: string[] = [];
  for (const qid of designations) {
    const lab = HERITAGE_QID_LABEL[qid];
    out.push(lab ? lab.en : qid);
  }
  return out.length > 0 ? out : undefined;
}

// ──────────────────────────────────────────────────────────────────────
// Query-intent detection
//
// When the query is in English (or romaji Japanese) and uses category
// words like "shrine" / "temple" / "castle" / "garden", surface items
// with matching kinds even when the entity name is in Japanese.

export const KINDS_KEYWORD_RE: { kinds: string[]; re: RegExp }[] = [
  { kinds: ["shinto_shrine"], re: /(\bshrine\b|\bjinja\b|\btaisha\b|神社|大社|稲荷)/iu },
  { kinds: ["buddhist_temple"], re: /(\btemple\b|\bdera\b|寺院|大師)/iu },
  { kinds: ["castle", "japanese_castle", "hilltop_castle", "plains_castle", "mountain_castle"], re: /(\bcastle\b|城跡|の城)/iu },
  { kinds: ["garden"], re: /(\bgarden\b|\bteien\b|庭園|名園)/iu },
  { kinds: ["museum"], re: /(\bmuseum\b|\bhakubutsukan\b|博物館|美術館)/iu },
  { kinds: ["waterfall"], re: /(\bwaterfall\b|\bfalls\b|\bcascade\b|の滝|大滝)/iu },
  { kinds: ["onsen_resort", "hot_spring"], re: /(\bonsen\b|hot\s*spring|温泉)/iu },
  { kinds: ["lake"], re: /(\blake\b|湖)/iu },
  { kinds: ["beach"], re: /(\bbeach\b|海岸|海浜|浜辺)/iu },
  { kinds: ["volcano"], re: /(\bvolcano\b|火山|噴火口)/iu },
  { kinds: ["pilgrimage_site"], re: /(\bpilgrimage\b|巡礼|遍路|参詣)/iu },
];

/** Detect the kind tags implied by a user query string. */
export function kindsFromQuery(q: string): Set<string> {
  const out = new Set<string>();
  for (const { kinds, re } of KINDS_KEYWORD_RE) {
    if (re.test(q)) {
      for (const k of kinds) out.add(k);
    }
  }
  return out;
}

/**
 * Heritage-keyword detector for search_area / get_spots. When the query
 * talks about heritage classes ("UNESCO" / "国宝" / "world heritage" /
 * "重要文化財" etc.) but the items themselves don't mention those words in
 * their name or description, surface items with matching
 * heritage_designations as a separate boost.
 */
export const HERITAGE_KEYWORD_RE: { qids: string[]; re: RegExp }[] = [
  { qids: ["Q9259"], re: /(unesco|world\s*heritage|世界遺産|世界文化遺産)/i },
  { qids: ["Q1139795", "Q1186017"], re: /(国宝|national\s*treasure)/i },
  { qids: ["Q1188622"], re: /(重要文化財|important\s*cultural\s*property|icp)/i },
  { qids: ["Q94987823"], re: /(特別名勝|special.*scenic\s*beauty)/i },
  { qids: ["Q11414752"], re: /(名勝|place\s*of\s*scenic\s*beauty)/i },
  { qids: ["Q26764449"], re: /(特別史跡|special.*historic\s*site)/i },
  { qids: ["Q30834580"], re: /(史跡|historic\s*site)/i },
  { qids: ["Q43113623"], re: /(天然記念物|natural\s*monument)/i },
  { qids: ["Q850649"], re: /(伝統的建造物|traditional\s*buildings|preservation\s*district|重伝建)/i },
  { qids: ["Q24405128"], re: /(無形文化遺産|intangible.*heritage)/i },
  { qids: ["Q19683138"], re: /(ラムサール|ramsar|wetland)/i },
  { qids: ["Q11403686"], re: /(北海道遺産|hokkaido\s*heritage)/i },
];

/** Detect the heritage-designation QIDs implied by a user query string. */
export function heritageQidsFromQuery(q: string): Set<string> {
  const out = new Set<string>();
  for (const { qids, re } of HERITAGE_KEYWORD_RE) {
    if (re.test(q)) {
      for (const qid of qids) out.add(qid);
    }
  }
  return out;
}
