/**
 * Text-classification helpers used by aggregator tools to:
 *   - filter scraped page bodies by topical keywords (food, festival)
 *   - reject tourism-portal URLs that aggregate multiple municipalities
 *     under a misleading admin code
 *   - reject scraped "spot" names that are actually nav-chrome / index
 *     pages / encoding garbage
 *   - compile a per-call keyword matcher for the optional `keyword`
 *     argument on `get_festivals` / `get_traditional_arts` /
 *     `get_local_food` / etc.
 *
 * Pure functions only — no I/O.
 */

// ──────────────────────────────────────────────────────────────────────
// compileKeywordMatcher
//
// Used by aggregator tools to narrow large result sets like
// `get_festivals(prefecture='秋田県', keyword='花火')`. Returns a function
// that accepts variadic field strings and returns true iff any of them
// contains the keyword (case-insensitive). When `keyword` is missing or
// empty the matcher accepts every record.

/**
 * Compile a case-insensitive substring matcher for an optional `keyword`.
 * The returned function is variadic so callers can pass however many
 * candidate fields they like (name + description + body + ...) without
 * building an array.
 */
export function compileKeywordMatcher(
  keyword: string | undefined,
): (...fields: (string | null | undefined)[]) => boolean {
  const k = (keyword ?? "").trim();
  if (!k) return () => true;
  const lower = k.toLowerCase();
  return (...fields: (string | null | undefined)[]): boolean => {
    for (const f of fields) {
      if (!f) continue;
      if (f.includes(k)) return true;
      if (f.toLowerCase().includes(lower)) return true;
    }
    return false;
  };
}

// ──────────────────────────────────────────────────────────────────────
// Prefecture-wide tourism portal detector
//
// Used to filter scraped spots whose URL is from a domain that aggregates
// many cities under a misleading municipality assignment. The pipeline
// tagged some such spots with the wrong municipality_code (e.g.
// dive-hiroshima.com pages marked as 尾道市 when they actually cover
// 大久野島 in 竹原市).

export const PREF_WIDE_PORTAL_DOMAINS: readonly string[] = [
  "dive-hiroshima.com",
  "yamatoji.nara-kankou.or.jp",
  "atochi.jp",
  "vill.hakuba.lg.jp",
  "san3kan.net",
  "info.pref.fukui",
  "kanko-sanyo.com",
  "okayama-kanko.net",
  "tourism.iwate",
  "wakayama-kanko.jp",
  "vekanko.jp",
  "tic-toyama.jp",
  "kanko.kyoto-fukuchiyama",
  "iwatetabi.jp",      // Iwate prefecture-wide
  "fuku-e.com",        // Fukui DISCOVER FUKUI
  "fukuoka-kanko.com",
  "tabi-aichi.jp",
  "honokuni.or.jp",    // 山陰観光
  "yamagatakanko.com",
  "tochigiji.or.jp",
  "kanko-shimane.com",
  "tottori-tour.jp",
  "discover-niigata.com",
  "saitama-kanko.com",
  "gunma-trip.jp",
  "kankou-shiga.jp",
  "miyazaki-kankou.jp",
  "kankou-japan.go.jp",
  "japan.travel",
];

/** Returns true when the URL is from a known prefecture-wide portal. */
export function isPrefWidePortalUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return PREF_WIDE_PORTAL_DOMAINS.some((d) => lower.includes(d));
}

// ──────────────────────────────────────────────────────────────────────
// Food / festival topical filters
//
// Used by `get_local_food` and `get_festivals` to flag scraped page
// bodies as topically relevant. JA tokens are checked against the raw
// text (kanji has no case folding); EN tokens are checked against a
// lower-cased copy.

export const FOOD_KEYWORDS_JA: readonly string[] = [
  "グルメ", "ご当地グルメ", "ご当地", "名物", "名産",
  "銘菓", "銘酒", "地酒", "和菓子", "郷土料理",
  "ご当地スイーツ", "麺", "ラーメン", "うどん", "そば",
  "丼", "弁当", "B級グルメ",
];

export const FOOD_KEYWORDS_EN: readonly string[] = [
  "cuisine", "gourmet", "local food", "local-food", "specialty",
  "dish", "noodle", "ramen", "udon", "soba", "sushi", "sake",
];

export function isFoodText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const k of FOOD_KEYWORDS_JA) {
    if (text.includes(k)) return true;
  }
  const low = text.toLowerCase();
  for (const k of FOOD_KEYWORDS_EN) {
    if (low.includes(k)) return true;
  }
  return false;
}

export const FESTIVAL_KEYWORDS_JA: readonly string[] = [
  "祭", "祭り", "祭礼", "まつり", "マツリ",
  "神事", "神楽", "神輿", "舞楽",
  "行事", "縁日", "灯籠", "山車", "山鉾", "花火",
];

export const FESTIVAL_KEYWORDS_EN: readonly string[] = [
  "festival", "matsuri", "fire festival", "lantern festival",
  "ritual", "rite", "ceremony",
];

export function isFestivalText(text: string | null | undefined): boolean {
  if (!text) return false;
  for (const k of FESTIVAL_KEYWORDS_JA) {
    if (text.includes(k)) return true;
  }
  const low = text.toLowerCase();
  for (const k of FESTIVAL_KEYWORDS_EN) {
    if (low.includes(k)) return true;
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────────
// Nav-chrome / boilerplate spot-name detector
//
// Used to filter the hybrid retriever's spot results before they reach
// the user. Patterns drawn from a quick audit of the post-burst
// embedding corpus (2026-05-01) plus successive iterations of judge
// scoring on random samples.
//
// Three categories of pattern:
//   1. EXACT (case-insensitive): full-name match against `navWords`
//      (generic English/Japanese nav labels) or `navExactExtra` (CMS
//      section-header titles).
//   2. SUFFIX regex: portal-landing-page suffixes like X市観光協会公式サイト.
//   3. CONTAINS substring: cookie-consent / language-selector / privacy
//      banners that appear anywhere in the title.
//
// Plus structural rejection: empty / whitespace-only, mojibake / encoding
// garbage, pure-symbol names, very short hiragana-only labels.

const NAV_EXACT_WORDS: readonly string[] = [
  "main menu", "menu", "news", "videos", "video", "video library",
  "home", "top", "sitemap", "site map", "site search", "search",
  "login", "sign in", "sign up", "register", "press", "press room",
  "rss", "rss feed", "subscribe", "twitter", "facebook", "youtube",
  "instagram", "language", "english", "日本語",
  "ご意見", "お問い合わせ", "プライバシーポリシー", "サイトマップ",
  "サイト内検索", "関連リンク", "リンク集", "メインメニュー",
  "観光パンフレット等のご案内", "観光客のおもてなし",
  // Random-130 surfaced these as leakage from municipal-website
  // navigation — admin chrome, not real spots.
  "ホーム", "ホームページ", "くらし・手続き", "暮らし・手続き",
  "観光パンフレット", "観光案内", "観光情報",
  "新着情報", "更新情報", "お知らせ", "イベント情報",
  "アクセス", "アクセス情報", "アクセスマップ", "交通アクセス",
  "問い合わせ", "お知らせ一覧",
  "各スキー場統計", "各キャンプ場統計",  // generic stat pages
  "観光ガイド", "施設一覧", "イベント一覧",
  "guide", "events", "event", "guide map", "tourist information",
];

const NAV_EXACT_EXTRA: readonly string[] = [
  "イベント・お知らせ", "新着情報一覧", "ピックアップ", "topics",
  "トピックス", "観光スポット", "観光ガイド・パンフレット",
  "刊行物・行政資料", "区役所・出張所", "文化・観光・スポーツ",
  "文化・観光", "芸術・文化振興", "芸術・文化・歴史",
  "芸術・文化イベント", "生涯学習・スポーツ", "文化・観光施設",
  "スポーツ施設", "おすすめ情報",
  "主な行事・祭り", "見どころ・まち歩き", "ゆかりの地・人物",
  // Generic terms like "イベント" / "観光情報" / "観光ガイド" caught too
  // many real spots in earlier iterations — kept only specific multi-word
  // patterns + the suffix regex below.
  "検索メニュー", "サイト内検索", "よく検索されるキーワード",
  "キーワードでスポットを検索", "情報をさがす",
  "くらし・行政情報", "くらしの情報", "このサイトについて",
  "新着のお知らせ", "お知らせ・新着情報",
  "緊急情報", "緊急のお知らせ", "重要なお知らせ", "重要情報",
  // dive-hiroshima.com / similar prefecture tourism portal widgets that
  // surfaced as data leak in iter54-baseline. Sidebar / widget labels.
  "注目ワード", "モデルコース", "スポット・体験", "イベントを探す",
  "ボランティアガイド", "各施設や地域の情報", "ガイドブック", "旅のしおり",
  "観光案内所一覧", "観光案内所一覧情報",
  // CMS section header patterns: top-level menu items with
  // multiple-kanji + separator structure.
  "温泉・宿泊", "宿泊・温泉", "グルメ・買う", "食べる・買う",
  "景観・環境・観光", "観光・景観", "学ぶ・知る",
  "アクセス・駐車場", "アクセス・交通",
  "観光に役立つ情報", "観光情報", "観光情報サイト",
  "宿泊予約", "宿泊・予約",
  "イベント・体験", "体験・アクティビティ",
  "歴史・文化", "文化・歴史", "自然・歴史",
  "見る・遊ぶ", "見る", "遊ぶ", "学ぶ", "買う",
  "泊まる", "食べる", "歩く", "ふれる",
  // Generic-category-name placeholder titles flagged by judges.
  "神社・仏閣", "寺院・神社", "神社", "仏閣", "寺院",
  "観光地", "名所", "名所旧跡", "観光名所",
  "公園", "庭園", "城",
  "美術館・博物館", "博物館・美術館", "資料館",
  "温泉", "温泉地", "温泉郷",
  "祭り・イベント", "イベント", "イベント・祭り",
  "アクティビティ", "体験",
  "グルメ", "ご当地グルメ", "ご当地",
  "土産", "お土産",
  "ショッピング", "shopping",
  "住所", "電話", "url", "URL", "ホームページ",
  // Generic CTA / listing widgets / shrink-wrap reservation prompts.
  "ご予約はこちら", "予約はこちら", "予約・問い合わせ", "ご利用案内",
  "ご利用について", "サービスのご案内", "ご案内", "案内",
  "ランキング", "人気ランキング", "おすすめランキング", "話題のスポット",
  "ピックアップ記事", "特集記事", "特集一覧", "コラム", "コラム一覧",
  "メルマガ登録", "メールマガジン", "公式SNS", "公式アカウント",
  "ライブカメラ", "天気・ライブカメラ",
  "404 not found", "ページが見つかりません", "page not found",
  "メンテナンス中", "サイトメンテナンス", "under maintenance",
  "このページについて", "このサイトの使い方", "サイトの使い方",
  "閉じる", "戻る", "次のページ", "前のページ",
  "詳細を見る", "もっと見る", "see more", "view more", "read more",
  "予約する", "Book now", "申込み", "申し込み",
  // 2026-05-09 multi-judge feedback: portal closure / closed-for-now
  // notices and listicle / DMO blog-page hits that surface above
  // canonical attractions when query is broad.
  "立入禁止", "立ち入り禁止", "営業終了", "閉鎖中", "工事中",
  "工事のお知らせ", "改装中", "リニューアル中", "閉店", "閉館",
  "中止のお知らせ", "中止について", "delayed", "cancelled", "canceled",
  "観光スポット検索", "スポット検索", "条件検索", "目的別検索",
  "新型コロナウイルス", "covid-19", "感染症対策",
  "観光特集", "観光ガイド", "tourist guide",
];

const NAV_CONTAINS: readonly string[] = [
  "about this page", "about this site", "ページについて",
  "クッキーポリシー", "cookie policy", "cookie 同意", "cookie consent",
  "プライバシーポリシー", "privacy policy",
  "サイトポリシー", "site policy",
  "免責事項", "disclaimer",
  "言語選択", "language selector", "language selection",
  "ナビゲーション", "navigation",
  "コンテンツへスキップ", "skip to content", "skip to main content",
  "戻る", "back to top", "ページの先頭", "ページトップ",
  "外国人旅行者向け情報", "魅力を動画でご紹介",
  "qrコードを読み", "qrコード読み取", "qr code", "qr コード",
  "ライセンス・著作権", "著作権について", "credit",
  "本サイトについて", "サイト運営", "運営者情報", "運営会社",
  "アクセシビリティ", "accessibility statement",
  "予約サイトへ", "外部リンク", "別サイト", "外部サイト",
  "メールアドレス", "ファックス番号", "電話番号一覧",
  "閲覧履歴", "閲覧したページ", "履歴",
  "リンクについて", "link policy", "リンクポリシー",
  "施設のご案内", "施設一覧", "施設情報",
  "ご利用条件", "利用条件", "利用規約",
  "個人情報", "個人情報の取り扱い",
  "カテゴリー一覧", "カテゴリ一覧", "category list",
  "投稿", "口コミ", "レビュー",
  "クーポン", "coupon",
  "観光課", "観光振興課", "観光商工課", "観光振興室",
  "観光まちづくり課", "観光物産課", "観光企画課",
  "コラム記事一覧", "ニュース一覧",
  "観光統計", "観光振興計画", "観光戦略",
];

const PORTAL_SUFFIX_RE =
  /(観光協会公式サイト|観光情報サイト|観光ナビ|観光navi|観光NAVI|観光連盟|観光物産協会|観光物産振興協会|エコツーリズム推進協議会|フィルムコミッション)$/iu;

/**
 * Detect spot names that are clearly nav-chrome / index pages / encoding
 * garbage rather than real assets. Returns `true` when the name should be
 * filtered out.
 */
export function isNavChromeSpotName(name: string | null | undefined): boolean {
  if (!name) return true;
  const trimmed = name.trim();
  if (trimmed.length === 0) return true;
  // Encoding garbage — Mojibake characters or non-printable runs.
  if (/[�]/.test(trimmed)) return true;
  if (/^[�¿À-ÿ]+$/.test(trimmed)) return true;

  const lower = trimmed.toLowerCase();
  if (NAV_EXACT_WORDS.includes(lower)) return true;
  if (NAV_EXACT_WORDS.includes(trimmed)) return true;
  // "おすすめ特集" / "Special Feature" boilerplate that appears on every page.
  if (/^(おすすめ特集|special feature)$/i.test(trimmed)) return true;
  if (NAV_EXACT_EXTRA.includes(trimmed)) return true;
  if (PORTAL_SUFFIX_RE.test(trimmed)) return true;

  for (const pat of NAV_CONTAINS) {
    if (lower.includes(pat) || trimmed.includes(pat)) return true;
  }
  // Pure punctuation / ASCII-symbol names (≤ 2 visible chars).
  if (/^[\s\-・·•·]+$/.test(trimmed)) return true;
  // Short hiragana-only / katakana-only label (1-3 chars) — usually a label.
  if (/^[぀-ヿ]{1,3}$/.test(trimmed)) return true;
  return false;
}
