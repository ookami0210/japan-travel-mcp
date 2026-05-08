/**
 * Lodging-type classifier.
 *
 * The OSM `tourism=*` tags in source data only give us
 * `hotel/motel/guesthouse/hostel/apartment`, but Japanese travellers (and
 * the agents querying this server) expect ryokan / onsen ryokan / shukubo /
 * kominka as first-class distinctions. Tag entries by JA/EN name keywords
 * so the `hotel_type` filter works without a re-scrape.
 */

export type LodgingType =
  | "ryokan"
  | "onsen_ryokan"
  | "shukubo"
  | "kominka"
  | "minshuku"
  | "hostel"
  | "guest_house"
  | "apartment"
  | "motel"
  | "hotel";

/**
 * Narrow input contract for `classifyLodging`. Structurally compatible
 * with the `HotelRecord` type in src/index.ts.
 */
export interface LodgingInput {
  name: string | null;
  name_en: string | null;
  type: string | null;
}

/**
 * Classify a hotel record into one of the LodgingType values. Order
 * matters — most specific patterns are checked first (shukubo / kominka /
 * onsen_ryokan / ryokan / minshuku) before falling back to the OSM-tagged
 * type.
 */
export function classifyLodging(h: LodgingInput): LodgingType {
  const name = (h.name ?? "") + " " + (h.name_en ?? "").toLowerCase();
  // Order matters — most specific first.
  if (name.includes("宿坊") || name.toLowerCase().includes("shukubo") ||
      name.toLowerCase().includes("temple lodging")) return "shukubo";
  if (name.includes("古民家") || name.toLowerCase().includes("kominka") ||
      name.includes("町家") || name.toLowerCase().includes("machiya")) return "kominka";
  if ((name.includes("温泉") || name.toLowerCase().includes("onsen")) &&
      (name.includes("旅館") || name.toLowerCase().includes("ryokan"))) return "onsen_ryokan";
  if (name.includes("旅館") || name.toLowerCase().includes("ryokan")) return "ryokan";
  if (name.includes("民宿") || name.toLowerCase().includes("minshuku")) return "minshuku";
  // Onsen-bearing hotel without 旅館 → still likely a ryokan-ish onsen inn.
  if (name.includes("温泉") || name.toLowerCase().includes("onsen")) return "onsen_ryokan";
  // Fall through to OSM-tagged type.
  const t = (h.type ?? "hotel") as LodgingType;
  if (["hostel","guest_house","apartment","motel","hotel"].includes(t)) return t;
  return "hotel";
}
