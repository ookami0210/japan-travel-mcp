// Travel Concept Dictionary + Server-side Intent Extraction
//
// Iter58: research落とし込みメモリ Phase B1 / B2。
// 日本特有の旅行概念を agent / Product 2 が問い合わせる前に server 側で
// 構造化シグナルへ落とし込み、retrieval を constraint-encodable にする。
//
// 設計原則:
//   - エントリは「travel-specific な概念」に限定する。一般名詞 (山/海) は
//     既存 KINDS_KEYWORD_RE に任せる。
//   - 各 concept は 4 軸を持つ:
//     · target_kinds              entity の kinds[] とマッチさせるべき値
//     · target_heritage_qids      P1435 designation でマッチさせるべき値
//     · routing_tool              query が誤 routing されたとき推奨する tool
//     · semantic_tags             名前/description regex で semantic match を補助
//   - 公式辞書ではなく「公式 source の語彙を agent に橋渡しする」レイヤー。
//     we の curation 禁止原則は尊重 — エントリ追加は「公式 source に
//     その語が含まれる」「行政・観光協会 page に頻出」を根拠にする。

export interface TravelConcept {
  /** 内部 ID (snake_case)。 */
  id: string;
  /** 検出 regex (Japanese / English / romaji を OR で). */
  re: RegExp;
  /** 推奨 kinds (entity.kinds[] と and-or マッチ). */
  target_kinds?: string[];
  /** Wikidata P1435 (heritage_designation) の QID 群. */
  target_heritage_qids?: string[];
  /** 誤 tool routing の hint. */
  routing_tool?: string;
  /** wikidata description / name で semantic match に使うキーワード (small). */
  semantic_tags?: string[];
  /** 短い人間向け説明 (server response の query_intent.rationale 用). */
  rationale_en: string;
  rationale_ja: string;
  /** プラスとマイナスのいずれかを示す: most concepts are positive (boost match). */
  polarity?: "boost" | "demote";
}

// ──────────────────────────────────────────────────────────────────────
// Concept dictionary

export const TRAVEL_CONCEPTS: TravelConcept[] = [
  // ── Lodging-type concepts ─────────────────────────────────────────────
  {
    id: "shukubo",
    re: /(宿坊|shukubo|temple\s*lodging|lodging\s*at\s*temple|寺.{0,3}泊|お寺.{0,3}泊)/iu,
    target_kinds: ["buddhist_temple", "buddhist_monastery", "pilgrimage_site"],
    routing_tool: "get_hotels",
    semantic_tags: ["temple lodging", "shukubo"],
    rationale_en: "Temple lodging (shukubo) — request for monastic accommodation, often Mt. Koya / Tohoku pilgrimage routes.",
    rationale_ja: "宿坊リクエスト。高野山・出羽三山等の参詣宿泊文化に対応。",
  },
  {
    id: "kominka",
    re: /(古民家|kominka|traditional\s*(folk|farm)?\s*house|machiya|町家|町屋)/iu,
    target_kinds: ["preservation_district"],
    target_heritage_qids: ["Q850649"], // 重要伝統的建造物群保存地区
    semantic_tags: ["traditional house", "machiya", "kominka"],
    rationale_en: "Kominka / machiya — traditional Japanese folk houses, typically in preservation districts.",
    rationale_ja: "古民家・町家。重要伝統的建造物群保存地区と相性が高い。",
  },
  {
    id: "ryokan",
    re: /(旅館|ryokan|traditional\s*(japanese\s*)?inn)/iu,
    routing_tool: "get_hotels",
    rationale_en: "Ryokan — traditional Japanese inn with tatami and futon.",
    rationale_ja: "旅館リクエスト。宿泊検索 (get_hotels) へ。",
  },
  // ── Architecture / cityscape ──────────────────────────────────────────
  {
    id: "giyofu",
    re: /(擬洋風|giyofu|gi-?yofu|pseudo[\s-]*western\s*(arch|building|style))/iu,
    // Iter60: add target_kinds so heritage_class_match kinds-gate can demote
    // castles / temples that have 重要文化財 designation but aren't giyofu.
    target_kinds: ["giyofu"],
    target_heritage_qids: ["Q1188622", "Q11579194"], // 重要文化財 / 登録有形文化財
    semantic_tags: ["pseudo-western", "Meiji architecture", "giyofu"],
    rationale_en: "Pseudo-western architecture (giyofu) — Meiji-era Japanese take on Western style, often nationally important.",
    rationale_ja: "擬洋風建築。明治期に和洋折衷で建てられ、重要文化財・登録有形文化財に多い。",
  },
  {
    id: "yokocho",
    re: /(横丁|横町|yokocho|alley|food\s*alley|drinking\s*alley|のんべえ街|ゴールデン街)/iu,
    // Iter62: target_kinds=["yokocho"] so kinds_class_match surfaces
    // Wikipedia-tagged yokocho entities (新宿ゴールデン街/思い出横丁/法善寺
    // 横丁/恵比寿横丁/etc.) once Wikipedia category merge completes.
    target_kinds: ["yokocho"],
    semantic_tags: ["yokocho", "alley", "izakaya street"],
    rationale_en: "Yokocho — narrow alley typically lined with izakaya / food stalls.",
    rationale_ja: "横丁。居酒屋や屋台が連なる狭い路地。",
  },
  {
    id: "shotengai",
    re: /(商店街|shotengai|shopping\s*street|covered\s*arcade)/iu,
    semantic_tags: ["shopping street", "shotengai"],
    rationale_en: "Shotengai — traditional shopping street arcade.",
    rationale_ja: "商店街。屋根付き・露天両形態あり。",
  },
  {
    id: "jokamachi",
    re: /(城下町|jokamachi|castle\s*town)/iu,
    target_kinds: ["castle", "japanese_castle", "preservation_district"],
    semantic_tags: ["castle town", "jokamachi"],
    rationale_en: "Castle town (jokamachi) — historic urban form built around a feudal castle.",
    rationale_ja: "城下町。藩政時代の城を中心とした町割が残る。",
  },
  {
    id: "shukuba",
    re: /(宿場|宿場町|shukuba|post\s*town|post-town|post\s*station)/iu,
    // Iter68: target_kinds=["shukuba"] so heritage_class_match kinds-gate
    // demotes non-shukuba items with Q850649 designation. D2 name regex
    // tags 妻籠/馬籠/奈良井. Also tags Wikipedia-list "shukuba" entries.
    target_kinds: ["shukuba"],
    target_heritage_qids: ["Q850649"],
    semantic_tags: ["post town", "shukuba", "kaido"],
    rationale_en: "Shukuba — Edo-era post town along the major highways (Nakasendo / Tokaido / etc.).",
    rationale_ja: "宿場町。中山道・東海道等の街道沿いに残る Edo 期の宿場。",
  },
  {
    id: "kaido",
    re: /(街道|kaido|highway\s*route|nakasendo|tokaido|nakahechi|kohechi|ohechi|iseji|nakahechi)/iu,
    target_kinds: ["pilgrimage_site", "historic_site"],
    semantic_tags: ["kaido", "highway", "ancient road"],
    rationale_en: "Kaido — ancient highway / road, often a heritage cultural landscape.",
    rationale_ja: "街道。中山道・東海道・熊野古道等。",
  },
  {
    id: "buke_yashiki",
    re: /(武家屋敷|buke\s*yashiki|samurai\s*residence|samurai\s*district)/iu,
    target_kinds: ["preservation_district", "historic_site"],
    target_heritage_qids: ["Q850649", "Q1188622"],
    semantic_tags: ["samurai residence", "buke-yashiki"],
    rationale_en: "Buke-yashiki — samurai residence / district, typically in preservation areas.",
    rationale_ja: "武家屋敷。重要伝統的建造物群保存地区にも多い。",
  },
  {
    id: "juden_preservation_district",
    re: /(重伝建|重要伝統的建造物群|important\s*preservation\s*district|traditional\s*building\s*preservation)/iu,
    target_kinds: ["preservation_district"],
    target_heritage_qids: ["Q850649"], // 重要伝統的建造物群保存地区
    semantic_tags: ["juden", "preservation district", "traditional buildings"],
    rationale_en: "Juden — Important Preservation District for Groups of Traditional Buildings (Q850649). Designation by 文化庁; 130+ districts nationwide.",
    rationale_ja: "重要伝統的建造物群保存地区 (重伝建)。文化庁指定 130 地区超。",
  },
  // ── Religious / pilgrimage ────────────────────────────────────────────
  {
    id: "henro_junrei",
    re: /(お?遍路|遍路|junrei|pilgrim(age)?|巡礼|巡拝|霊場|reijo|札所|fudasho)/iu,
    target_kinds: ["pilgrimage_site", "buddhist_temple", "shinto_shrine"],
    semantic_tags: ["pilgrimage", "henro", "fudasho"],
    rationale_en: "Pilgrimage — request for Buddhist / Shinto pilgrimage circuit (Shikoku 88, Kumano, Saigoku 33, etc.).",
    rationale_ja: "巡礼・遍路。四国88・熊野・西国33等の札所巡りに対応。",
  },
  {
    id: "shugendo",
    re: /(修験道|shugendo|shugen|yamabushi|山伏|出羽三山|大峰山)/iu,
    target_kinds: ["pilgrimage_site", "sacred_mountain", "buddhist_temple"],
    semantic_tags: ["shugendo", "yamabushi", "sacred mountain"],
    rationale_en: "Shugendo — esoteric mountain ascetic tradition (Dewa Sanzan, Omine, Kumano).",
    rationale_ja: "修験道。出羽三山・大峰山・熊野等。",
  },
  {
    id: "kakure_kirishitan",
    re: /(隠れ.{0,2}キリシタン|kakure\s*kirishitan|hidden\s*christian|crypto[\s-]*christian|潜伏キリシタン)/iu,
    target_heritage_qids: ["Q9259"], // UNESCO WHS (Hidden Christian Sites in the Nagasaki Region)
    semantic_tags: ["hidden christian", "kakure kirishitan", "Nagasaki"],
    rationale_en: "Kakure Kirishitan — Hidden Christian heritage, UNESCO WHS in Nagasaki / Amakusa.",
    rationale_ja: "隠れキリシタン関連遺産。長崎・天草の潜伏キリシタン関連遺産は UNESCO 世界遺産。",
  },
  // ── Landscape / geographic ────────────────────────────────────────────
  {
    id: "tanada",
    re: /(棚田|tanada|terraced\s*(rice|paddy|field)|rice\s*terrace)/iu,
    target_kinds: ["natural_monument"],
    target_heritage_qids: ["Q11414752", "Q94987823", "Q64576748"], // 名勝 / 特別名勝 / 重要文化的景観
    semantic_tags: ["rice terrace", "tanada"],
    rationale_en: "Tanada — terraced rice paddy landscape, often Place of Scenic Beauty / Important Cultural Landscape.",
    rationale_ja: "棚田。重要文化的景観・名勝指定があるものが多い。",
  },
  {
    id: "sand_dune",
    re: /(砂丘|sand\s*dune|dune|tottori\s*sand)/iu,
    // Narrowed (iter74) — natural_monument target was too broad and
    // bled crane reserves / waterfalls / etc. onto sand-dune queries.
    target_kinds: ["sand_dune"],
    target_heritage_qids: ["Q43113623", "Q11414752"], // 天然記念物 / 名勝
    semantic_tags: ["sand dune", "tottori"],
    rationale_en: "Sand dune — primarily Tottori Sakyu and a handful of smaller dunes (Wikipedia 砂丘 category).",
    rationale_ja: "砂丘。鳥取砂丘が代表、他は小規模。Wikipedia 砂丘 category 経由で 7 entries。",
  },
  {
    id: "beach",
    re: /(ビーチ|beach|海水浴|swimming\s*beach|seaside|沿岸)/iu,
    target_kinds: ["beach", "nagisa_100"],
    target_heritage_qids: ["Q11414752"], // 名勝
    semantic_tags: ["beach", "swimming beach", "coastal"],
    rationale_en: "Beach — Wikidata Q40080 (beach) plus 日本の渚百選 (Nagisa-100). Demotes amusement parks (e.g. 南知多ビーチランド) that share substring.",
    rationale_ja: "ビーチ・海水浴場。Q40080 + 日本の渚百選。南知多ビーチランド (遊園地) 等の同名substringを除外。",
  },
  {
    id: "tana_bata_terrace_field",
    re: /(段々畑|terraced\s*field|terraced\s*farm)/iu,
    target_heritage_qids: ["Q64576748"], // 重要文化的景観
    rationale_en: "Terraced field — agricultural terraces, often Important Cultural Landscape.",
    rationale_ja: "段々畑。重要文化的景観に該当することが多い。",
  },
  {
    id: "yakei_nightview",
    re: /(夜景|yakei|night\s*view|night\s*scenery|skyline)/iu,
    target_kinds: ["plaza"], // 観光 plaza / 展望台 が多い
    semantic_tags: ["night view", "yakei", "observation"],
    rationale_en: "Yakei — night cityscape view, typically observation deck or viewpoint.",
    rationale_ja: "夜景。展望台・展望広場が代表。",
  },
  {
    id: "tenbou",
    re: /(展望(台|所|スポット)?|tenbou|observation\s*(deck|platform|tower)|viewing\s*platform|スカイ.{0,2}ツリー)/iu,
    semantic_tags: ["observation deck", "viewing platform"],
    rationale_en: "Tenboudai — observation deck, mountain or tower viewpoint.",
    rationale_ja: "展望台。山・タワー・建物等。",
  },
  {
    id: "whale_watching",
    re: /(ホエール\s*ウォッチング|whale[-\s]*watch(ing)?|くじら(の|を)?(見|観)|クジラ\s*(ツアー|を見|観察|観光)|voir\s+des?\s+baleines)/iu,
    target_kinds: ["beach", "harbor", "national_park"],  // surfacing coastal/marine kinds
    semantic_tags: ["whale watching", "cetacean tour"],
    rationale_en: "Whale watching — typically Ogasawara, Okinawa, Kochi, Hokkaido. Coastal-tour activity, not a static landmark.",
    rationale_ja: "ホエールウォッチング。小笠原・沖縄・高知・北海道が代表。沿岸ツアーで static landmark とは異なる。",
  },
  {
    id: "dolphin_watching",
    re: /(ドルフィン\s*ウォッチング|dolphin[-\s]*watch|イルカ\s*(ツアー|を見|観察|スイム)|wild\s*dolphin)/iu,
    target_kinds: ["beach", "harbor"],
    semantic_tags: ["dolphin watching", "wild dolphin"],
    rationale_en: "Dolphin watching — Mikurashima / Toshima / Amakusa for wild dolphins. Captive-aquarium dolphins are a different intent.",
    rationale_ja: "野生イルカ。御蔵島・利島・天草が代表。水族館のイルカとは別意図。",
  },
  {
    id: "local_railway",
    re: /(ローカル線|ローカル鉄道|ローカル(?:な)?(?:電車|路線|鉄道|旅|の鉄)?|local\s*rail(way)?|country\s*train|secondary\s*line|赤字路線|鈍行|普通列車|閑散線区|ロー\s*カル鉄|^ローカル$)/iu,
    // Iter62: removed wrong target_kinds=["bridge"] (judge L3-23 confirmed
    // it surfaced bridges instead of railways). No good kinds match in
    // current corpus; rely on lexical retrieval only until Wikipedia
    // category 'railway_line' kind_tag is merged in.
    target_kinds: ["local_railway"],
    semantic_tags: ["local railway", "rural train"],
    rationale_en: "Local railway lines (only-2-trains-per-hour rural rail). Examples: 飯田線, 只見線, 小海線, 大井川鉄道.",
    rationale_ja: "ローカル線・閑散線区。飯田線・只見線・小海線・大井川鉄道等。",
  },
  {
    id: "tea_field_industry",
    re: /(茶畑|茶園|お?茶の?産地|tea\s*(plant|field|farm|garden|estate)|宇治茶|静岡茶|抹茶|嬉野茶|八女茶|玉露|tea\s*ceremon)/iu,
    routing_tool: "get_local_specialty",
    semantic_tags: ["tea production", "tea garden", "ocha"],
    rationale_en: "Tea production / tea garden / ocha. Famous regions: Uji (Kyoto), Shizuoka, Yame, Ureshino. Often GI-registered.",
    rationale_ja: "茶畑・茶産地。宇治・静岡・八女・嬉野等が代表。GI 登録のものも多い。",
  },
  {
    id: "sake_brewery",
    re: /(酒蔵|酒造|蔵元|日本酒|sake\s*(brewer|brand|kura|maker)|地酒)/iu,
    target_kinds: ["sake_brewery", "sake_brand"],
    semantic_tags: ["sake brewery", "kura", "japanese sake"],
    rationale_en: "Sake brewery / brand — 41 entries via Wikipedia category 日本酒メーカー (6) + 日本酒の銘柄 (35). Famous regions: Niigata, Hyogo (Nada), Akita, Hiroshima (Saijo).",
    rationale_ja: "日本酒の蔵元・銘柄。新潟・兵庫(灘)・秋田・広島(西条)等が代表。Wikipedia 日本酒メーカー/銘柄 category 経由で 41 entries。",
  },
  {
    id: "yuzu_citrus",
    re: /(ゆず|柚子|yuzu|sudachi|すだち|kabosu|かぼす|柑橘|citrus|local\s*citrus)/iu,
    routing_tool: "get_local_specialty",
    semantic_tags: ["yuzu", "citrus", "specialty"],
    rationale_en: "Yuzu / sudachi / kabosu — Japanese specialty citrus. Famous regions: Kochi (中芸 / 馬路村), Tokushima.",
    rationale_ja: "ゆず・すだち・かぼす。高知中芸/馬路村、徳島が代表。",
  },
  {
    id: "fishing_village",
    re: /(漁村|fishing\s*village|fishing\s*town|港町|海辺の町|港まち)/iu,
    target_heritage_qids: ["Q850649"], // 重伝建
    target_kinds: ["preservation_district"],
    semantic_tags: ["fishing village", "port town"],
    rationale_en: "Fishing village — typically 重伝建 (Important Preservation District) candidates: Ine no Funaya, Tomonoura, Oma.",
    rationale_ja: "漁村・港町。重伝建の伊根の舟屋・鞆の浦・大間崎等が代表。",
  },
  {
    id: "lavender_field",
    re: /(ラベンダー|lavender|薫衣草|薰衣草|lavande)/iu,
    semantic_tags: ["lavender field", "purple flowers"],
    rationale_en: "Lavender — Hokkaido Furano / Biei. Bloom: late June–July.",
    rationale_ja: "ラベンダー。北海道富良野・美瑛が代表。見頃 6 月下旬〜7 月。",
  },
  {
    id: "stargazing",
    re: /(星空|stargaz|night\s*sky|dark\s*sky|天体観測|プラネタリウム|planetarium|流星群|meteor\s*shower|オーロラ|aurora|northern\s*lights)/iu,
    target_kinds: ["national_park", "observation", "observatory"],
    semantic_tags: ["stargazing", "dark sky", "astronomy", "aurora-fallback"],
    rationale_en: "Stargazing or rare-sky phenomena (incl. aurora) — defaults to dark-sky observatories (Bisei, Iriomote, Hatoyama). Auroras are not visible in mainland Japan; safety guard emits geographic_impossibility for aurora queries.",
    rationale_ja: "星空観測・希少天体現象 (オーロラ含む)。美星・西表・鳩山等が代表。日本本土でオーロラは見えないため safety で警告。",
  },
  {
    id: "cycling_route",
    re: /(サイクリング|cycling|cycle\s*route|bike\s*tour|bicycle\s*tour|しまなみ海道|shimanami|ビワイチ|ツール\s*ド)/iu,
    semantic_tags: ["cycling", "bike route"],
    rationale_en: "Cycling routes — Shimanami Kaido / Biwa-ichi / Setouchi cycling routes are most famous.",
    rationale_ja: "サイクリングルート。しまなみ海道・ビワイチ・瀬戸内海が代表。",
  },
  {
    id: "ski_resort",
    re: /(スキー(場|リゾート)|snowboard|ski\s*resort|backcountry|ski\s*area|ゲレンデ)/iu,
    target_kinds: ["ski_resort"],
    semantic_tags: ["ski resort"],
    rationale_en: "Ski resort. Famous regions: Niseko, Hakuba, Nozawa, Zao, Myoko.",
    rationale_ja: "スキー場。ニセコ・白馬・野沢・蔵王・妙高等が代表。",
  },
  {
    id: "cherry_blossom",
    re: /(桜|cherry\s*blossom|sakura|花見|hanami|お花見)/iu,
    target_heritage_qids: ["Q11414752", "Q94987823"], // 名勝 / 特別名勝
    // Narrowed (iter72) — park/preservation_district are too broad and
    // 桜井駅跡 / 桜井茶臼山古墳 etc. surface as park members. Keep the
    // sakura-specific kind tags merged from Wikipedia 桜の名所 / 100選 lists.
    target_kinds: ["sakura_meisho_100", "sakura_meisho", "kouyou_meisho"],
    semantic_tags: ["cherry blossom", "sakura"],
    rationale_en: "Cherry blossom viewing — peak typically late March to early April for honshu. Kinds-gates to canonical sakura sites (Wikipedia 桜の名所 / 日本さくら名所100選) so 桜井駅跡 / 桜田門 / 桜井茶臼山古墳 substring matches are demoted.",
    rationale_ja: "桜・お花見。本州は 3 月下旬〜4 月上旬がピーク。日本さくら名所100選 / 桜の名所 wiki kind を用いて 桜井駅跡 / 桜田門 / 桜井古墳 等の名前substringを除外。",
  },
  {
    id: "fall_foliage",
    re: /(紅葉|kouyou|fall\s*(foliage|colou?rs)|autumn\s*(leaves|colou?rs)|momiji)/iu,
    target_heritage_qids: ["Q11414752"], // 名勝
    target_kinds: ["park", "preservation_district", "garden", "kouyou_meisho"],
    semantic_tags: ["fall foliage", "momiji"],
    rationale_en: "Fall foliage — peak late October to mid-November depending on latitude.",
    rationale_ja: "紅葉。緯度によって 10 月下旬〜11 月中旬がピーク。",
  },
  // ── Famous-list concepts (Iter64) ─────────────────────────────────────
  // Wikipedia list articles (日本100名城 / 日本三景 / 日本さくら名所100選 /
  // etc.) are canonical curation by official-ish bodies (Japan Castle
  // Foundation / Forestry Agency / JNTO). Each maps to wikipedia_kind_tags
  // merged from data/r3/wikipedia_lists.json into master.
  {
    id: "nihon_100_meijo",
    re: /(100名城|百名城|nihon\s*100|hundred\s*castles|100\s*castles)/iu,
    target_kinds: ["nihon_100_meijo", "zoku_nihon_100_meijo", "castle"],
    semantic_tags: ["nihon 100 meijo"],
    rationale_en: "Japan 100 Castles (日本100名城) curation by Japan Castle Foundation. Plus 続日本100名城 (200 total).",
    rationale_ja: "日本100名城・続日本100名城。",
  },
  {
    id: "nihon_sankei",
    re: /(日本三景|three\s*views\s*of\s*japan)/iu,
    target_kinds: ["nihon_sankei"],
    semantic_tags: ["nihon sankei"],
    rationale_en: "Three Views of Japan: 松島 / 天橋立 / 宮島.",
    rationale_ja: "日本三景：松島・天橋立・宮島。",
  },
  {
    id: "nihon_sanmeien",
    re: /(三名園|three\s*great\s*gardens)/iu,
    target_kinds: ["nihon_sanmeien", "garden"],
    semantic_tags: ["sanmeien"],
    rationale_en: "Three Great Gardens of Japan: 兼六園 / 後楽園 / 偕楽園.",
    rationale_ja: "日本三名園。",
  },
  {
    id: "sakura_meisho_100",
    re: /(さくら名所100選|桜名所100|cherry\s*blossom\s*100)/iu,
    target_kinds: ["sakura_meisho_100", "sakura_meisho", "kouyou_meisho"],
    semantic_tags: ["sakura meisho 100"],
    rationale_en: "Japan Cherry Blossom 100 Selection.",
    rationale_ja: "日本さくら名所100選。",
  },
  {
    id: "tanada_100",
    re: /(棚田百選|棚田100)/iu,
    target_kinds: ["tanada_100", "tanada"],
    semantic_tags: ["tanada hyakusen"],
    rationale_en: "Japan Terraced Rice Field 100 Selection.",
    rationale_ja: "日本の棚田百選。",
  },
  {
    id: "famous_waterfall_top",
    re: /(三名瀑|three\s*great\s*waterfalls|名瀑)/iu,
    target_kinds: ["famous_waterfall", "waterfall"],
    semantic_tags: ["sanmeibaku"],
    rationale_en: "Three Great Waterfalls of Japan: 那智の滝 / 華厳の滝 / 袋田の滝.",
    rationale_ja: "日本三名瀑。",
  },
  {
    id: "volcano",
    // Cover both 火山 (broad) and 活火山 (narrow) plus famous-name aliases.
    // Kinds-gate to volcano / active_volcano filters out generic mountain
    // entities — the famous volcanoes themselves get the active_volcano tag
    // via NAME_KIND_RE in src/index.ts even when their Wikidata P31 is Q8502.
    re: /(活火山|active\s*volcano|volcanoes?\s*(in|of)|噴火|fumarole|crater\s*lake|火口|噴気|火山|阿蘇山|桜島|浅間山|有珠山|草津白根|霧島山|雲仙岳|箱根山|三原山|蔵王連峰|御嶽山|焼岳)/iu,
    target_kinds: ["volcano", "active_volcano"],
    semantic_tags: ["active volcano", "volcano"],
    rationale_en: "Active volcano — JMA-monitored peaks (Aso, Sakurajima, Asama, Usu, Kusatsu-Shirane, Kirishima, Unzen, Hakone, Mihara, Ontake, Yake) and Wikidata Q204324 / Q11197 crater entities. Distinct from generic mountain.",
    rationale_ja: "活火山。気象庁監視対象 (阿蘇・桜島・浅間・有珠・草津白根・霧島・雲仙・箱根・三原・御嶽・焼岳) と Wikidata Q204324 / Q11197 火口湖系。",
  },
  {
    id: "crane_wintering",
    // 鶴/ツル alone covers the L3-25 query but kinds-gate to crane_wintering/
    // natural_monument filters out shrines/temples (鶴岡八幡宮/鶴林寺) whose
    // kinds are shinto_shrine/buddhist_temple, not natural_monument.
    re: /(タンチョウ|tancho|grus\s*japonensis|crane.{0,3}(wintering|migrat|sanctuary|reserve)|鶴.{0,3}(渡来|飛来|越冬|の渡|サンクチュアリ)|出水.{0,3}(の)?ツル|釧路湿原.{0,3}タンチョウ|^(鶴|ツル|tsuru)$)/iu,
    target_kinds: ["crane_wintering", "natural_monument", "national_park"],
    target_heritage_qids: ["Q43113623", "Q122904442"], // 国の天然記念物 / 国指定天然記念物
    semantic_tags: ["crane wintering", "tancho", "wildlife"],
    rationale_en: "Crane wintering / Tancho — Izumi (Kagoshima) wintering site, Kushiro Marsh (Hokkaido) red-crowned crane sanctuary. Natural Monument designation. The bare query 鶴/ツル/tsuru kinds-gates to natural_monument so 鶴林寺/鶴岡八幡宮 etc. are demoted.",
    rationale_ja: "鶴の渡来地・タンチョウ。出水市ツル渡来地 (鹿児島)・釧路湿原 (北海道)。国指定天然記念物。鶴/ツル 単独 query は kinds-gate で寺社を除外。",
  },
  {
    id: "henro_88_temple",
    re: /(四国八十八|88\s*temples?|お遍路|お?遍路|henro|shikoku\s*(pilgrim|pilgrimage|88))/iu,
    target_kinds: ["pilgrimage_site", "buddhist_temple"],
    semantic_tags: ["shikoku 88 temples", "henro pilgrimage"],
    rationale_en: "Shikoku 88-temple pilgrimage (お遍路) — pilgrimage circuit across 徳島 / 高知 / 愛媛 / 香川.",
    rationale_ja: "四国八十八箇所お遍路。徳島・高知・愛媛・香川にまたがる巡礼路。",
  },
  {
    id: "kominka_stay",
    // separate from existing kominka intent which targets preservation_district landmarks
    re: /(古民家(ステイ|宿|ホテル|泊)|kominka\s*(stay|inn|guesthouse|lodging)|renovated\s*(traditional|farmhouse))/iu,
    target_kinds: ["preservation_district", "ryokan", "guesthouse"],
    semantic_tags: ["kominka stay", "renovated farmhouse", "traditional lodging"],
    rationale_en: "Kominka lodging — renovated traditional farmhouse stays (Bed and Craft, Higashiyama 古民家ホテル, etc.).",
    rationale_ja: "古民家宿・古民家ホテル。Bed and Craft 七尾、越中八尾古民家、東山等。",
  },
  // ── Cultural concepts ─────────────────────────────────────────────────
  {
    id: "ukiyoe",
    re: /(浮世絵|ukiyo[-\s]*e|woodblock\s*print)/iu,
    target_kinds: ["museum"],
    routing_tool: "get_traditional_arts",
    semantic_tags: ["ukiyo-e", "woodblock print"],
    rationale_en: "Ukiyo-e — Edo-era woodblock prints, often museum-housed.",
    rationale_ja: "浮世絵。美術館・博物館収蔵が中心。",
  },
  {
    id: "jomon",
    re: /(縄文|jomon|jōmon)/iu,
    target_kinds: ["archaeological_site", "museum"],
    target_heritage_qids: ["Q9259", "Q30834580"], // UNESCO / 国の史跡
    semantic_tags: ["Jomon", "prehistoric", "archaeological"],
    rationale_en: "Jomon — prehistoric Jomon culture sites (Sannai-Maruyama etc.), UNESCO and Historic Sites.",
    rationale_ja: "縄文。三内丸山等の縄文遺跡。UNESCO・国史跡多数。",
  },
  {
    id: "yayoi",
    re: /(弥生|yayoi)/iu,
    target_kinds: ["archaeological_site", "museum"],
    target_heritage_qids: ["Q30834580"],
    semantic_tags: ["Yayoi", "archaeological"],
    rationale_en: "Yayoi — Yayoi-period (300BCE-300CE) archaeological sites and museums.",
    rationale_ja: "弥生。弥生時代の遺跡・博物館。",
  },
  {
    id: "ainu",
    re: /(アイヌ|ainu|アイヌ文化)/iu,
    target_kinds: ["museum", "park"],
    semantic_tags: ["Ainu", "indigenous"],
    rationale_en: "Ainu — indigenous Hokkaido culture (Upopoy, Akan, etc.).",
    rationale_ja: "アイヌ文化。Upopoy・阿寒・二風谷等。",
  },
  {
    id: "ryukyu",
    re: /(琉球|ryukyu|ryūkyū|first\s*sho|nd\s*sho)/iu,
    target_heritage_qids: ["Q9259", "Q26764449"], // UNESCO / 特別史跡
    target_kinds: ["castle", "historic_site"],
    semantic_tags: ["Ryukyu", "Okinawa kingdom"],
    rationale_en: "Ryukyu — Ryukyu Kingdom heritage (Okinawa Gusuku Sites are UNESCO).",
    rationale_ja: "琉球。沖縄グスク及び関連遺産群は UNESCO 世界遺産。",
  },
  // ── Festival ─────────────────────────────────────────────────────────
  {
    id: "matsuri",
    re: /(祭り|まつり|matsuri|festival|fest)/iu,
    routing_tool: "get_events",
    semantic_tags: ["festival", "matsuri"],
    rationale_en: "Matsuri — Japanese festival, prefer get_events for date-bound queries.",
    rationale_ja: "祭り。日付付きクエリは get_events を優先。",
  },
  {
    id: "hanabi",
    re: /(花火(大会)?|hanabi|firework(s)?)/iu,
    routing_tool: "get_events",
    semantic_tags: ["fireworks", "hanabi"],
    rationale_en: "Hanabi — fireworks festival, typically summer.",
    rationale_ja: "花火大会。夏季が中心。",
  },
  {
    id: "yuki_matsuri",
    re: /(雪祭り|雪まつり|yuki\s*matsuri|snow\s*festival)/iu,
    // Route to search_area (not get_events) so the snow_festival CANONICAL
    // cluster fires and surfaces さっぽろ雪まつり (Q1023167) directly. The
    // get_events / get_festivals SPARQL paths return no Hokkaido yuki-matsuri
    // entries reliably (judge L3-03 saw UNESCO ICH from Akita / Iwate
    // surfaced as a fallback).
    routing_tool: "search_area",
    target_kinds: ["snow_festival", "winter_festival"],
    semantic_tags: ["snow festival"],
    rationale_en: "Yuki Matsuri — snow festival, Sapporo most famous (さっぽろ雪まつり Q1023167). Routed to search_area so the canonical cluster surfaces it.",
    rationale_ja: "雪まつり。さっぽろ雪まつりが代表 (Q1023167)。canonical cluster を発火させるため search_area へ routing。",
  },
  // ── Onsen specifics ──────────────────────────────────────────────────
  {
    id: "secret_hidden_onsen",
    re: /(秘湯|hidden\s*onsen|secret\s*onsen|hito\s*no\s*shiranai|tucked.?away)/iu,
    target_kinds: ["onsen_resort", "hot_spring"],
    semantic_tags: ["hidden onsen", "hito-no-shirenu yado"],
    rationale_en: "Hito (hidden / secret) onsen — small, remote hot springs.",
    rationale_ja: "秘湯。山奥・小規模温泉。",
    polarity: "boost",
  },
  // ── Industrial heritage ──────────────────────────────────────────────
  {
    id: "industrial_heritage",
    re: /(産業遺産|industrial\s*heritage|industrial\s*revolution|kindaika|近代化遺産|軍艦島)/iu,
    // Iter62: target_kinds added (mirrors D2 name-regex enrich on entities
    // containing 製鉄所/工場跡/紡績/造船/発電所跡). With kinds-gate, this
    // demotes 姫路城/屋久島 etc. that have UNESCO designation but aren't
    // industrial heritage.
    target_kinds: ["industrial_heritage"],
    target_heritage_qids: ["Q11638384", "Q9259"], // 近代化産業遺産 / UNESCO
    semantic_tags: ["industrial heritage", "Meiji industrial"],
    rationale_en: "Industrial heritage — Meiji Industrial Revolution UNESCO sites + METI Modernization Industrial Heritage.",
    rationale_ja: "産業遺産。明治日本の産業革命遺産 (UNESCO) + METI 近代化産業遺産。",
  },
  {
    id: "mining",
    re: /(鉱山(跡|遺跡)?|mine\s*(ruin|site|heritage)|silver\s*mine|gold\s*mine|sado\s*kinzan|iwami\s*ginzan)/iu,
    // Iter62: target_kinds added (D2 name regex catches 鉱山/銀山/金山/炭鉱).
    target_kinds: ["mining_heritage"],
    target_heritage_qids: ["Q9259", "Q30834580"],
    semantic_tags: ["mining", "silver mine", "gold mine"],
    rationale_en: "Mining heritage — Iwami Ginzan / Sado / Ashio etc., UNESCO and Historic Sites.",
    rationale_ja: "鉱山遺産。石見銀山・佐渡・足尾等。",
  },
  // ── Crafts ───────────────────────────────────────────────────────────
  {
    id: "kogei_crafts",
    re: /(伝統工芸|工芸|kogei|kōgei|craft|handicraft|artisan)/iu,
    routing_tool: "get_traditional_arts",
    semantic_tags: ["traditional crafts", "kogei"],
    rationale_en: "Traditional crafts — METI Densan crafts and prefectural designations.",
    rationale_ja: "伝統工芸。METI 伝産品・県指定工芸品。",
  },
  {
    id: "yakimono_pottery",
    re: /(陶磁器|焼き物|焼物|やきもの|pottery|ceramics?|porcelain|kiln|kamamoto|窯元)/iu,
    routing_tool: "get_traditional_arts",
    semantic_tags: ["pottery", "ceramics", "kiln"],
    rationale_en: "Pottery / ceramics — production area and kiln visits.",
    rationale_ja: "陶磁器。窯元見学を含む。",
  },
  {
    id: "dyeing_technique",
    // 染色 = dyeing as distinct from 織 (weaving). L4-18 query "traditional
    // textile dyeing" returned weaving crafts (Nibutani Attus, Oitama Tsumugi,
    // Ugo Shina) instead of dyeing-specific crafts (Kyo-yuzen, Edo komon,
    // Awa indigo). Use a dedicated kind tag to prioritise dyeing METI items.
    re: /(染色|友禅|yuzen|yūzen|藍染|aizome|indigo\s*dyeing|edo\s*komon|京小紋|kyo[-\s]*yuzen|染め(物|技法)?|textile\s*dyeing|fabric\s*dyeing)/iu,
    routing_tool: "get_traditional_arts",
    target_kinds: ["dyeing_technique"],
    semantic_tags: ["dyeing technique", "textile dyeing"],
    rationale_en: "Textile dyeing technique — distinct from weaving. Canonical: Kyo-yuzen, Edo komon, Awa indigo, Bingata (Okinawa). Use dyeing_technique kind tag.",
    rationale_ja: "染色技法。織との区別が必要。京友禅・江戸小紋・阿波藍・紅型(沖縄)が代表。dyeing_technique kind を用いる。",
  },
  {
    id: "chado_school",
    // L3-29 "deep tea ceremony, not tourist show". Tool was get_japan_heritage
    // returning Nijo Castle / Toji etc. The intent is tea-ceremony schools
    // (Urasenke, Omotesenke, Mushakojisenke) and chashitsu venues for
    // genuine ritual study, not heritage stories.
    re: /(茶道|chado|chadō|sado|sadō|tea\s*ceremony|cha-no-yu|cha\s*no\s*yu|裏千家|表千家|武者小路千家|urasenke|omotesenke|mushak[oō]jisenke)/iu,
    routing_tool: "search_area",
    target_kinds: ["chashitsu", "chado_school", "tea_ceremony"],
    semantic_tags: ["tea ceremony school", "chashitsu", "chado"],
    rationale_en: "Tea ceremony schools and chashitsu (tea house) venues. Canonical: Urasenke / Omotesenke / Mushakojisenke headquarters in Kyoto, plus designated chashitsu (Jo-an / Tai-an / Mittan).",
    rationale_ja: "茶道流派と茶室。京都の三千家(裏千家・表千家・武者小路千家)、国宝茶室(如庵・待庵・密庵)が代表。",
  },
  {
    id: "shojin_ryori",
    // L3-17 (Indonesian) "fresh tofu at a temple". Tool returned MAFF GI
    // tofu products (frozen tofu, island tofu) — the temple-cuisine context
    // was lost. Shojin ryori = Buddhist vegetarian cuisine served at
    // temples; tofu / yudofu is the canonical example.
    re: /(精進料理|shojin\s*ryori|shōjin\s*ryōri|buddhist\s*(vegan|vegetarian|cuisine)|temple\s*(food|cuisine|tofu|meal|dining)|湯豆腐|yudofu|yu\s*dofu|kaiseki\s*shojin)/iu,
    routing_tool: "search_area",
    target_kinds: ["shojin_ryori", "buddhist_temple", "shukubo"],
    semantic_tags: ["shojin ryori", "temple cuisine"],
    rationale_en: "Shojin ryori — Buddhist temple vegetarian cuisine. Canonical: Koyasan shukubo, Nanzenji yudofu (Kyoto), Eikan-do tofu (Kyoto), Daihonzan Eihei-ji Fukui. Tofu / yu-dofu queries with temple context route here.",
    rationale_ja: "精進料理。高野山宿坊・南禅寺湯豆腐・永観堂・永平寺等が代表。寺院文脈の豆腐 query はここに routing。",
  },
  {
    id: "island_archipelago",
    // L2-13 (Vietnamese) "islands in the Seto Inland Sea" — tool returned
    // mainland Kagawa spots (Ritsurin Garden, Marugame Castle). Need an
    // island-explicit kind so island queries surface only spots whose
    // primary classification is 島 / island / archipelago.
    re: /(諸島|群島|列島|archipelago|islands?\b|the\s*\w+\s*island|島々|離島|remote\s*islands?|island\s*hopping)/iu,
    target_kinds: ["island", "island_group", "archipelago"],
    semantic_tags: ["island", "archipelago"],
    rationale_en: "Island / archipelago intent. For 'Seto Inland Sea islands', expand region (Kagawa + Hiroshima + Okayama + Ehime) and gate to island-class entities. Filters out mainland gardens / castles substring-matching the toponym.",
    rationale_ja: "島・諸島・列島の指向。瀬戸内海諸島であれば region (香川+広島+岡山+愛媛) fan-out + island kind gate を適用、 本土の庭園 / 城は除外。",
  },
  // ── Specialty foods ──────────────────────────────────────────────────
  {
    id: "local_specialty",
    re: /(ご当地|名物|特産|specialty|local\s*specialt(y|ies)|regional\s*food|郷土(料理)?)/iu,
    routing_tool: "get_local_specialty",
    rationale_en: "Local specialty — geographic indication (GI) products and regional cuisine.",
    rationale_ja: "ご当地・特産。地理的表示 (GI) や郷土料理。",
  },
  // ── Park / Nature ────────────────────────────────────────────────────
  {
    id: "national_park",
    re: /(国立公園|national\s*park|kokurit(s|z)u\s*koen)/iu,
    target_kinds: ["national_park"],
    rationale_en: "National Park — Ministry of Environment designated.",
    rationale_ja: "国立公園 (環境省指定)。",
  },
  {
    id: "quasi_national_park",
    re: /(国定公園|quasi[-\s]*national\s*park)/iu,
    semantic_tags: ["quasi-national park"],
    rationale_en: "Quasi-National Park — Ministry of Environment designated.",
    rationale_ja: "国定公園。",
  },
  // ── Rail ─────────────────────────────────────────────────────────────
  {
    id: "haisen_defunct_rail",
    re: /(廃線|haisen|defunct\s*(rail|line|railway)|abandoned\s*railway)/iu,
    semantic_tags: ["defunct railway", "haisen"],
    rationale_en: "Haisen — defunct rail line, often hiking trail.",
    rationale_ja: "廃線。トロッコ廃線跡・ハイキング路化等。",
  },
  // ── Cuisine venue ────────────────────────────────────────────────────
  {
    id: "izakaya",
    re: /(居酒屋|izakaya|japanese\s*pub)/iu,
    semantic_tags: ["izakaya"],
    rationale_en: "Izakaya — Japanese gastropub.",
    rationale_ja: "居酒屋。",
  },
  {
    id: "depachika",
    re: /(デパ地下|depachika|department\s*store\s*basement|food\s*hall)/iu,
    semantic_tags: ["depachika"],
    rationale_en: "Depachika — basement food hall in department stores.",
    rationale_ja: "デパ地下。百貨店地下食品売場。",
  },
  // ── Constraint modifiers (Phase B / constraint_handling lift) ────────
  // These concepts do not select entities directly; they shape ranking
  // and are surfaced to the calling agent / Solver as constraint hints.
  {
    id: "anaba_hidden",
    // Narrowed 2026-05-09: the previous pattern matched bare `隠れ` and
    // bare `hidden`, which fired on `隠れキリシタン` (= UNESCO heritage,
    // very NOT anaba), `hidden Christian heritage`, `hidden cost`, etc.
    // Now we require the anaba/hidden marker to be paired with an
    // anaba-relevant noun in CJK, or with a specific anaba phrase in
    // English. Bare `隠れ` no longer matches; `隠れキリシタン` is left to
    // the kakure_kirishitan concept which carries the correct heritage
    // QID hint.
    re: /(穴場|秘境|秘湯|秘景|隠れ家|隠れ里|隠れ宿|隠れ(?:た)?(?:名所|スポット|場所|宿|温泉|絶景|お店|名店|レストラン|カフェ)|hidden\s*(?:gem|spot|place|onsen|destination|treasure|inn|ryokan|hotsprings?)|knowledge.?spot|lesser.?known|off.?the.?beaten(?:\s*(?:path|track))?|underrated\s*(?:spot|place|destination|town|onsen|inn)|地元.{0,4}(?:知|秘密|だけ)|local'?s?\s*(?:secret|favo(?:u)?rite))/iu,
    semantic_tags: ["anaba", "hidden gem", "lesser known"],
    rationale_en: "Anaba (穴場) / hidden gem — user wants entries that are NOT internationally famous. Demote multilingual / heritage-heavy entries; surface entries with fewer Wikipedia list memberships.",
    rationale_ja: "穴場・秘境・隠れた名所。国際的に有名なものは避け、Wikipedia list 記載が少ない entry を浮かせる。",
    polarity: "boost",
  },
  {
    id: "uncrowded",
    // Narrowed 2026-05-09: bare 空い(た|てる) matched 席が空いた / 空いた皿
    // / 空き家 etc. Require an uncrowded marker to be paired with a
    // tourism-relevant noun in CJK; in English keep the explicit
    // uncrowded / few-tourists phrasings.
    re: /(混雑(?:が)?(?:少|ない|を避|回避)|空いて(?:いる|る)\s*(?:場所|スポット|時|時期|時間|お?店|名所|温泉|寺|神社|観光地)|人(?:が|の)?少な(?:い|め)?\s*(?:場所|スポット|名所|時間|時期|寺|神社|観光地)|tourist.?free|few\s*tourists|not\s*crowded|aren'?t\s*crowded|less\s*crowded|uncrowded|quiet\s*(?:place|spot|destination|town|onsen)|静かな(?:場所|名所|寺|神社|温泉|観光地))/iu,
    semantic_tags: ["uncrowded", "quiet"],
    rationale_en: "Uncrowded — user wants destinations without heavy tourist flow. Treated as a sibling of anaba: demote heritage-heavy / multilingual-famous entries.",
    rationale_ja: "混雑回避・空いている所。anaba の同族として有名 entry を demote する。",
    polarity: "boost",
  },
  {
    id: "wild_not_captive",
    // Narrowed 2026-05-09: bare `野生` + `wild` matched 野生児 / 野生味 /
    // wild taste / wild guess on queries that had nothing to do with
    // animal-watching. Now we only fire on phrases where 野生 / wild is
    // explicitly tied to an animal-watching context.
    re: /(野生(?:の|な)?\s*(?:動物|鳥|鹿|サル|猿|熊|クマ|狐|キツネ|鶴|ツル|タンチョウ|鯨|クジラ|イルカ|オオカミ|狼|羆|ヒグマ|オオワシ|ライチョウ)|wild\s*(?:animal|bird|deer|monkey|bear|fox|crane|whale|dolphin|wolf|species|fauna|wildlife|encounter|sighting)|in\s*the\s*wild|natural\s*habitat|放鳥|野放し(?:飼い)?|自然下|wildlife\s*(?:reserve|sanctuary|tour|watch))/iu,
    semantic_tags: ["wild", "natural habitat"],
    rationale_en: "Wild (野生) — user wants animals in their natural habitat, NOT zoos / aquariums / captive facilities. Pair with bird / mammal / sea-life query — demote zoo, aquarium, animal park.",
    rationale_ja: "野生の動物観察意図。動物園・水族館・サファリパーク等は demote すべき。",
    polarity: "boost",
  },
  {
    id: "dying_craft",
    // Match user phrasing about disappearing / endangered / dying craft.
    // Faithful integration: this surfaces a constraint hint; it does not
    // tag entities ourselves. Records that are described as "dying" by
    // their official source (METI 伝統的工芸品 危機, Wikipedia 廃絶, etc.)
    // can carry a `dying_craft` semantic tag in their kinds enrichment.
    re: /(失われ(?:つつある|ゆく|ようとしている)|絶滅危惧|消えゆく|廃れ(?:つつ|た|ゆく)|存続の危機|後継者(?:不足|難)|残り少ない|風前の灯|dying\s*(?:craft|art|tradition|trade)|disappearing\s*(?:craft|art|tradition|trade)|endangered\s*craft|on\s*the\s*verge\s*of\s*extinction|nearly\s*extinct|last\s*(?:practitioners?|artisans?|masters?))/iu,
    routing_tool: "get_traditional_arts",
    semantic_tags: ["dying craft", "endangered craft", "disappearing tradition"],
    rationale_en: "Dying / endangered craft — user wants traditional crafts at risk of disappearing. Prefer get_traditional_arts; surface entries whose official descriptions indicate succession crisis or near-extinction.",
    rationale_ja: "失われゆく伝統工芸・後継者不足の craft 等。get_traditional_arts を推奨。official source の記述で承継困難 / 絶滅危惧と分かる entry を浮かせる。",
    polarity: "boost",
  },
];

// ──────────────────────────────────────────────────────────────────────
// Detection / extraction

export interface DetectedConcept {
  id: string;
  rationale_en: string;
  rationale_ja: string;
  matched_text: string;
  polarity: "boost" | "demote";
  routing_tool?: string;
  target_kinds?: string[];
  target_heritage_qids?: string[];
  semantic_tags?: string[];
}

export interface OriginConstraint {
  /** Detected origin city / station (free-form, normalised lowercase ASCII or original Japanese). */
  city: string;
  /** Original matched substring from the query for debugging. */
  matched_text: string;
}

export interface IntentExtractionResult {
  /** Detected concepts in order of appearance. */
  concepts: DetectedConcept[];
  /** Union of recommended kinds (if any concept maps a kinds slot). */
  recommended_kinds: Set<string>;
  /** Union of recommended P1435 designation QIDs. */
  recommended_heritage_qids: Set<string>;
  /** Aggregated semantic_tags for embed match补強. */
  semantic_tags: string[];
  /** First concept that mentions a routing_tool (to give the agent a redirect hint). */
  preferred_tool?: string;
  /**
   * Popularity modifier surfaced to the ranking layer and the calling agent:
   *   - "demote_popular": user asked for anaba / uncrowded → demote heritage-heavy + multilingual entries
   *   - "boost_popular": (reserved) user explicitly asked for famous / iconic destinations
   * Resolved from anaba_hidden, uncrowded, secret_hidden_onsen concepts.
   */
  popularity_modifier?: "demote_popular" | "boost_popular";
  /**
   * Wild-vs-captive modifier — when "wild_not_captive" concept matched, the
   * agent / Solver should demote zoo / aquarium / animal park results.
   */
  wild_only?: boolean;
  /**
   * Origin city / station constraint — when the user's query implies a
   * travel-from anchor ("Tokyo から", "from Osaka"). Surfaced for Solver
   * / agent to compute reachability; the server itself does not yet narrow
   * results by origin.
   */
  origin_constraint?: OriginConstraint;
  /**
   * Budget cap detected in the query. When present, tool callers should
   * filter / demote records whose price_band exceeds the cap. Free / cheap
   * cues map to "low"; "luxury" cues map to "luxury" with a separate floor.
   */
  price_band_cap?: "free" | "low" | "mid" | "high" | "luxury";
  /** Reverse — user explicitly asked for high-end / luxury experiences. */
  price_band_floor?: "high" | "luxury";
  /**
   * Weather adaptability hint — when the query implies indoor activities
   * (rainy day, heatstroke avoidance, "things to do when it rains").
   */
  weather_constraint?: "indoor" | "outdoor";
  /**
   * Lexical-disambiguation tokens that must NOT appear in a candidate
   * entity name (substring match). Used to suppress false positives
   * where a homograph in the query collides with an unrelated entity:
   *   - "firefly" (蛍 the insect) should not surface ホタルイカ (firefly squid)
   *   - "crane" (the bird) should not surface 鶴見区 / 鶴岡 / 舞鶴 etc.
   * The downstream filter is applied at the candidate boundary in
   * search_area / get_spots when the entity name contains any token.
   */
  lexical_exclusions?: string[];
  /**
   * Infeasibility signal — the query asks for something that is not
   * realistically possible in Japan (auroras, camel safaris, polar bear
   * habitat, etc.). When set, tools surface a `not_available` block at
   * the response top with a one-line rationale and an `alt_kinds` list
   * the agent can pivot to (e.g. aurora → dark_sky / star observatory).
   */
  infeasibility?: {
    reason_en: string;
    reason_ja: string;
    alt_kinds: string[];
  };
  /**
   * Negative-constraint tokens. Entities whose name or admin path contains
   * any token are dropped from candidate sets in search_area / get_spots.
   * Surfaces from explicit "NOT X" / "X 以外" / "except X" / "X 抜き" patterns.
   */
  negative_constraints?: string[];
}

// Concepts that imply demote-popular ranking (anaba family).
const DEMOTE_POPULAR_CONCEPT_IDS = new Set([
  "anaba_hidden",
  "uncrowded",
  "secret_hidden_onsen",
]);

// Origin-city extraction. Captures "from X", "X発", "X から", "X 出発" etc.
// We capture both English city tokens and Japanese tokens (kanji / kana).
// The captured city is normalised via normaliseOriginCity below.
//
// Patterns covered:
//   - "from Tokyo" / "from Kyoto" (English)
//   - "東京から" / "京都から" / "大阪 出発" / "名古屋発"
//   - "出発地: 東京" / "starting from Osaka"
const ORIGIN_RE_LIST: RegExp[] = [
  /\bfrom\s+([A-Za-z][A-Za-zÀ-ſ\s\-']{1,40}?)(?=\s*(?:,|\.|;|\?|!|:)|\s+(?:to|by|in|on|via|using|with|and)\b|$)/iu,
  /\bstarting\s+from\s+([A-Za-z][A-Za-zÀ-ſ\s\-']{1,40}?)(?=\s*(?:,|\.|;|\?|!|:)|\s+(?:to|by|in|on|via|using|with|and)\b|$)/iu,
  /\b(?:departing|leaving)\s+(?:from\s+)?([A-Za-z][A-Za-zÀ-ſ\s\-']{1,40}?)(?=\s*(?:,|\.|;|\?|!|:)|\s+(?:to|by|in|on|via|using|with|and)\b|$)/iu,
  /([一-鿿぀-ゟ゠-ヿ]{2,12})\s*(?:から|発|より|を出発|を起点)/u,
  /出発地[:：]\s*([一-鿿぀-ゟ゠-ヿ]{2,12}|[A-Za-z][A-Za-zÀ-ſ\s\-']{1,40})/u,
];

function normaliseOriginCity(raw: string): string {
  const trimmed = raw.trim().replace(/\s+/g, " ");
  // Drop trailing prepositions / connectors that the regex may have caught.
  return trimmed.replace(/[、,。.]\s*$/u, "");
}

// Spatial / positional nouns that are not origins. The CJK from-pattern
// would otherwise catch them (e.g. 裏側から見る東京タワー → "裏側" mistaken
// for an origin).
const ORIGIN_STOP_TOKENS = new Set([
  "裏側", "正面", "横", "上", "下", "中", "前", "後", "右", "左", "外", "内",
  "そこ", "ここ", "あそこ", "今", "昔", "後ろ", "向こう", "近所", "遠く",
  "頂上", "麓", "海側", "山側", "川", "海", "山", "空", "中心",
]);

// ──────────────────────────────────────────────────────────────────────
// Budget / weather constraint detectors
//
// These run alongside the travel-concept dictionary; they surface the
// explicit price_band cap or indoor/outdoor preference so the tool layer
// can filter records mechanically (the dictionary's polarity boost would
// be too coarse — a budget cue should *exclude* luxury results, not just
// down-rank them).

const BUDGET_FREE_RE = /(無料(で|の)?|入場無料|free\s*(entry|admission)|no\s*(entrance|admission)\s*fee)/iu;
const BUDGET_CHEAP_RE = /(\bcheap\b|\bbudget\b|\baffordable\b|\binexpensive\b|安い|格安|お(?:財布|金).*に(?:優しい|やさしい)|低予算|節約|リーズナブル|お手頃)/iu;
const BUDGET_LUXURY_RE = /(luxur(y|ious)|high[-\s]?end|premium|upscale|opulent|高級|ラグジュアリー|高(?:価|級)?ホテル|贅沢|プレミアム|セレブ|超一流|高(?:価格)?帯)/iu;

const WEATHER_INDOOR_RE = /(rainy\s*day|when\s*it\s*rains|wet\s*weather|indoor(s)?(\s*activities?)?|under\s*(a\s*)?roof|escape\s*the\s*rain|雨(の日|でも|が降っ?た)|室内|屋内|インドア|雨天(時)?(?!.{0,8}中止)|梅雨|ゲリラ豪雨)/iu;
const WEATHER_OUTDOOR_RE = /(outdoor(s)?|outside|fresh\s*air|in\s*the\s*open|アウトドア|屋外|野外)/iu;

function detectBudgetCap(q: string): IntentExtractionResult["price_band_cap"] | undefined {
  if (BUDGET_FREE_RE.test(q)) return "free";
  if (BUDGET_CHEAP_RE.test(q)) return "low";
  return undefined;
}

function detectBudgetFloor(q: string): IntentExtractionResult["price_band_floor"] | undefined {
  if (BUDGET_LUXURY_RE.test(q)) return "luxury";
  return undefined;
}

function detectWeather(q: string): IntentExtractionResult["weather_constraint"] | undefined {
  if (WEATHER_INDOOR_RE.test(q)) return "indoor";
  if (WEATHER_OUTDOOR_RE.test(q)) return "outdoor";
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────
// Infeasibility detector — queries asking for things that are not
// realistically available in Japan. Multi-judge feedback flagged L3-07
// (aurora) as the canonical case; the server returned dark-sky parks /
// observatories / Okinawan beaches as if they answered the aurora intent.
// We surface an explicit `not_available` block instead so the agent can
// disclaim and pivot.
//
// Each rule has a regex that must match BOTH the impossibility token AND
// the Japan / 日本 marker (when applicable), to avoid blocking legitimate
// "aurora" queries about Iceland from passing through.

const INFEASIBILITY_RULES: {
  re: RegExp;
  reason_en: string;
  reason_ja: string;
  alt_kinds: string[];
}[] = [
  {
    re: /(aurora|northern\s*lights|オーロラ|極光)/iu,
    reason_en: "Auroras are essentially not visible from Japan; the country sits well south of the auroral oval. Extremely rare displays have been recorded in Hokkaido during major solar storms but are not a viable tourism plan.",
    reason_ja: "オーロラは日本ではほぼ見られません (オーロラオーバルから南に外れているため)。 大規模太陽嵐の極稀な機会に北海道で観測例がありますが、 観光予定として組むには非現実的です。",
    alt_kinds: ["dark_sky", "observatory"],
  },
  {
    re: /(camel\s*safari|ラクダ\s*サファリ|camel\s*ride|ラクダ\s*ライド|ラクダで)/iu,
    reason_en: "There are no commercial camel safaris in Japan. The only domestic camels are in zoos.",
    reason_ja: "日本ではラクダサファリは商業運営されていません。 国内のラクダは動物園のみです。",
    alt_kinds: ["sand_dune", "zoo"],
  },
  {
    re: /(polar\s*bear\s*(habitat|wild|spot|encounter|safari)|野生.*ホッキョクグマ|wild\s*polar\s*bear)/iu,
    reason_en: "Polar bears are not native to Japan. They exist only in zoos / aquariums (Asahiyama Zoo etc.).",
    reason_ja: "ホッキョクグマは日本に生息していません。 動物園 / 水族館 (旭山動物園など) でのみ見られます。",
    alt_kinds: ["zoo", "aquarium"],
  },
  {
    re: /(kangaroo\s*(wild|encounter|habitat)|野生.*カンガルー)/iu,
    reason_en: "Kangaroos are not native to Japan. They exist only in zoos.",
    reason_ja: "カンガルーは日本に生息していません。 動物園のみです。",
    alt_kinds: ["zoo"],
  },
  {
    re: /(big\s*5\s*safari|ライオン.*サファリ|アフリカ\s*サファリ)/iu,
    reason_en: "African big-five safari is not available in Japan. Sub-tropical wildlife is concentrated in zoos / safari parks (Fuji Safari Park, etc.).",
    reason_ja: "アフリカ式 big-five サファリは日本にはありません。 富士サファリパーク等の動物園 / サファリパーク形式があります。",
    alt_kinds: ["zoo"],
  },
];

function detectInfeasibility(q: string): IntentExtractionResult["infeasibility"] | undefined {
  for (const rule of INFEASIBILITY_RULES) {
    if (rule.re.test(q)) {
      return {
        reason_en: rule.reason_en,
        reason_ja: rule.reason_ja,
        alt_kinds: rule.alt_kinds,
      };
    }
  }
  return undefined;
}

// ──────────────────────────────────────────────────────────────────────
// Negative-constraint detector — extracts tokens following NOT / 以外 /
// except / 抜き patterns. Each captured token is appended to the
// `negative_constraints` set; downstream tools drop entities whose name
// or admin_path matches.
//
// Examples:
//   "Tottori 以外の砂丘" → ["Tottori", "鳥取"]
//   "Onsen towns NOT in Hokkaido" → ["Hokkaido", "北海道"]
//   "buke yashiki except Kyoto" → ["Kyoto", "京都"]

const NEGATIVE_RE_LIST: RegExp[] = [
  // CJK: "X 以外" / "X 抜き" / "X 除く"
  /([一-鿿぀-ゟ゠-ヿA-Za-z]{2,12})\s*(?:以外|抜き|除いて|を除く|を除外)/u,
  // English: "not X" / "except X" / "excluding X"
  /\b(?:not|except|excluding|other\s*than|outside\s*of|no)\s+([一-鿿぀-ゟ゠-ヿA-Za-z][一-鿿぀-ゟ゠-ヿA-Za-z\s\-']{1,30}?)(?=\s*(?:,|\.|;|\?|!|:|$)|\s+(?:in|at|to|or|but|and|with|near)\b)/iu,
];

const NEGATIVE_STOP_TOKENS = new Set([
  "the", "a", "an", "this", "that", "where", "when", "what", "any",
  "の", "は", "が", "を", "に", "で", "と",
]);

// Common toponym aliases — when the user writes English, also exclude
// the JA equivalent (and vice versa) so an entity tagged in either
// language is filtered.
const TOPONYM_ALIASES: Record<string, string[]> = {
  "tottori": ["鳥取", "鳥取県"],
  "kyoto": ["京都", "京都府", "京都市"],
  "hokkaido": ["北海道"],
  "tokyo": ["東京", "東京都"],
  "osaka": ["大阪", "大阪府", "大阪市"],
  "kanagawa": ["神奈川", "神奈川県"],
  "okinawa": ["沖縄", "沖縄県"],
  "鳥取": ["Tottori"],
  "京都": ["Kyoto"],
  "北海道": ["Hokkaido"],
  "東京": ["Tokyo"],
  "大阪": ["Osaka"],
  "沖縄": ["Okinawa"],
};

function detectNegativeConstraints(q: string): string[] | undefined {
  const out = new Set<string>();
  for (const re of NEGATIVE_RE_LIST) {
    const m = q.match(re);
    if (!m || !m[1]) continue;
    let tok = m[1].trim().replace(/\s+/g, " ");
    // Strip leading English prepositions that the loose regex grabbed
    // along with the toponym (e.g. "not in Hokkaido" → captures "in
    // Hokkaido"; we want "Hokkaido").
    tok = tok.replace(/^(?:in|at|to|on|of|for|near|around)\s+/i, "").trim();
    if (tok.length === 0) continue;
    const lower = tok.toLowerCase();
    if (NEGATIVE_STOP_TOKENS.has(lower) || NEGATIVE_STOP_TOKENS.has(tok)) continue;
    out.add(tok);
    // Add aliases
    const aliases = TOPONYM_ALIASES[lower] ?? TOPONYM_ALIASES[tok];
    if (aliases) for (const a of aliases) out.add(a);
  }
  return out.size > 0 ? [...out] : undefined;
}

function detectOrigin(q: string): OriginConstraint | undefined {
  for (const re of ORIGIN_RE_LIST) {
    const m = q.match(re);
    if (m && m[1]) {
      const city = normaliseOriginCity(m[1]);
      if (city.length === 0) continue;
      // Skip generic words that the loose regex may catch.
      if (/^(the|a|an|here|there|home|work|now|today|yesterday|tomorrow)$/i.test(city)) continue;
      if (ORIGIN_STOP_TOKENS.has(city)) continue;
      return { city, matched_text: m[0] };
    }
  }
  return undefined;
}

/**
 * Run the travel concept dictionary over a free-form query string and
 * return a structured intent record.
 *
 * Idempotent / no I/O. Safe to call from any tool path.
 */
export function extractTravelIntent(q: string): IntentExtractionResult {
  const concepts: DetectedConcept[] = [];
  const recommended_kinds = new Set<string>();
  const recommended_heritage_qids = new Set<string>();
  const semantic_tags: string[] = [];
  let preferred_tool: string | undefined;
  let popularity_modifier: "demote_popular" | "boost_popular" | undefined;
  let wild_only = false;
  let origin_constraint: OriginConstraint | undefined;

  if (!q || q.length === 0) {
    return {
      concepts,
      recommended_kinds,
      recommended_heritage_qids,
      semantic_tags,
      preferred_tool,
    };
  }

  for (const c of TRAVEL_CONCEPTS) {
    const m = q.match(c.re);
    if (!m) continue;
    const polarity = c.polarity ?? "boost";
    concepts.push({
      id: c.id,
      rationale_en: c.rationale_en,
      rationale_ja: c.rationale_ja,
      matched_text: m[0],
      polarity,
      routing_tool: c.routing_tool,
      target_kinds: c.target_kinds,
      target_heritage_qids: c.target_heritage_qids,
      semantic_tags: c.semantic_tags,
    });
    if (polarity === "boost") {
      for (const k of c.target_kinds ?? []) recommended_kinds.add(k);
      for (const qid of c.target_heritage_qids ?? []) recommended_heritage_qids.add(qid);
      for (const t of c.semantic_tags ?? []) semantic_tags.push(t);
      if (!preferred_tool && c.routing_tool) preferred_tool = c.routing_tool;
    }
    if (DEMOTE_POPULAR_CONCEPT_IDS.has(c.id)) {
      popularity_modifier = "demote_popular";
    }
    if (c.id === "wild_not_captive") {
      wild_only = true;
    }
  }

  origin_constraint = detectOrigin(q);
  const price_band_cap = detectBudgetCap(q);
  const price_band_floor = detectBudgetFloor(q);
  const weather_constraint = detectWeather(q);
  const infeasibility = detectInfeasibility(q);
  const negative_constraints = detectNegativeConstraints(q);

  // Lexical disambiguation: queries that mention 蛍 / "firefly" without
  // mentioning イカ / squid should NOT surface ホタルイカ (firefly squid).
  // Same pattern can be extended (kani vs カニサボテン etc.) but we keep
  // the list short — only confirmed judge-flagged cases.
  const lexicalExclusions: string[] = [];
  const HAS_HOTARU = /(蛍|firefly|hotaru)/i.test(q);
  const HAS_SQUID = /(squid|イカ|烏賊)/i.test(q);
  if (HAS_HOTARU && !HAS_SQUID) {
    lexicalExclusions.push("ホタルイカ", "蛍烏賊", "蛍イカ");
  }
  // 鶴 (crane bird) vs 鶴 substring in toponyms (鶴見区 / 鶴岡 / 舞鶴)
  // → memory 0509 j2 batch 3 flagged L3-25 explicitly.
  const HAS_CRANE = /(\bcrane\b|タンチョウ|丹頂|ツル.*越冬|ツル渡来|鶴の越冬|鶴渡来)/i.test(q);
  const HAS_TOPONYM = /(\b(tsurumi|tsuruoka|maizuru|tsuruga|tsuru-ga)\b|鶴見|鶴岡|舞鶴|敦賀)/i.test(q);
  if (HAS_CRANE && !HAS_TOPONYM) {
    lexicalExclusions.push("鶴見区", "鶴岡", "舞鶴", "敦賀", "鶴ヶ城", "鶴山");
  }
  // 出羽 (Yamagata pilgrimage) vs 出羽島 (Tokushima island).
  // L1-18 query "Dewa Sanzan in Yamagata" surfaced 出羽島 (Tebajima, Tokushima)
  // ranked above 出羽三山 because the substring 出羽 matched both. When
  // dewa-sanzan / dewa-mountain context is present without island context,
  // exclude the Tokushima island.
  const HAS_DEWA_SANZAN = /(出羽三山|dewa\s*sanzan|three\s*mountains?\s*of\s*dewa|羽黒|月山|湯殿|gassan|haguro|yudono)/iu.test(q);
  const HAS_TEBAJIMA_CONTEXT = /(出羽島|tebajima|teba.?island|徳島.*牟岐)/iu.test(q);
  if (HAS_DEWA_SANZAN && !HAS_TEBAJIMA_CONTEXT) {
    lexicalExclusions.push("出羽島", "Tebajima");
  }
  // 那智の滝 (waterfall) vs 那智滝図 (Kamakura-period painting of the waterfall).
  // L1-16 / similar query "Nachi waterfall" surfaces 那智滝図 because the
  // P31 of the painting is Q3305213 which is a separate domain. When the
  // query is about the place / pilgrimage rather than the artwork, drop
  // the painting from results.
  const HAS_NACHI_PLACE = /(那智|nachi)/iu.test(q);
  const HAS_PAINTING_CONTEXT = /(絵画|painting|figure|figurines?|障壁画|掛軸|Kakemono|絵図)/iu.test(q);
  if (HAS_NACHI_PLACE && !HAS_PAINTING_CONTEXT) {
    lexicalExclusions.push("那智滝図");
  }

  return {
    concepts,
    recommended_kinds,
    recommended_heritage_qids,
    semantic_tags,
    preferred_tool,
    ...(popularity_modifier ? { popularity_modifier } : {}),
    ...(wild_only ? { wild_only } : {}),
    ...(origin_constraint ? { origin_constraint } : {}),
    ...(price_band_cap ? { price_band_cap } : {}),
    ...(price_band_floor ? { price_band_floor } : {}),
    ...(weather_constraint ? { weather_constraint } : {}),
    ...(lexicalExclusions.length > 0 ? { lexical_exclusions: lexicalExclusions } : {}),
    ...(infeasibility ? { infeasibility } : {}),
    ...(negative_constraints ? { negative_constraints } : {}),
  };
}

// ──────────────────────────────────────────────────────────────────────
// Active routing hint
//
// When the detected intent's preferred tool differs from the current tool
// being called, the server surfaces an explicit `routing_hint` block so
// the calling agent knows to try the suggested tool. Distinct from
// `query_intent.suggested_tool` (passive metadata) — `routing_hint` is
// active guidance with a rationale and a sample call template.
// Iter 59: concept-aware arg_template. The matched concept
// id maps to specific tool args so the agent doesn't have to guess
// (e.g. shukubo → hotel_type: "shukubo"). Without this, judge L2-02
// (henro shukubo) returned generic ryokan because the routing hint
// only said "get_hotels" with placeholder "<inferred from concept>".
const CONCEPT_TO_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  shukubo: { hotel_type: "shukubo" },
  kominka: { hotel_type: "kominka" },
  kominka_stay: { hotel_type: "kominka" },
  ryokan: { hotel_type: "ryokan" },
  secret_hidden_onsen: { hotel_type: "onsen_ryokan" },
  matsuri: { /* uses prefecture + q */ },
  hanabi: { q: "花火" },
  yuki_matsuri: { q: "雪まつり" },
  ukiyoe: { keyword: "浮世絵" },
  kogei_crafts: { /* uses prefecture */ },
  yakimono_pottery: { q: "陶磁器" },
  local_specialty: { /* uses prefecture */ },
  dyeing_technique: { category: "craft" },
  chado_school: { q: "茶道" },
  shojin_ryori: { q: "精進料理" },
  island_archipelago: { /* uses prefecture + q with island keyword */ },
};

const BASE_TOOL_ARGS: Record<string, Record<string, unknown>> = {
  get_hotels: { prefecture: "<pref>" },
  get_events: { prefecture: "<pref>" },
  get_traditional_arts: { prefecture: "<pref>" },
  get_local_specialty: { prefecture: "<pref>" },
  get_japan_heritage: { prefecture: "<pref>" },
  get_dmo: { prefecture: "<pref>" },
};

export function buildRoutingHint(
  currentTool: string,
  r: IntentExtractionResult,
): Record<string, unknown> | undefined {
  if (!r.preferred_tool || r.preferred_tool === currentTool) return undefined;
  const concept = r.concepts.find((c) => c.routing_tool === r.preferred_tool);
  if (!concept) return undefined;
  const baseArgs = BASE_TOOL_ARGS[r.preferred_tool] ?? {};
  const conceptArgs = CONCEPT_TO_TOOL_ARGS[concept.id] ?? {};
  return {
    suggested_tool: r.preferred_tool,
    reason_en: concept.rationale_en,
    reason_ja: concept.rationale_ja,
    matched_concept: concept.id,
    matched_text: concept.matched_text,
    arg_template: { ...baseArgs, ...conceptArgs },
  };
}

/**
 * Render the IntentExtractionResult as a compact `query_intent` field for
 * MCP responses. Returns undefined when nothing matched (so the field stays
 * absent rather than empty).
 */
export function renderQueryIntent(
  r: IntentExtractionResult,
): Record<string, unknown> | undefined {
  const hasConcept = r.concepts.length > 0;
  const hasModifier =
    !!r.popularity_modifier || !!r.wild_only || !!r.origin_constraint
    || !!r.price_band_cap || !!r.price_band_floor || !!r.weather_constraint
    || !!r.infeasibility || (r.negative_constraints && r.negative_constraints.length > 0);
  if (!hasConcept && !hasModifier) return undefined;
  return {
    detected_concepts: r.concepts.map((c) => ({
      id: c.id,
      matched_text: c.matched_text,
      rationale_en: c.rationale_en,
      polarity: c.polarity,
      ...(c.routing_tool ? { routing_tool: c.routing_tool } : {}),
      ...(c.target_kinds && c.target_kinds.length > 0
        ? { target_kinds: c.target_kinds }
        : {}),
      ...(c.target_heritage_qids && c.target_heritage_qids.length > 0
        ? { target_heritage_qids: c.target_heritage_qids }
        : {}),
    })),
    ...(r.preferred_tool ? { suggested_tool: r.preferred_tool } : {}),
    ...(r.popularity_modifier
      ? { popularity_modifier: r.popularity_modifier }
      : {}),
    ...(r.wild_only ? { wild_only: true } : {}),
    ...(r.origin_constraint ? { origin_constraint: r.origin_constraint } : {}),
    ...(r.price_band_cap ? { price_band_cap: r.price_band_cap } : {}),
    ...(r.price_band_floor ? { price_band_floor: r.price_band_floor } : {}),
    ...(r.weather_constraint ? { weather_constraint: r.weather_constraint } : {}),
    ...(r.infeasibility ? { infeasibility: r.infeasibility } : {}),
    ...(r.negative_constraints && r.negative_constraints.length > 0
      ? { negative_constraints: r.negative_constraints } : {}),
    ...(r.lexical_exclusions && r.lexical_exclusions.length > 0
      ? { lexical_exclusions: r.lexical_exclusions } : {}),
  };
}
