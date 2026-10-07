/**
 * Visible text of an HTML page.
 *
 * WHY a separate helper: two passes read the same small-operator pages for
 * different purposes — the site-status pass asks whether a page is still the
 * operator's own page, and the official-site crawl stores what the page says
 * so a consumer can answer questions from it. Both need the same thing from
 * the markup: the words a visitor sees, with script and style content gone
 * and whitespace collapsed, in the page's own order.
 *
 * Deliberately not a parser. Campground pages include hand-written tables,
 * unclosed tags and frames from two CMS generations; a regex strip degrades
 * on those into slightly noisier text, which is the right failure, whereas a
 * strict parse can drop a whole page of real content.
 */

/**
 * The named entities these pages actually use. Not the full HTML set: a
 * campground page written in a CMS reaches for a breadcrumb arrow, a middle
 * dot, a yen sign and little else, and an entity left undecoded is visible
 * noise in stored text that a consumer will quote back to a traveller.
 * Anything outside the table stays as written rather than being guessed at.
 */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  raquo: "\u00bb",
  laquo: "\u00ab",
  rsaquo: "\u203a",
  lsaquo: "\u2039",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  middot: "\u00b7",
  bull: "\u2022",
  copy: "\u00a9",
  reg: "\u00ae",
  trade: "\u2122",
  deg: "\u00b0",
  times: "\u00d7",
  yen: "\u00a5",
  sup2: "\u00b2",
  frac12: "\u00bd",
  rarr: "\u2192",
  larr: "\u2190",
  ldquo: "\u201c",
  rdquo: "\u201d",
  lsquo: "\u2018",
  rsquo: "\u2019",
};

/** Numeric and named entities that survive a tag strip. */
function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z][a-z0-9]{1,8});/gi, (whole, name: string) => {
      const mapped = NAMED_ENTITIES[name] ?? NAMED_ENTITIES[name.toLowerCase()];
      return mapped ?? whole;
    });
}

/** Tags out, entities in, whitespace collapsed — enough to read a page by. */
export function pageText(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(stripped).replace(/\s+/g, " ").trim();
}
