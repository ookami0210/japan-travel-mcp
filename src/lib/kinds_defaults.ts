// Kinds-defaults table for Phase A constraint-encodable fields.
//
// Iter 58: the research落とし込み (Phase A2/A8/A9) calls
// for `typical_visit_minutes`, `price_band`, and `suitable_for` defaults
// per kind so an agent can build a feasibility-checked itinerary even
// when the per-entity Wikipedia / OSM data is sparse.
//
// Defaults are SECONDARY signals: per-entity values from OSM (`fee`),
// Wikipedia abstract, or 公式 sites override these. Absence of override
// → emit kinds-default with `source: "kinds_default"` so the consumer
// knows to treat as estimate.

export interface KindsDefaultEnrichment {
  typical_visit_minutes: number | null;
  price_band: "free" | "low" | "mid" | "high" | "luxury" | null;
  suitable_for: string[] | null;
  /**
   * Weather adaptability. `indoor` = primary experience is under roof
   * (museum / aquarium / depachika / castle main keep). `outdoor` = primary
   * experience is open-air (beach / mountain / waterfall / sand_dune).
   * `mixed` = both meaningfully present (preservation_district, onsen_resort
   * with bath houses + outdoor strolling). `null` = unknown / kind list empty.
   *
   * Intended for "rainy day alternatives" / "indoor activities" filtering.
   */
  indoor_capable: "indoor" | "outdoor" | "mixed" | null;
  /** Source provenance — "kinds_default" or "osm" or "wikidata" or "official". */
  source: "kinds_default" | "osm_override" | "no_signal";
}

// Default minutes — empirically chosen midpoints from common JTB / 観光庁
// "推奨滞在時間" guidance. None claim precision; downstream agents should
// treat them as estimates.
const KIND_MINUTES: Record<string, number> = {
  buddhist_temple: 30,
  buddhist_monastery: 60,
  shinto_shrine: 25,
  pilgrimage_site: 45,
  sacred_mountain: 240,  // typically a half-day or more
  castle: 90,
  japanese_castle: 90,
  hilltop_castle: 90,
  plains_castle: 90,
  mountain_castle: 120,
  museum: 120,
  garden: 60,
  park: 90,
  national_park: 240,
  preservation_district: 90,
  monument: 20,
  natural_monument: 30,
  great_buddha: 30,
  designated_cultural_property_jp: 30,
  archaeological_site: 60,
  historic_site: 60,
  plaza: 30,
  waterfall: 30,
  lake: 60,
  cave: 45,
  beach: 120,
  volcano: 180,
  active_volcano: 180,
  valley: 90,
  mountain_range: 240,
  mountain: 180,
  onsen_resort: 180,  // = a couple of hours bath + food
  hot_spring: 60,
  lighthouse: 30,
  resort: 240,
  memorial: 30,
  theater: 150,
  airport: 0,  // not a destination
  // Iter 58 name-derived kinds
  yokocho: 90,
  shotengai: 60,
  jokamachi: 120,
  shukuba: 90,
  kaido: 240,
  buke_yashiki: 60,
  machiya: 45,
  tanada: 45,
  sand_dune: 60,
  yakei: 30,
  observation: 30,
  mining_heritage: 90,
  industrial_heritage: 90,
  giyofu: 30,
  depachika: 60,
  michi_no_eki: 45,
  ski_resort: 360,
  aquarium: 150,
  zoo: 240,
  bridge: 15,
  dam: 30,
  // Architectural
  palace: 60,
  religious_building: 30,
  // Themed kinds added 2026-05-09 from multi-judge feedback
  lavender_field: 90,
  flower_garden: 90,
  dark_sky: 60,
  kabuki_theater: 180,
  chashitsu: 60,
  tea_ceremony: 60,
  pilgrimage_route: 480,  // multi-day route, top end
  fishing_village: 60,
  port_town: 60,
  cycling_route: 240,
  fermented_food_site: 45,
  anime_pilgrimage: 30,
  farm_experience: 180,
  agritourism: 180,
  wildlife_observation: 120,
};

// Price bands by kind. Most temples/shrines are free, but famous ones
// charge entry. Castle/museum charge ¥500-1500, resorts vary widely.
// "free" is for places typically with no entry fee. "low" is < ¥1000,
// "mid" is ¥1000-3000, "high" is ¥3000-10000, "luxury" is over ¥10000.
const KIND_PRICE: Record<string, KindsDefaultEnrichment["price_band"]> = {
  buddhist_temple: "free",
  shinto_shrine: "free",
  pilgrimage_site: "free",
  sacred_mountain: "free",
  natural_monument: "free",
  monument: "free",
  great_buddha: "low",
  museum: "low",
  garden: "low",
  park: "free",
  national_park: "free",
  preservation_district: "free",
  castle: "low",
  japanese_castle: "low",
  archaeological_site: "free",
  historic_site: "free",
  plaza: "free",
  waterfall: "free",
  lake: "free",
  cave: "low",
  beach: "free",
  volcano: "free",
  active_volcano: "free",
  onsen_resort: "mid",
  hot_spring: "low",
  lighthouse: "free",
  resort: "high",
  memorial: "free",
  theater: "mid",
  yokocho: "mid",
  shotengai: "free",
  jokamachi: "free",
  shukuba: "free",
  kaido: "free",
  buke_yashiki: "low",
  machiya: "low",
  tanada: "free",
  sand_dune: "free",
  yakei: "free",
  observation: "low",
  mining_heritage: "low",
  industrial_heritage: "low",
  giyofu: "low",
  depachika: "low",
  michi_no_eki: "free",
  ski_resort: "high",
  aquarium: "mid",
  zoo: "low",
  bridge: "free",
  dam: "free",
  palace: "low",
  religious_building: "free",
  airport: "free",
  lavender_field: "low",
  flower_garden: "low",
  dark_sky: "free",
  kabuki_theater: "high",
  chashitsu: "mid",
  tea_ceremony: "mid",
  pilgrimage_route: "free",
  fishing_village: "free",
  port_town: "free",
  cycling_route: "free",
  fermented_food_site: "low",
  anime_pilgrimage: "free",
  farm_experience: "low",
  agritourism: "low",
  wildlife_observation: "free",
};

// Suitable-for tags. "all" is shorthand for ["family", "couple", "solo", "group"].
const KIND_SUITABLE: Record<string, string[]> = {
  buddhist_temple: ["all"],
  shinto_shrine: ["all"],
  pilgrimage_site: ["solo", "group"],
  sacred_mountain: ["solo", "group"],
  museum: ["family", "couple", "solo", "group"],
  garden: ["all"],
  park: ["family", "couple"],
  national_park: ["family", "couple", "group"],
  castle: ["family", "couple", "solo", "group"],
  archaeological_site: ["solo", "couple", "group"],
  historic_site: ["solo", "couple", "group"],
  waterfall: ["family", "couple"],
  lake: ["family", "couple"],
  cave: ["couple", "solo", "group"],
  beach: ["family", "couple", "group"],
  volcano: ["solo", "couple", "group"],
  active_volcano: ["solo"],  // higher risk; recommend solo experienced only
  onsen_resort: ["couple", "solo", "group"],
  hot_spring: ["couple", "solo", "group"],
  resort: ["family", "couple", "group"],
  memorial: ["all"],
  theater: ["couple", "group"],
  yokocho: ["couple", "solo", "group"],
  shotengai: ["family", "couple"],
  jokamachi: ["family", "couple", "group"],
  shukuba: ["couple", "group"],
  kaido: ["solo", "group"],
  buke_yashiki: ["family", "couple", "solo", "group"],
  machiya: ["couple", "solo"],
  tanada: ["couple", "solo"],
  sand_dune: ["family", "couple"],
  yakei: ["couple"],
  observation: ["all"],
  mining_heritage: ["solo", "group"],
  industrial_heritage: ["solo", "group"],
  giyofu: ["couple", "solo"],
  depachika: ["family", "couple"],
  michi_no_eki: ["family", "group"],
  ski_resort: ["family", "couple", "group"],
  aquarium: ["family", "couple"],
  zoo: ["family"],
  preservation_district: ["family", "couple"],
  lavender_field: ["all"],
  flower_garden: ["all"],
  dark_sky: ["couple", "solo", "group"],
  kabuki_theater: ["couple", "solo", "group"],
  chashitsu: ["couple", "solo"],
  tea_ceremony: ["couple", "solo", "group"],
  pilgrimage_route: ["solo", "couple", "group"],
  fishing_village: ["family", "couple", "solo"],
  cycling_route: ["solo", "couple", "group"],
  fermented_food_site: ["couple", "solo", "group"],
  anime_pilgrimage: ["solo", "couple"],
  farm_experience: ["family", "couple", "group"],
  agritourism: ["family", "couple", "group"],
  wildlife_observation: ["family", "couple", "solo", "group"],
};

const ALL_PARTY = ["family", "couple", "solo", "group"];

// Indoor / outdoor classification per kind. Driven by what the visit
// experience is *primarily* about. A castle counts as indoor (you go inside
// the main keep / museum); a national park is outdoor; a hot spring resort
// is "mixed" because the bath buildings shelter from rain but most onsen
// 街 strolls happen outside. When kind list mixes indoor + outdoor, the
// result resolves to "mixed" so a "rainy day" filter still keeps it.
const KIND_INDOOR: Record<string, "indoor" | "outdoor" | "mixed"> = {
  // Indoor primary
  museum: "indoor",
  art_museum: "indoor",
  biographical_museum: "indoor",
  aquarium: "indoor",
  theater: "indoor",
  depachika: "indoor",
  buke_yashiki: "indoor",
  machiya: "indoor",
  giyofu: "indoor",
  former_school_building: "indoor",
  historic_house: "indoor",
  historic_building: "indoor",
  kominka: "indoor",
  temple_main_hall: "indoor",
  shrine_main_building: "indoor",
  palace: "indoor",
  // Castle main keep is indoor; hilltop_castle / mountain_castle remain
  // mixed because the climb is open-air. Plains castles also have outdoor
  // moats. Default: castle = mixed (keep accessible, grounds outdoor).
  // Outdoor primary
  beach: "outdoor",
  waterfall: "outdoor",
  lake: "outdoor",
  cave: "outdoor",
  volcano: "outdoor",
  active_volcano: "outdoor",
  valley: "outdoor",
  mountain_range: "outdoor",
  mountain: "outdoor",
  sacred_mountain: "outdoor",
  national_park: "outdoor",
  quasi_national_park: "outdoor",
  park: "outdoor",
  garden: "outdoor",
  japanese_garden: "outdoor",
  strolling_garden: "outdoor",
  daimyo_garden: "outdoor",
  natural_monument: "outdoor",
  remarkable_tree: "outdoor",
  giant_tree: "outdoor",
  island: "outdoor",
  tanada: "outdoor",
  sand_dune: "outdoor",
  yakei: "outdoor",
  observation: "outdoor",
  bridge: "outdoor",
  road_bridge: "outdoor",
  dam: "outdoor",
  archaeological_site: "outdoor",
  midden: "outdoor",
  kofun: "outdoor",
  zenpou_kouenfun: "outdoor",
  kofungun: "outdoor",
  circular_kofun: "outdoor",
  square_kofun: "outdoor",
  ski_resort: "outdoor",
  pilgrimage_site: "outdoor",
  kaido: "outdoor",
  shukuba: "outdoor",
  jokamachi: "outdoor",
  cultural_landscape: "outdoor",
  plaza: "outdoor",
  zoo: "outdoor",
  // Mixed — meaningful indoor and outdoor
  buddhist_temple: "mixed",
  buddhist_monastery: "mixed",
  shinto_shrine: "mixed",
  hachiman_shrine: "mixed",
  shikinaisha: "mixed",
  provincial_temple: "mixed",
  provincial_nunnery: "mixed",
  tatchu_subtemple: "mixed",
  former_buddhist_temple: "mixed",
  great_buddha: "mixed",
  buddha_statue: "mixed",
  chokuganji: "mixed",
  religious_building: "mixed",
  shukubo: "indoor",  // overnight stay → primarily indoor experience
  castle: "mixed",
  japanese_castle: "mixed",
  hilltop_castle: "mixed",
  plains_castle: "mixed",
  mountain_castle: "mixed",
  gusuku: "mixed",
  hot_spring: "mixed",
  onsen_resort: "mixed",
  preservation_district: "mixed",
  yokocho: "mixed",
  shotengai: "mixed",
  michi_no_eki: "mixed",
  resort: "mixed",
  memorial: "mixed",
  monument: "mixed",
  designated_cultural_property_jp: "mixed",
  historic_site: "mixed",
  mining_heritage: "mixed",
  industrial_heritage: "mixed",
  lighthouse: "mixed",
  railway_station: "mixed",
  unmanned_station: "mixed",
  // Themed kinds (2026-05-09)
  lavender_field: "outdoor",
  flower_garden: "outdoor",
  dark_sky: "outdoor",
  kabuki_theater: "indoor",
  chashitsu: "indoor",
  tea_ceremony: "mixed",
  pilgrimage_route: "outdoor",
  fishing_village: "mixed",
  port_town: "mixed",
  cycling_route: "outdoor",
  fermented_food_site: "indoor",
  anime_pilgrimage: "mixed",
  farm_experience: "outdoor",
  agritourism: "outdoor",
  wildlife_observation: "outdoor",
};

/**
 * Compute kinds-default enrichment from a list of kinds. Picks the most
 * specific kind (= longest minutes) for `typical_visit_minutes`, the
 * highest price tier from any kind for `price_band` (so a castle in a
 * preservation district keeps the castle's `low` rather than the
 * district's `free`), and the union of suitable_for tags.
 *
 * `osmFee` overrides price_band: "yes" → at least "low", "no" → "free",
 * "donation" → "free".
 */
export function enrichKindsDefaults(
  kinds: string[],
  osmFee?: string | undefined | null,
): KindsDefaultEnrichment {
  if (kinds.length === 0) {
    return {
      typical_visit_minutes: null,
      price_band: null,
      suitable_for: null,
      indoor_capable: null,
      source: "no_signal",
    };
  }
  let minutes: number | null = null;
  let priceTier: number | null = null;
  const priceTierOrder = ["free", "low", "mid", "high", "luxury"] as const;
  const sufSet = new Set<string>();
  let sawIndoor = false;
  let sawOutdoor = false;
  let sawMixed = false;

  for (const k of kinds) {
    const m = KIND_MINUTES[k];
    if (typeof m === "number" && (minutes === null || m > minutes)) minutes = m;
    const p = KIND_PRICE[k];
    if (p) {
      const tier = priceTierOrder.indexOf(p);
      if (tier >= 0 && (priceTier === null || tier > priceTier)) priceTier = tier;
    }
    const suf = KIND_SUITABLE[k];
    if (suf) {
      for (const t of suf) {
        if (t === "all") for (const a of ALL_PARTY) sufSet.add(a);
        else sufSet.add(t);
      }
    }
    const indoor = KIND_INDOOR[k];
    if (indoor === "indoor") sawIndoor = true;
    else if (indoor === "outdoor") sawOutdoor = true;
    else if (indoor === "mixed") sawMixed = true;
  }

  let priceBand: KindsDefaultEnrichment["price_band"] =
    priceTier !== null ? priceTierOrder[priceTier] : null;

  let source: KindsDefaultEnrichment["source"] = "kinds_default";
  if (osmFee) {
    source = "osm_override";
    if (osmFee === "no" || osmFee === "donation") priceBand = "free";
    else if (osmFee === "yes" && (priceBand === null || priceBand === "free")) {
      priceBand = "low";
    }
  }

  let indoorCapable: KindsDefaultEnrichment["indoor_capable"];
  if (sawMixed || (sawIndoor && sawOutdoor)) indoorCapable = "mixed";
  else if (sawIndoor) indoorCapable = "indoor";
  else if (sawOutdoor) indoorCapable = "outdoor";
  else indoorCapable = null;

  return {
    typical_visit_minutes: minutes,
    price_band: priceBand,
    suitable_for: sufSet.size > 0 ? Array.from(sufSet) : null,
    indoor_capable: indoorCapable,
    source,
  };
}

/**
 * Helper for tool boundary filtering. Given the requested cap (`free` →
 * only free; `low` → free or low; `mid` → free | low | mid; ...) and the
 * record's price_band, decide whether the record passes the budget filter.
 * Records with null price_band fail closed when the cap is `free` (we can't
 * confirm it's free) but pass when the cap is `mid` or higher (no info →
 * trust the agent has another signal).
 */
export function passesPriceBandCap(
  recordBand: KindsDefaultEnrichment["price_band"],
  cap: NonNullable<KindsDefaultEnrichment["price_band"]>,
): boolean {
  const order = ["free", "low", "mid", "high", "luxury"] as const;
  const capIdx = order.indexOf(cap);
  if (recordBand === null) {
    // Strict caps (free / low) → drop unknowns; permissive caps (mid+) keep.
    return capIdx >= 2;
  }
  return order.indexOf(recordBand) <= capIdx;
}

/**
 * Indoor filter for "rainy day" queries. `mixed` records pass both filters
 * because the indoor portion is meaningful (e.g. preservation_district has
 * indoor machiya tours; onsen_resort has covered baths).
 */
export function passesIndoorFilter(
  recordIndoor: KindsDefaultEnrichment["indoor_capable"],
  want: "indoor" | "outdoor",
): boolean {
  if (recordIndoor === null) return false;
  if (want === "indoor") return recordIndoor === "indoor" || recordIndoor === "mixed";
  return recordIndoor === "outdoor" || recordIndoor === "mixed";
}
