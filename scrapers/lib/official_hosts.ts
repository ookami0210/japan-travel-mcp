/**
 * Which URLs count as an entity's own official page. Shared by the passes
 * that read official pages (DATA_SOURCES.md #49 facts, #51 images).
 */

/** A URL held by this many entities or more is a brand site, not a venue page. */
export const SHARED_URL_MIN = 3;
/**
 * Hosts that are not the venue's own page: review sites, booking portals,
 * social networks, map services. The data policy keeps them out even when
 * a record's website tag points there.
 */
export const NOT_OFFICIAL_HOST_RE =
  /(^|\.)(tabelog\.com|retty\.me|gnavi\.co\.jp|hotpepper\.jp|ikyu\.com|jalan\.net|rakuten\.co\.jp|rakuten\.com|booking\.com|expedia\.(com|co\.jp)|agoda\.com|hotels\.com|tripadvisor\.(com|jp)|trip\.com|airbnb\.(com|jp)|google\.(com|co\.jp)|goo\.gl|instagram\.com|facebook\.com|fb\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|yelp\.(com|co\.jp)|foursquare\.com|hitosara\.com|ozmall\.co\.jp|tablecheck\.com|toreta\.in|ebica\.jp|omakase\.in|autoreserve\.com|ameblo\.jp|note\.com|wikipedia\.org|wikidata\.org|yahoo\.co\.jp|line\.me|lin\.ee)$/i;
