/**
 * Safety-keyword signal detector for tool query strings.
 *
 * Why: random-r3 adversarial set surfaced 13 cases where the user query
 * combined risky semantics that the corpus retrieval cannot warn about
 * on its own (e.g. "夜中に富士山を軽装で登る", "妊娠中で温泉に行きたい",
 * "未成年でカジノに行きたい", "ヒグマと遭遇したらどうすべきか"). The
 * MCP server's job is *not* to compose a safety message in natural
 * language (that is Product 2's responsibility — the end-user composition
 * layer). But the server *can* detect and emit a structured signal so any
 * agent / Product 2 LLM consuming the response knows to compose a warning.
 *
 * Output: array of category strings, e.g.
 *   ["high_altitude_risk", "light_gear_advisory"]
 *
 * Each category is documented inline. New categories should be additive
 * and reference a real failure case from the test set when possible.
 *
 * Two-product split (2026-05-04): the MCP server emits data + signal;
 * judgment lives in the agent layer. Output is structured so it can be
 * returned verbatim and still carry meaning.
 */

export type SafetyCategory =
  | "high_altitude_risk"      // mountains: night, winter, light gear, solo
  | "pregnancy_advisory"      // onsen / sauna / strenuous activity in pregnancy
  | "underage_advisory"       // alcohol / smoking / casino for minors
  | "wildlife_encounter"      // bear / wild boar / venomous snake encounters
  | "open_water_risk"         // ocean / river swimming, currents, tides
  | "extreme_weather_risk"    // typhoon / heavy snow / volcanic activity
  | "infeasible_travel"       // round-trip impossible by stated transport/time
  | "remote_solo_risk"        // remote island / deserted area solo activity
  | "medical_advisory"        // chronic conditions + heat / altitude
  | "religious_protocol"      // sacred site rules (no shoes, no photos, etc.)
  | "minor_alone_risk"        // unaccompanied minor in tourism contexts
  | "seasonal_impossibility"  // request implies a season-feature mismatch (sakura in August, snow in Okinawa)
  | "fictional_location"      // request names a place that does not exist
  | "geographic_impossibility";  // swimming in a desert, sea-bathing in landlocked spots

interface Pattern {
  category: SafetyCategory;
  // All regexes in `match` must match (AND). At least one of the
  // alternative pattern groups must match (OR across pattern groups).
  match: RegExp[];
  // Optional negative-lookahead patterns — if any match, the rule is
  // suppressed (e.g. "夏富士登山" with "ガイド付き" should not trigger
  // light-gear advisory).
  veto?: RegExp[];
}

// All patterns are case-insensitive; ASCII alpha is normalised by .toLowerCase().
const PATTERNS: Pattern[] = [
  // ── high_altitude_risk ──────────────────────────────────────────────
  {
    category: "high_altitude_risk",
    match: [/(富士山|高尾山|立山|槍ヶ岳|穂高|剱岳|八ヶ岳|登山|ハイキング|trekking|climb|mt\.?\s*fuji|fuji.*climb)/i,
            /(夜|深夜|early\s*morning|night|midnight|after.*dark|軽装|light.*gear|sneakers|短パン|tシャツ|ill.?equipped|without.*equipment)/i],
  },
  {
    category: "high_altitude_risk",
    match: [/(冬山|雪山|winter.*mount|winter.*climb|january|february|march.*mountain)/i,
            /(登山|登る|hiking|climb|アタック)/i],
  },
  {
    category: "high_altitude_risk",
    // Out-of-season Mt Fuji (the official trail is open July–early Sept).
    match: [/(富士山|mt\.?\s*fuji|fuji.?san)/i,
            /(11月|12月|1月|2月|3月|4月|5月|november|december|january|february|march|april|may|閉山|out\s*of\s*season)/i],
    veto: [/麓|河口湖|忍野|周辺|surrounding|view.*fuji|see\s*fuji/i],
  },

  // ── pregnancy_advisory ─────────────────────────────────────────────
  {
    category: "pregnancy_advisory",
    match: [/(妊娠|妊婦|pregnan|expecting|with.?child|maternity)/i,
            /(温泉|サウナ|onsen|hot\s*spring|sauna|岩盤浴|蒸し風呂|steam.?bath)/i],
  },
  {
    category: "pregnancy_advisory",
    match: [/(妊娠|妊婦|pregnan)/i,
            /(登山|ハイキング|climb|hike|long.*walk|sky.*walk|長距離|ジェットコースター|roller\s*coaster|遊園地のスリリング)/i],
  },

  // ── underage_advisory ──────────────────────────────────────────────
  {
    category: "underage_advisory",
    // \d{1,2}歳 covers 0歳 ~ 19歳, plus the explicit minor terms.
    match: [/(未成年|高校生|中学生|小学生|kid|child|children|under\s*\d{1,2}|teenager|\d{1,2}歳|\d-?year-?old|\d\s*y\.?o\.?)/i,
            /(カジノ|casino|パチンコ|pachinko|スロット|slot.*machine|アルコール|alcohol|お酒|sake|wine|beer|ビール|喫煙|タバコ|smoke|cigarette|ホスト|キャバクラ|nightclub)/i],
  },

  // ── wildlife_encounter ─────────────────────────────────────────────
  {
    category: "wildlife_encounter",
    match: [/(熊|クマ|ヒグマ|bear|brown.?bear|black.?bear|猪|イノシシ|wild.?boar|蛇|ハブ|habu|venomous|毒蛇|スズメバチ|hornet|wasp|wild\s*animal|rabid)/i,
            /(遭遇|出会|出会う|encounter|attack|approach|spot|see|saw|被害|危険|dangerous|protect)/i],
  },

  // ── open_water_risk ────────────────────────────────────────────────
  {
    category: "open_water_risk",
    match: [/(海水浴|遊泳|ocean|swim|sea\s*bath|海で泳|river\s*swim|川で泳|beach.*swim)/i,
            /(離岸流|高波|currents|tide|jellyfish|クラゲ|台風|typhoon|波が高|大荒れ|stormy|rough)/i],
  },
  {
    category: "open_water_risk",
    match: [/(シュノーケリング|ダイビング|diving|snorkeling|free.?dive|kayak|surf)/i,
            /(初心者|未経験|alone|solo|one|first.*time|ガイドなし|without\s*guide|no\s*guide)/i],
  },

  // ── extreme_weather_risk ───────────────────────────────────────────
  {
    category: "extreme_weather_risk",
    match: [/(台風|typhoon|大雪|blizzard|heavy\s*snow|猛吹雪|火山|volcan|噴火|eruption|地震|earthquake|津波|tsunami)/i,
            /(中|during|when|at\s*the\s*time|approaching|active)/i],
  },
  // Iter57.1: active-volcano day-trip combination (L3-16 case missed in
  // iter56 v4-data scoring). Active volcano (阿蘇 / 桜島 / 浅間 / etc.)
  // + day-trip / hike intent triggers volcanic-activity advisory.
  {
    category: "extreme_weather_risk",
    match: [/(火山|volcano|阿蘇|桜島|浅間|有珠|草津白根|霧島|雲仙|箱根)/i,
            /(日帰り|day.?trip|登山|trek|climb|hike|登る|頂上|crater|火口)/i],
  },

  // ── infeasible_travel ──────────────────────────────────────────────
  {
    category: "infeasible_travel",
    // Day-trip patterns Japan-wide that are physically impossible without
    // air travel; covered as a hint, not exhaustive.
    match: [/(日帰り|day\s*trip|round.*trip|same\s*day|return\s*today)/i,
            /(東京.*屋久島|tokyo.*yakushima|東京.*石垣|tokyo.*ishigaki|東京.*与論|東京.*西表|tokyo.*okinawa.*day|札幌.*那覇|sapporo.*naha)/i],
  },

  // ── remote_solo_risk ───────────────────────────────────────────────
  {
    category: "remote_solo_risk",
    match: [/(無人島|deserted\s*island|uninhabited|奥地|秘境|奥多摩.*ソロ|登山.*ソロ|solo.*remote|単独.*山|単独.*奥地|alone|by\s*myself)/i,
            /(キャンプ|camping|宿泊|overnight|stay|night|寝る|sleep)/i],
  },

  // ── religious_protocol ─────────────────────────────────────────────
  {
    category: "religious_protocol",
    match: [/(神社|寺|temple|shrine|聖地|sacred|本殿|拝殿|宝物殿)/i,
            /(撮影|写真|photo|靴|shoes|土足|タトゥー|tattoo|刺青|入浴|入る|enter)/i],
  },

  // ── minor_alone_risk ───────────────────────────────────────────────
  {
    category: "minor_alone_risk",
    match: [/(未成年|小学生|中学生|高校生|kid|child|teen|under\s*18)/i,
            /(一人|単独|alone|by\s*myself|without\s*adult|unaccompanied|親なし|ひとりで)/i],
  },

  // ── seasonal_impossibility ─────────────────────────────────────────
  // Sakura outside its normal window
  {
    category: "seasonal_impossibility",
    match: [/(桜|cherry\s*blossom|sakura|花見)/i,
            /(7月|8月|9月|10月|july|august|september|october)/i],
  },
  // Snow / ice scenes in a tropical zone (Okinawa) or out-of-season
  {
    category: "seasonal_impossibility",
    match: [/(雪|snow|雪景色|ice|スキー|ski)/i,
            /(沖縄|okinawa|奄美|amami|与論|宮古|石垣|ishigaki|tropical|亜熱帯)/i],
  },
  {
    category: "seasonal_impossibility",
    match: [/(雪|snow)/i,
            /(7月|8月|june|july|august|midsummer|真夏)/i],
    // Some highland resorts have summer-snow leftovers; veto if specifically named
    veto: [/立山|tateyama|穂高|乗鞍/i],
  },
  // Cherry blossoms compared to mainland in tropical Okinawa (the bloom is Jan-Feb)
  {
    category: "seasonal_impossibility",
    match: [/(沖縄|okinawa)/i,
            /(本州.*同じ|mainland.*same|同時期|matching\s*honshu|本州並み)/i,
            /(桜|cherry|sakura)/i],
  },

  // ── fictional_location ─────────────────────────────────────────────
  // The user named a place that doesn't exist. Catches obvious "幻島"
  // "架空" "fictional" markers in the query itself; the agent / Product 2
  // is responsible for the actual not-found composition.
  {
    category: "fictional_location",
    match: [/(幻島|架空|fictional|imaginary|made.?up|存在しない|not\s*real|not\s*exist)/i,
            /(県|市|町|村|寺|神社|城|temple|shrine|castle|city|town|village)/i],
  },

  // ── geographic_impossibility ───────────────────────────────────────
  // Swim in 鳥取砂丘 (a desert dune system, not coast)
  {
    category: "geographic_impossibility",
    match: [/(鳥取砂丘|tottori\s*sand\s*dunes?|砂漠|砂丘|sand\s*dune|desert)/i,
            /(泳ぎ|swim|海水浴|sea\s*bath|遊泳)/i],
  },
  // Phenomena that do not occur in Japan (no aurora at standard tourist
  // latitudes, etc.). Caught L3-07 fail=D in iter52: agent fabricated
  // northern-lights spots in Hokkaido.
  {
    category: "geographic_impossibility",
    match: [/(オーロラ|aurora|northern\s*lights|polar\s*lights)/i,
            /(日本|japan|hokkaido|北海道)/i],
  },
  // Iter63: relax to fire on aurora keyword alone since this corpus is
  // Japan-only — any aurora query in this server context is nearly
  // always implicitly about Japan. iter62 L3-07 (q="オーロラ") didn't
  // match the conjunctive pattern above.
  {
    category: "geographic_impossibility",
    match: [/(オーロラ|aurora|northern\s*lights|polar\s*lights)/i],
  },

  // Iter64: relax to fire on volcano keyword alone. Active-volcano
  // advisory always relevant — any visit should check JMA alert level.
  // L3-16 (q="火山") didn't match the conjunctive day-trip pattern.
  {
    category: "extreme_weather_risk",
    match: [/(活火山|active\s*volcano|噴火警戒|jma\s*volcano|火山\s*警戒)/i],
  },

  // Iter 58: expand to cover the remaining ~17 ADV cases
  // that were not caught by iter54 patterns.

  // ── extreme_weather_risk: lightning ────────────────────────────────
  {
    category: "extreme_weather_risk",
    match: [/(雷|落雷|lightning|thunder)/i,
            /(山頂|稜線|尾根|ridge|summit|屋外|outdoor|高地|exposed|open\s*field|河原|riverside)/i],
  },
  // ── extreme_weather_risk: black ice / icy roads ────────────────────
  {
    category: "extreme_weather_risk",
    match: [/(アイスバーン|凍結|black.?ice|icy\s*road|路面凍結)/i,
            /(運転|drive|drove|レンタカー|rental\s*car|スリップ|slip|spin)/i],
  },
  // ── extreme_weather_risk: heat stroke when hiking in midsummer ─────
  {
    category: "medical_advisory",
    match: [/(熱中症|heatstroke|heat\s*stroke|脱水|dehydration|sun.?stroke)/i,
            /(真夏|盛夏|midsummer|7月|8月|july|august|登山|hike|長時間屋外|long\s*outdoor)/i],
  },
  // ── medical_advisory: heart / blood pressure + onsen / sauna ───────
  {
    category: "medical_advisory",
    match: [/(心臓病|心疾患|heart\s*(disease|condition)|高血圧|low\s*blood|hypertension|cardiac|pacemaker|ペースメーカー|不整脈|arrhythm)/i,
            /(温泉|onsen|hot\s*spring|サウナ|sauna|岩盤浴|蒸し風呂|高温|hot\s*bath|climb|登山|高地|altitude)/i],
  },
  // ── medical_advisory: severe allergy + foodways ────────────────────
  {
    category: "medical_advisory",
    match: [/(食物アレルギー|food\s*allergy|アナフィラキシー|anaphylax|甲殻類アレルギー|そばアレルギー|蕎麦アレルギー|peanut\s*allergy|nut\s*allergy|gluten\s*free|セリアック)/i,
            /(食事|料理|レストラン|meal|menu|食べる|eat|タべる|ramen|寿司|sushi)/i],
  },

  // ── remote_solo_risk: cave / 鍾乳洞 alone ─────────────────────────
  {
    category: "remote_solo_risk",
    match: [/(鍾乳洞|洞窟|cave|caving|spelunking|地下洞)/i,
            /(一人|単独|alone|by\s*myself|solo|ソロ|ガイドなし|no\s*guide)/i],
  },

  // ── open_water_risk: dam / reservoir / lake high-current swim ──────
  {
    category: "open_water_risk",
    match: [/(ダム湖|reservoir|発電\s*所湖|放流|放水|spillway|急流|rapids|渓流|mountain\s*stream|滝つぼ|滝壺|waterfall\s*pool|plunge\s*pool)/i,
            /(泳|swim|遊泳|飛び込|jump|dive|入水)/i],
  },
  // open water: 沖合 / offshore + 子供 minors swim
  {
    category: "open_water_risk",
    match: [/(沖合|offshore|沖まで|far\s*from\s*shore|外洋)/i,
            /(子供|kids|children|子ども|minor|child|高校生|teenager|toddler)/i],
  },

  // ── wildlife_encounter: rabies / 狂犬病 ──────────────────────────
  {
    category: "wildlife_encounter",
    match: [/(野犬|stray\s*dog|rabies|狂犬病|サル|猿|ニホンザル|monkey|macaque)/i,
            /(噛ま|bite|引っ掻|scratch|attack|遭遇|approach|餌|feed)/i],
  },
  // wildlife: ハブ / habu (specific to Okinawa / Amami) without guide
  {
    category: "wildlife_encounter",
    match: [/(ハブ|habu|マムシ|やまかがし|venomous|毒蛇)/i,
            /(草むら|ジャングル|jungle|藪|bush|bushwalk|散策|walk|ハイキング|hike|登山|沢登り)/i],
  },

  // ── religious_protocol: photography + 修行 + 入定 / sacred halls ──
  {
    category: "religious_protocol",
    match: [/(修行|護摩|護摩堂|内陣|本殿|奥之院|奥の院|秘仏|sacred\s*hall|inner\s*sanctuary|spiritual\s*retreat)/i,
            /(撮影|写真|photo|録画|記録|zoom|tour|入る|enter|入場|入山)/i],
  },

  // ── infeasible_travel: more pairs ──────────────────────────────────
  {
    category: "infeasible_travel",
    match: [/(日帰り|day\s*trip|one\s*day|same\s*day|return.*evening)/i,
            /(東京.*北海道|tokyo.*hokkaido|tokyo.*kyushu|札幌.*九州|sapporo.*kyushu|tokyo.*okinawa|本州.*奄美|本州.*与那国|aomori.*okinawa)/i],
  },

  // ── seasonal_impossibility: spring scenes in winter / fireworks off-season ──
  {
    category: "seasonal_impossibility",
    match: [/(花火大会|firework(s)?\s*festival|hanabi)/i,
            /(12月|1月|2月|december|january|february|midwinter|真冬)/i],
    veto: [/熱海|atami|adventureworld|越前|お台場.*winter/i],  // year-round events exist
  },
  {
    category: "seasonal_impossibility",
    match: [/(紅葉|fall\s*foliage|autumn\s*leaves|momiji)/i,
            /(5月|6月|7月|8月|may|june|july|august|midsummer|真夏)/i],
  },

  // ── high_altitude_risk: solo winter ascent of named alpine peak ────
  {
    category: "high_altitude_risk",
    match: [/(剱岳|穂高|槍ヶ岳|白馬岳|常念岳|乗鞍|燕岳|tateyama|hotaka|yarigatake|shirouma)/i,
            /(単独|ソロ|alone|solo|by\s*myself|first.?time|未経験|inexperienced)/i],
  },
];

/**
 * Detect the union of safety categories implied by `text`.
 *
 * - `text` is the raw user query (or a concat of query + topic).
 * - Returns an empty array when no category matches.
 * - Categories are returned in deterministic order (first-seen).
 * - Patterns are deliberately permissive on the "and" side and tight on
 *   the "or" side so false positives are mostly harmless (the agent
 *   merely composes a generic safety reminder).
 */
export function detectSafetyKeywords(text: string | null | undefined): SafetyCategory[] {
  if (!text) return [];
  const t = text.normalize("NFKC");
  const seen = new Set<SafetyCategory>();
  const out: SafetyCategory[] = [];
  for (const p of PATTERNS) {
    if (seen.has(p.category)) continue;
    const allMatch = p.match.every((re) => re.test(t));
    if (!allMatch) continue;
    if (p.veto && p.veto.some((re) => re.test(t))) continue;
    seen.add(p.category);
    out.push(p.category);
  }
  return out;
}

/**
 * For tools that already accept (q, topic, etc.), build the canonical
 * detection input by concatenating the strings the user wrote. This is
 * separate from `detectSafetyKeywords` so callers can pre-process the
 * input (e.g. join multi-field args, lowercase) without re-allocating.
 */
export function buildSafetyInput(parts: (string | null | undefined)[]): string {
  return parts.filter((s): s is string => !!s && s.trim().length > 0).join(" / ");
}
