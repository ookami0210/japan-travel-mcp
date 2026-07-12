/**
 * Deterministic OSM-tag → category mapping.
 *
 * Purpose: give consumers a machine-decidable category — above all
 * "is this a place to eat?" — so meal-cadence / diversity logic in
 * downstream planners can key on `category === "food"` instead of
 * heuristics over names. The mapping is a fixed table over official
 * OSM tag values (ODbL); no inference, no editorial judgement. Records
 * whose tags match nothing stay uncategorized (honest null) — absence
 * means "not machine-decidable from OSM tags", not "not a restaurant".
 *
 * The taxonomy is deliberately coarse and stable (additive-only):
 *   food | market | lodging | onsen | worship | culture | activity |
 *   nature | sightseeing
 *
 * First match wins in the order above — food first, because the food
 * flag is the primary consumer contract.
 */

export type SpotCategory =
  | "food"
  | "market"
  | "lodging"
  | "onsen"
  | "worship"
  | "culture"
  | "activity"
  | "nature"
  | "sightseeing";

const FOOD_AMENITY = new Set([
  "restaurant",
  "cafe",
  "fast_food",
  "food_court",
  "ice_cream",
  "pub",
  "bar",
  "biergarten",
]);

const FOOD_SHOP = new Set([
  "bakery",
  "confectionery",
  "deli",
  "seafood",
  "tea",
  "coffee",
  "wine",
  "sake",
]);

const LODGING_TOURISM = new Set([
  "hotel",
  "guest_house",
  "hostel",
  "motel",
  "apartment",
  "alpine_hut",
  "chalet",
  "camp_site",
  "caravan_site",
]);

const CULTURE_TOURISM = new Set(["museum", "gallery"]);
const CULTURE_AMENITY = new Set(["theatre", "arts_centre", "library"]);

const ACTIVITY_LEISURE = new Set([
  "water_park",
  "sports_centre",
  "stadium",
  "golf_course",
  "ice_rink",
  "swimming_pool",
]);

const NATURE_LEISURE = new Set(["park", "garden", "nature_reserve"]);

const SIGHTSEEING_TOURISM = new Set(["attraction", "viewpoint", "artwork"]);

/**
 * Map raw OSM tags to a category, or null when no rule matches.
 */
export function categorizeFromOsmTags(
  tags: Record<string, string>,
): SpotCategory | null {
  const amenity = tags.amenity;
  const tourism = tags.tourism;
  const shop = tags.shop;
  const leisure = tags.leisure;

  // food — the primary consumer contract ("is this a place to eat?")
  if (amenity && FOOD_AMENITY.has(amenity)) return "food";
  if (shop && FOOD_SHOP.has(shop)) return "food";
  if (tags.cuisine) return "food";

  if (amenity === "marketplace") return "market";

  if (tourism && LODGING_TOURISM.has(tourism)) return "lodging";

  // Japanese public baths / hot springs
  if (amenity === "public_bath" || leisure === "spa") return "onsen";
  if (tags["bath:type"] === "onsen") return "onsen";

  if (amenity === "place_of_worship") return "worship";

  if (tourism && CULTURE_TOURISM.has(tourism)) return "culture";
  if (amenity && CULTURE_AMENITY.has(amenity)) return "culture";

  if (tourism === "theme_park") return "activity";
  if (leisure && ACTIVITY_LEISURE.has(leisure)) return "activity";

  if (leisure && NATURE_LEISURE.has(leisure)) return "nature";
  if (tags.natural) return "nature";

  if (tourism && SIGHTSEEING_TOURISM.has(tourism)) return "sightseeing";
  if (tags.historic) return "sightseeing";

  return null;
}
