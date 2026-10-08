/**
 * What we can say about a campground from its coordinates alone.
 *
 * WHY: 1,877 of the 2,163 campgrounds in the lodging layer have no website,
 * and 2,145 of them have no address either — but every one has a point on the
 * map. A record that is a name and a dot answers nothing, while the same dot
 * placed against data we already hold answers quite a lot: which municipality
 * it is in, which station it is nearest, which national park it sits beside,
 * what a visitor could see nearby. None of that needs the operator to have a
 * website, and none of it needs anybody's listing.
 *
 * Everything here is a pure function over data in the dataset. The one input
 * that comes from outside — the municipality for a coordinate, from the
 * national mapping agency's reverse geocoder — is fetched by the enrichment
 * pass and handed in, so the shaping stays testable offline.
 *
 * Honesty rules the phrasing. The parks file carries one point per park, not a
 * boundary, so a campground is never said to be *in* a park: it is a distance
 * from the park's recorded point, and the field is named for that. Distances
 * are straight lines, never travel time.
 */

import { haversineMeters } from "../../src/lib/geo.js";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NamedPlace {
  name_ja: string | null;
  name_en: string | null;
  coordinates: LatLng;
  /** Wikidata QID where the source has one, so a consumer can look it up. */
  qid?: string | null;
}

export interface NearbyPlace {
  name_ja: string | null;
  name_en: string | null;
  qid: string | null;
  /** Straight-line distance, rounded to 100 m — the precision this deserves. */
  straight_line_m: number;
}

/** A park point and how far the campground is from it. */
export interface NearestPark extends NearbyPlace {
  park_kind: string | null;
  /**
   * The park's own area, when the source records it. A campground 3 km from
   * the recorded point of a 1,200 km² park is probably inside it; one 3 km
   * from a 5 km² park probably is not. We give the reader both numbers rather
   * than guessing for them.
   */
  park_area_km2: number | null;
}

/** Facility facts OSM carries for some campgrounds, kept verbatim. */
export interface OsmFacilityFacts {
  fee?: string;
  charge?: string;
  capacity?: string;
  capacity_tents?: string;
  tents?: string;
  caravans?: string;
  toilets?: string;
  shower?: string;
  drinking_water?: string;
  power_supply?: string;
  openfire?: string;
  bbq?: string;
  dog?: string;
  wheelchair?: string;
  internet_access?: string;
  opening_hours?: string;
  seasonal?: string;
  backcountry?: string;
  reservation?: string;
  operator?: string;
  description?: string;
  phone?: string;
  address?: string;
}

/** The tag names we read, mapped to the field we publish them as. */
const OSM_FACT_KEYS: Record<string, keyof OsmFacilityFacts> = {
  fee: "fee",
  charge: "charge",
  capacity: "capacity",
  "capacity:tents": "capacity_tents",
  tents: "tents",
  caravans: "caravans",
  toilets: "toilets",
  shower: "shower",
  drinking_water: "drinking_water",
  power_supply: "power_supply",
  openfire: "openfire",
  bbq: "bbq",
  dog: "dog",
  wheelchair: "wheelchair",
  internet_access: "internet_access",
  opening_hours: "opening_hours",
  seasonal: "seasonal",
  backcountry: "backcountry",
  reservation: "reservation",
  operator: "operator",
  description: "description",
  phone: "phone",
};

/** Round to 100 m: a straight line to a station does not deserve metres. */
function roundDistance(m: number): number {
  return Math.round(m / 100) * 100;
}

/**
 * The closest of a set of places, with its distance, or null when none is
 * within `maxMeters`. A cap matters: the nearest station to a campground in
 * the mountains can be 40 km away, which is not an access hint but a
 * different kind of fact, and a consumer should see the number or nothing.
 */
export function nearest(
  from: LatLng,
  places: NamedPlace[],
  maxMeters = Infinity,
): NearbyPlace | null {
  let best: NearbyPlace | null = null;
  let bestRaw = Infinity;
  for (const p of places) {
    const d = haversineMeters(from, p.coordinates);
    if (d < bestRaw && d <= maxMeters) {
      bestRaw = d;
      best = {
        name_ja: p.name_ja,
        name_en: p.name_en,
        qid: p.qid ?? null,
        straight_line_m: roundDistance(d),
      };
    }
  }
  return best;
}

/** The closest few, nearest first — "what is around here". */
export function nearestFew(
  from: LatLng,
  places: NamedPlace[],
  count: number,
  maxMeters = Infinity,
): NearbyPlace[] {
  return places
    .map((p) => ({ p, d: haversineMeters(from, p.coordinates) }))
    .filter((x) => x.d <= maxMeters)
    .sort((a, b) => a.d - b.d)
    .slice(0, count)
    .map((x) => ({
      name_ja: x.p.name_ja,
      name_en: x.p.name_en,
      qid: x.p.qid ?? null,
      straight_line_m: roundDistance(x.d),
    }));
}

/** The nearest park point, carrying the park's own size for the reader to judge. */
export function nearestPark(
  from: LatLng,
  parks: (NamedPlace & { park_kind?: string | null; area_km2?: number | null })[],
  maxMeters = Infinity,
): NearestPark | null {
  let best: NearestPark | null = null;
  let bestRaw = Infinity;
  for (const p of parks) {
    const d = haversineMeters(from, p.coordinates);
    if (d < bestRaw && d <= maxMeters) {
      bestRaw = d;
      best = {
        name_ja: p.name_ja,
        name_en: p.name_en,
        qid: p.qid ?? null,
        straight_line_m: roundDistance(d),
        park_kind: p.park_kind ?? null,
        park_area_km2: p.area_km2 ?? null,
      };
    }
  }
  return best;
}

/**
 * The facility facts OSM happens to carry, kept exactly as tagged.
 *
 * No normalisation and no interpretation: `fee=no` stays `no` rather than
 * becoming "free", because the tag is what a contributor asserted and the
 * reader can see the raw value and its source. An empty result is omitted by
 * the caller rather than published as an empty object.
 */
export function osmFacilityFacts(tags: Record<string, unknown> | null | undefined): OsmFacilityFacts {
  const out: OsmFacilityFacts = {};
  if (!tags) return out;
  for (const [tag, field] of Object.entries(OSM_FACT_KEYS)) {
    const value = tags[tag];
    if (typeof value === "string" && value.trim()) out[field] = value.trim();
  }
  // An address assembled from addr:* parts, in Japanese order, when present.
  const parts = [
    tags["addr:province"],
    tags["addr:city"],
    tags["addr:town"],
    tags["addr:street"],
    tags["addr:block_number"],
    tags["addr:housenumber"],
  ].filter((v): v is string => typeof v === "string" && !!v.trim());
  const full = typeof tags["addr:full"] === "string" ? (tags["addr:full"] as string) : "";
  const address = full.trim() || parts.join("");
  if (address) out.address = address;
  return out;
}
