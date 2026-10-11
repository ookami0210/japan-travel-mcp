import { LISTING_HOST_SUFFIXES } from "./site_status.js";

/**
 * Deciding whether a campground on a compiled list is one we already hold.
 *
 * WHY THIS LIVES HERE, ONCE. Identity across sources was got wrong four times
 * while this was built, each time by a slightly looser string rule: NFD kana
 * compared against NFC matched almost nothing, substring matching matched any
 * name containing キャンプ場 to a row literally called キャンプ場, and
 * containment did the same with オートキャンプ. So the rules are written down
 * once, in one place, with tests, instead of being re-improvised per script.
 *
 * Three signals, in order of how much they prove:
 *   1. the operator's own domain, when it belongs to exactly one facility —
 *      a domain identifies an operator wherever the map points landed;
 *   2. the same name in the same prefecture;
 *   3. the same name core — the name minus the generic camping words — in the
 *      same prefecture, when that core is long enough to identify a place.
 *
 * What is deliberately absent: containment, fuzzy similarity, and anything
 * that compares names without agreeing on the prefecture first.
 */

/**
 * Hosts that cover many facilities and so identify none: social networks, free
 * site builders, blog platforms, chain umbrellas and booking portals. The
 * portal hosts are the same set `scrapers/lib/site_status.ts` already refuses
 * to fetch — a URL on one of them tells us where a booking happens, never
 * which operator we are looking at.
 */
const SHARED_HOSTS =
  /(^|\.)(facebook|instagram|twitter|x|youtube|line|goo\.gl|sites\.google|jimdosite|wixsite|crayonsite|grupo\.jp|blogspot|hatenablog|wordpress)\./;

/** Booking portals, read from the list this project already refuses to fetch. */
const PORTAL_HOSTS = LISTING_HOST_SUFFIXES;

/**
 * Chain umbrellas: one domain, many properties. 休暇村 runs some thirty
 * national-park resorts off a single site, so a URL there says which chain a
 * campground belongs to and never which campground it is.
 */
const CHAIN_HOSTS = ["qkamura.or.jp", "toyoko-inn.com", "jalan.co.jp"];

/** Words that are what a campground is, not which campground it is. */
const GENERIC_TAIL =
  /(オート)?(キャンプ場|キャンプ村|キャンプフィールド|キャンプサイト|キャンプ|グランピング|野営場|rvパーク|オートキャンプ|campground|campsite|camping|camp)$/u;

export function normalizeFacilityName(name: string | null): string {
  return (
    (name ?? "")
      .normalize("NFKC")
      .replace(/&amp;/g, "&")
      // Punctuation and spacing only. The prolonged sound mark ー (U+30FC) is
      // NOT punctuation: stripping it turns オートキャンプ into オトキャンプ,
      // which then matches nothing in the generic-word list — the single cause
      // of every "this generic row is a match" error this module exists to
      // prevent.
      .replace(/[\s\u3000・･,.'"()（）「」【】\[\]\-\u2010\u2012\u2013\u2014\u2015＆&]/g, "")
      .toLowerCase()
  );
}

/** The distinctive part of a name: what is left once the generic words go. */
export function facilityNameCore(name: string | null): string {
  let x = normalizeFacilityName(name);
  for (let i = 0; i < 3; i++) x = x.replace(GENERIC_TAIL, "");
  return x;
}

/** The operator's own domain, or "" when the URL identifies no single operator. */
export function operatorDomain(url: string | null): string {
  if (!url) return "";
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    if (SHARED_HOSTS.test(`${host}.`)) return "";
    if (PORTAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "";
    if (CHAIN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return "";
    return host;
  } catch {
    return "";
  }
}

/** A name that is only generic words identifies nothing. */
export function isGenericName(name: string | null): boolean {
  const n = normalizeFacilityName(name);
  if (!n) return true;
  return facilityNameCore(name).length === 0;
}

export interface HeldRecord {
  /** `osm:node/123` or `wikidata:Q123` — stable across master rebuilds. */
  source_ref: string;
  name: string | null;
  name_en: string | null;
  website: string | null;
  prefecture_code: string | null;
}

export interface DirectoryCandidate {
  name: string | null;
  website: string | null;
  prefecture_code: string | null;
}

export interface IdentityIndex {
  byDomain: Map<string, HeldRecord[]>;
  byPrefName: Map<string, HeldRecord>;
  byPrefCore: Map<string, HeldRecord>;
}

export function buildIdentityIndex(held: HeldRecord[]): IdentityIndex {
  const byDomain = new Map<string, HeldRecord[]>();
  const byPrefName = new Map<string, HeldRecord>();
  const byPrefCore = new Map<string, HeldRecord>();
  for (const h of held) {
    const domain = operatorDomain(h.website);
    if (domain) {
      const arr = byDomain.get(domain);
      if (arr) arr.push(h);
      else byDomain.set(domain, [h]);
    }
    if (!h.prefecture_code) continue;
    for (const n of [h.name, h.name_en]) {
      if (!n || isGenericName(n)) continue;
      byPrefName.set(`${h.prefecture_code}|${normalizeFacilityName(n)}`, h);
      const c = facilityNameCore(n);
      if (c.length >= 3) byPrefCore.set(`${h.prefecture_code}|${c}`, h);
    }
  }
  return { byDomain, byPrefName, byPrefCore };
}

export interface IdentityMatch {
  source_ref: string;
  how: "operator domain" | "name in prefecture" | "name core in prefecture";
}

/** The held record this facility already is, or null when it is new to us. */
export function matchHeld(
  facility: DirectoryCandidate,
  index: IdentityIndex,
): IdentityMatch | null {
  const domain = operatorDomain(facility.website);
  if (domain) {
    const rows = index.byDomain.get(domain);
    // Exactly one holder: two or more means the domain is shared after all.
    if (rows && rows.length === 1) {
      return { source_ref: rows[0].source_ref, how: "operator domain" };
    }
  }
  if (!facility.prefecture_code || isGenericName(facility.name)) return null;
  const n = index.byPrefName.get(
    `${facility.prefecture_code}|${normalizeFacilityName(facility.name)}`,
  );
  if (n) return { source_ref: n.source_ref, how: "name in prefecture" };
  const core = facilityNameCore(facility.name);
  if (core.length >= 3) {
    const c = index.byPrefCore.get(`${facility.prefecture_code}|${core}`);
    if (c) return { source_ref: c.source_ref, how: "name core in prefecture" };
  }
  return null;
}

/**
 * Records that might be this facility under another name, for a human to look
 * at rather than for the matcher to merge.
 *
 * The cases this is for are real and common: the directory writes
 * 会津山村道場 うさぎの森オートキャンプ場 where we hold うさぎの森オートキャンプ場,
 * or リバーパーク上長瀞オートキャンプ場 where we hold 長瀞オートキャンプ場. One
 * name contains the other, which is suggestive and not conclusive — the same
 * rule applied without a prefecture scope, or without excluding generic names,
 * matched 22 unrelated facilities in one afternoon.
 *
 * So containment is never a merge. It produces a candidate, scoped to the
 * prefecture, with both names carried so the review queue shows a person what
 * the question is.
 */
export function possibleDuplicates(
  facility: DirectoryCandidate,
  held: HeldRecord[],
  limit = 3,
): { source_ref: string; name: string; how: string }[] {
  if (!facility.prefecture_code || isGenericName(facility.name)) return [];
  const core = facilityNameCore(facility.name);
  if (core.length < 3) return [];
  const out: { source_ref: string; name: string; how: string }[] = [];
  for (const h of held) {
    if (h.prefecture_code !== facility.prefecture_code) continue;
    for (const n of [h.name, h.name_en]) {
      if (!n || isGenericName(n)) continue;
      const c = facilityNameCore(n);
      if (c.length < 3) continue;
      if (c === core) continue; // an exact core is a match, not a candidate
      if (c.includes(core) || core.includes(c)) {
        out.push({ source_ref: h.source_ref, name: n, how: "one name contains the other, same prefecture" });
        break;
      }
    }
    if (out.length >= limit) break;
  }
  return out;
}
