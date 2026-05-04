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
};

const ALL_PARTY = ["family", "couple", "solo", "group"];

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
      source: "no_signal",
    };
  }
  let minutes: number | null = null;
  let priceTier: number | null = null;
  const priceTierOrder = ["free", "low", "mid", "high", "luxury"] as const;
  const sufSet = new Set<string>();

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

  return {
    typical_visit_minutes: minutes,
    price_band: priceBand,
    suitable_for: sufSet.size > 0 ? Array.from(sufSet) : null,
    source,
  };
}
