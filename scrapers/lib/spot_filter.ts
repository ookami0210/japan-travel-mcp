/**
 * Spot quality filter.
 *
 * Reject pages that look like generic site infrastructure rather than actual
 * tourist content: search results, sitemaps, contact pages, error pages.
 *
 * The pilot revealed false-positive spots like "Search 情報検索" on
 * Tottori City. The discovery layer caught them because the URL contained
 * "/life/" which matched a tourism-adjacent pattern, and the page title
 * was the site header. This filter is the second-pass gate.
 */

const REJECT_TITLE_PATTERNS: RegExp[] = [
  /^Search\b/i,
  /^検索\s*$/,
  /サイトマップ/,
  /Sitemap/i,
  /プライバシーポリシー/,
  /Privacy\s*Policy/i,
  /個人情報保護方針/,
  /利用規約/,
  /Terms\s*of\s*(Use|Service)/i,
  /お問い合わせ/,
  /^Contact(\s+Us)?$/i,
  /^Page Not Found$/i,
  /^404\b/,
  /^Error\b/i,
  /Access\s*Denied/i,
  /メンテナンス中/,
  /Under\s*Maintenance/i,
];

const REJECT_URL_PATTERNS: RegExp[] = [
  /\/search(\/|$)/i,
  /[?&](q|s|keyword|query|searchword)=/i,
  /\/sitemap(\/|\.|$)/i,
  /\/contact(\/|$)/i,
  /\/privacy(\/|$)/i,
  /\/terms(\/|$)/i,
  /\/404(\/|$)/i,
  /\/error(\/|$)/i,
  /\/login(\/|$)/i,
  /\/signin(\/|$)/i,
  /\/maintenance(\/|$)/i,
];

const TOURISM_KEYWORD_RE =
  /観光|kanko|kankou|tourism|sightseeing|見どころ|名所|旅行|attraction|visit/i;

export interface FilterInput {
  url: string;
  title: string;
  description?: string | null;
}

export interface FilterResult {
  ok: boolean;
  reason?: string;
}

/**
 * Decide whether a discovered page is plausibly a tourist spot.
 *
 * Rules:
 *   - Pages whose title matches a non-content infrastructure pattern → reject
 *   - Pages whose URL matches a search/sitemap/etc. pattern, AND lack a
 *     tourism keyword in title or description → reject
 *   - Pages with very short titles (<3 chars) → reject
 *   - Pages with no description AND no tourism keyword in title → soft-reject
 *
 * Tourism keyword presence is a positive signal that overrides URL pattern
 * rejects, because some sites legitimately put tourism content under
 * `/search/?genre=tourism` or similar.
 */
export function passesSpotFilter(input: FilterInput): FilterResult {
  const title = input.title.trim();
  const desc = (input.description ?? "").trim();
  const titleHasTourism = TOURISM_KEYWORD_RE.test(title);
  const descHasTourism = TOURISM_KEYWORD_RE.test(desc);
  const urlHasTourism = TOURISM_KEYWORD_RE.test(input.url);
  const hasTourismSignal = titleHasTourism || descHasTourism || urlHasTourism;

  if (title.length < 3) {
    return { ok: false, reason: "title too short" };
  }

  for (const p of REJECT_TITLE_PATTERNS) {
    if (p.test(title)) {
      return { ok: false, reason: `infrastructure title (${p.source})` };
    }
  }

  for (const p of REJECT_URL_PATTERNS) {
    if (p.test(input.url) && !hasTourismSignal) {
      return { ok: false, reason: `infrastructure URL (${p.source})` };
    }
  }

  if (!desc && !titleHasTourism && !urlHasTourism) {
    return {
      ok: false,
      reason: "no description and no tourism keyword in title or URL",
    };
  }

  return { ok: true };
}
