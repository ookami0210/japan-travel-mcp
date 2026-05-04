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
    target_kinds: ["natural_monument"],
    target_heritage_qids: ["Q43113623", "Q11414752"], // 天然記念物 / 名勝
    semantic_tags: ["sand dune", "tottori"],
    rationale_en: "Sand dune — primarily Tottori Sakyu and a handful of smaller dunes.",
    rationale_ja: "砂丘。鳥取砂丘が代表、他は小規模。",
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
    re: /(ローカル線|ローカル鉄道|local\s*rail(way)?|country\s*train|secondary\s*line|赤字路線|鈍行|普通列車|閑散線区|ロー\s*カル鉄)/iu,
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
    re: /(星空|stargaz|night\s*sky|dark\s*sky|天体観測|プラネタリウム|planetarium|流星群|meteor\s*shower)/iu,
    target_kinds: ["national_park", "observation"],
    semantic_tags: ["stargazing", "dark sky", "astronomy"],
    rationale_en: "Stargazing — high-altitude observatories or designated dark-sky regions (Bisei, Iriomote, Hatoyama).",
    rationale_ja: "星空観測。美星・西表・鳩山等が代表。",
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
    target_heritage_qids: ["Q11414752"], // 名勝
    target_kinds: ["park", "preservation_district"],
    semantic_tags: ["cherry blossom", "sakura"],
    rationale_en: "Cherry blossom viewing — peak typically late March to early April for honshu.",
    rationale_ja: "桜・お花見。本州は 3 月下旬〜4 月上旬がピーク。",
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
    routing_tool: "get_events",
    semantic_tags: ["snow festival"],
    rationale_en: "Yuki Matsuri — snow festival, Sapporo most famous.",
    rationale_ja: "雪まつり。さっぽろ雪まつりが代表。",
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
  }

  return {
    concepts,
    recommended_kinds,
    recommended_heritage_qids,
    semantic_tags,
    preferred_tool,
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
  ryokan: { hotel_type: "ryokan" },
  secret_hidden_onsen: { hotel_type: "onsen_ryokan" },
  matsuri: { /* uses prefecture + q */ },
  hanabi: { q: "花火" },
  yuki_matsuri: { q: "雪まつり" },
  ukiyoe: { keyword: "浮世絵" },
  kogei_crafts: { /* uses prefecture */ },
  yakimono_pottery: { q: "陶磁器" },
  local_specialty: { /* uses prefecture */ },
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
  if (r.concepts.length === 0) return undefined;
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
  };
}
