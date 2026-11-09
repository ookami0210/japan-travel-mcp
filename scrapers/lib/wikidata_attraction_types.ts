/**
 * The Wikidata classes that define the attraction layer.
 *
 * `fetch_wikidata_attractions_v2.ts` includes an item when Wikidata records
 * it as an instance (P31, followed through P279*) of one of these classes
 * and places it inside a Japanese municipality through P131. `kinds.ts` on
 * the server side maps the same QIDs to kind tags.
 *
 * Every `label` below is the English label Wikidata itself returns for the
 * QID. That is deliberate: an earlier version of this list was typed from
 * memory and seventeen of its thirty-nine QIDs pointed at something else
 * entirely (a person for "natural monument", an insect species for "onsen",
 * a continent for "lighthouse"). Those classes matched nothing in Japan, so
 * the layer silently lacked every onsen, lighthouse and natural monument it
 * claimed to cover, and one of them ("religious building") was so expensive
 * for the query service that the refresh never finished.
 *
 * Check the list against live Wikidata before changing it:
 *
 *   npx tsx scripts/check_wikidata_type_labels.ts
 *
 * The script fails when a label here no longer matches Wikidata's label, so
 * a typo in a QID is caught before it reaches a refresh.
 */

export interface AttractionType {
  qid: string;
  /** English label as Wikidata returns it (rdfs:label@en). */
  label: string;
  /** Why the class is here, or what it replaced. */
  note?: string;
}

export const ATTRACTION_TYPES: readonly AttractionType[] = [
  // --- places and heritage ---
  { qid: "Q570116", label: "tourist attraction" },
  { qid: "Q1081138", label: "historic site", note: "replaces Q15303351 (art material)" },
  { qid: "Q839954", label: "archaeological site" },
  { qid: "Q23413", label: "castle" },
  { qid: "Q16560", label: "palace" },
  { qid: "Q33506", label: "museum" },
  { qid: "Q2087181", label: "historic house museum" },
  { qid: "Q24354", label: "theatre building", note: "replaces Q635155 (creator deity)" },
  { qid: "Q4989906", label: "monument" },
  { qid: "Q1051606", label: "daibutsu", note: "replaces Q1370978 (a photographer)" },
  { qid: "Q15243209", label: "historic district" },
  { qid: "Q22698", label: "park" },
  { qid: "Q1107656", label: "garden" },
  { qid: "Q174782", label: "square" },
  { qid: "Q39715", label: "lighthouse", note: "replaces Q3960 (Australian continent)" },
  { qid: "Q875157", label: "resort", note: "replaces Q1500350 (township of China)" },
  { qid: "Q1248784", label: "airport" },
  // --- religion ---
  { qid: "Q845945", label: "Shinto shrine" },
  { qid: "Q697295", label: "shrine" },
  { qid: "Q5393308", label: "Buddhist temple" },
  { qid: "Q44613", label: "monastery", note: "monastery complexes; most Japanese temples are Q5393308" },
  { qid: "Q15135589", label: "pilgrimage site", note: "replaces Q1496967 (no label)" },
  // --- nature ---
  { qid: "Q23790", label: "natural monument", note: "replaces Q4087053 (a person)" },
  { qid: "Q46169", label: "national park", note: "replaces Q1542076 (no label)" },
  { qid: "Q34038", label: "waterfall" },
  { qid: "Q23397", label: "lake" },
  { qid: "Q35509", label: "cave" },
  { qid: "Q40080", label: "beach" },
  { qid: "Q39816", label: "valley" },
  { qid: "Q8502", label: "mountain" },
  { qid: "Q46831", label: "mountain range" },
  { qid: "Q8072", label: "volcano", note: "replaces Q204324 (volcanic crater lake, already a lake)" },
  { qid: "Q655311", label: "onsen", note: "replaces Q14888011 (an insect species)" },
  { qid: "Q177380", label: "hot spring", note: "replaces Q12536 (Abbasid Caliphate)" },
];

/**
 * QIDs that were in the list and are now deliberately absent.
 *
 * - Q488205 (singer-songwriter) and Q830356 (inflatable boat) stood in for
 *   "designated cultural property". Designations are carried by the P1435
 *   heritage anchor (DATA_SOURCES #16), not by P31, so no class is needed.
 * - Q11197 (logarithm) stood in for "active volcano"; Q1330974 is a subclass
 *   of Q8072 and is reached through it.
 * - Q39614 (cemetery) stood in for "Buddhist monastery"; Q44613 covers it.
 * - Q24398318 (religious building) is a real class, but its subclass tree is
 *   so large that Wikidata cannot answer it for a single Tokyo ward within
 *   its 60 s limit. Every place of worship the layer wants is reached
 *   through the four religion classes above.
 */
export const REMOVED_TYPE_QIDS: readonly string[] = [
  "Q488205",
  "Q830356",
  "Q11197",
  "Q39614",
  "Q24398318",
];

export const ATTRACTION_TYPE_QIDS: readonly string[] = ATTRACTION_TYPES.map((t) => t.qid);
