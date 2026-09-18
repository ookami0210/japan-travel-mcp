/**
 * Official-page status for an accommodation.
 *
 * WHY: a URL in the dataset is a promise that a traveller (or an agent acting
 * for one) can read the operator's own page. That promise decays quietly —
 * domains lapse, small operators close, and some places never had a site and
 * live on a booking portal instead. Liveness alone cannot tell those apart: a
 * parked domain answers 200, and a closure notice is a perfectly healthy page.
 *
 * So the verdict is decided in two steps: where the URL points (a booking
 * portal is not an official page), then what the page says (a closure notice
 * outranks everything else on it).
 *
 * The verdicts are deliberately conservative. Nothing here concludes "closed":
 * `closed_suspected` marks a page for a human to read, because a seasonal
 * campground announcing 冬季休業 reads much like one that shut for good.
 */

export type SiteStatus =
  | "active" // the operator's own page responds and looks like the place
  | "closed_suspected" // the page says it closed / suspended operations
  | "url_dead" // no response, or an error / parked page
  | "ota_listing" // the URL is a booking-portal listing, not an official page
  | "no_official_site" // nothing to check
  | "unchecked"; // a URL we chose not to read (robots), so we say nothing

export interface SiteStatusInput {
  /** The URL on record; null when the entry has none. */
  url: string | null;
  /** HTTP status of the fetch; 0 for a network-level failure. */
  status: number;
  /** Page text (tags stripped). Null when nothing was fetched. */
  text: string | null;
  /** The facility name, to check the page is about this place. */
  name: string | null;
}

export interface SiteStatusResult {
  status: SiteStatus;
  /** Short machine-readable reason, kept in the state file for auditing. */
  reason: string;
}

/**
 * Hosts that publish listings on behalf of operators. A listing is a fine
 * thing to have on record — for many small campgrounds it is the only page
 * that exists — but it is not the operator's own site, and its terms decide
 * whether it may be fetched at all, so it is labelled rather than crawled.
 */
const LISTING_HOSTS = [
  "nap-camp.com",
  "hatinosu.net",
  "jalan.net",
  "rakuten.co.jp",
  "travel.rakuten.co.jp",
  "booking.com",
  "expedia.co.jp",
  "airbnb.jp",
  "airbnb.com",
  "asoview.com",
  "jtb.co.jp",
  "ikyu.com",
  "rurubu.travel",
  "tripadvisor.jp",
  "tripadvisor.com",
  "instagram.com",
  "facebook.com",
  "goo.gl",
];

/** Domain-parking and "this site has moved/expired" phrases. */
const PARKED_MARKERS = [
  "このドメインは",
  "ドメインの有効期限",
  "お名前.com",
  "domain is for sale",
  "this domain has expired",
  "buy this domain",
  "さくらのレンタルサーバ",
  "default web site page",
  "it works!",
];

/** Phrases that mean the business itself stopped, not just today. */
const CLOSURE_MARKERS = [
  "閉鎖しました",
  "閉鎖いたしました",
  "営業を終了",
  "営業終了しました",
  "閉業",
  "廃業",
  "閉園しました",
  "閉館しました",
  "サービスを終了",
  "permanently closed",
];

/** Words a campground / lodging page almost always carries. */
const LODGING_MARKERS = [
  "キャンプ",
  "オートキャンプ",
  "宿泊",
  "予約",
  "チェックイン",
  "サイト",
  "料金",
  "アクセス",
  "camp",
  "reservation",
  "check-in",
  "booking",
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function isListingHost(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return LISTING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Loose name match: punctuation and spacing differ between sources. */
function nameOnPage(name: string, text: string): boolean {
  const strip = (s: string) => s.replace(/[\s　・･,.'"()（）「」【】\-ー–—]/g, "").toLowerCase();
  const n = strip(name);
  if (n.length < 2) return false;
  const t = strip(text);
  if (t.includes(n)) return true;
  // Names often carry a descriptor the page drops ("○○オートキャンプ場" vs
  // "○○キャンプ場"): match the distinctive head of the name instead. The trim
  // runs on the stripped form, where the 長音符 of オート is already gone.
  const head = n.replace(/(オート|オト)?(キャンプ場|キャンプ|野営場|公園|村|ランド)$/u, "");
  return head.length >= 3 && head !== n && t.includes(head);
}

export function classifySiteStatus(input: SiteStatusInput): SiteStatusResult {
  const { url, status, text, name } = input;
  if (!url) return { status: "no_official_site", reason: "no url on record" };
  if (isListingHost(url)) return { status: "ota_listing", reason: "url points at a booking portal" };

  if (status === 0) return { status: "url_dead", reason: "no response" };
  if (status >= 400) return { status: "url_dead", reason: `http ${status}` };
  if (!text || text.trim().length < 80) {
    return { status: "url_dead", reason: "empty page" };
  }

  const lower = text.toLowerCase();
  if (PARKED_MARKERS.some((m) => lower.includes(m.toLowerCase()))) {
    return { status: "url_dead", reason: "parked or placeholder page" };
  }
  // A closure notice outranks everything else the page still says.
  if (CLOSURE_MARKERS.some((m) => lower.includes(m.toLowerCase()))) {
    return { status: "closed_suspected", reason: "page announces closure" };
  }

  const named = name ? nameOnPage(name, text) : false;
  const lodging = LODGING_MARKERS.some((m) => lower.includes(m.toLowerCase()));
  if (named || lodging) {
    return { status: "active", reason: named ? "name on page" : "lodging vocabulary on page" };
  }
  // Responds, but nothing says it is this place: leave it for a human rather
  // than calling a working site dead.
  return { status: "closed_suspected", reason: "page does not mention the place or lodging" };
}
