#!/usr/bin/env node
/**
 * Japan Travel MCP Server (stdio transport).
 *
 * Tools:
 *   - search_area:      search by name/keyword across prefectures, municipalities, attractions
 *   - get_spots:        tourist spots by area (combines municipal scrape + Wikidata)
 *   - get_hotels:       accommodations (pending — Step 2 of )
 *   - get_transport:    access / transit info (pending)
 *   - get_events:       festivals / events (pending)
 *   - get_multilingual: signature tool — returns EN/ZH/KO labels for a spot
 *
 * Data sources:
 *   data/prefectures/<slug>.json   — per-prefecture JSON, two parallel layers:
 *     municipalities[].spots[]      from official-site scraping
 *     wikidata_attractions[]        from Wikidata SPARQL (multilingual + coords)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const DISCLAIMER =
  "Data sourced from public websites (municipal tourism pages) and Wikidata (CC0). Verify directly with the property before making decisions.";

// ──────────────────────────────────────────────────────────────────────
// Data loading

interface ScrapedSpot {
  id: string;
  url: string;
  name: string;
  description: string | null;
  address: string | null;
  coordinates: { lat: number; lng: number } | null;
  language: string;
  source_url: string;
  last_scraped_at: string;
}

interface MunicipalityBlock {
  municipality: {
    code: string;
    name: string;
    prefecture_code: string;
    prefecture_name: string;
  };
  spots: ScrapedSpot[];
}

interface WikidataAttraction {
  qid: string;
  wikidata_url: string;
  name_ja: string | null;
  name_en: string | null;
  name_zh: string | null;
  name_ko: string | null;
  description_en: string | null;
  coordinates: { lat: number; lng: number } | null;
  prefecture_code: string;
  admin_code: string | null;
  admin_name: string | null;
}

interface PrefectureFile {
  prefecture: { code: string; name: string; name_en?: string };
  data_as_of: string;
  source: string;
  municipalities: MunicipalityBlock[];
  wikidata_attractions?: WikidataAttraction[];
}

function findDataDir(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, "data/prefectures");
    if (existsSync(candidate)) return candidate;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("data/prefectures directory not found");
}

let cachedData: PrefectureFile[] | null = null;

async function loadAllPrefectures(): Promise<PrefectureFile[]> {
  if (cachedData) return cachedData;
  const dir = findDataDir();
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: PrefectureFile[] = [];
  for (const f of files) {
    try {
      const content = await readFile(resolve(dir, f), "utf8");
      out.push(JSON.parse(content) as PrefectureFile);
    } catch {
      // skip malformed
    }
  }
  cachedData = out;
  return out;
}

function dataAsOf(prefs: PrefectureFile[]): string | null {
  if (prefs.length === 0) return null;
  return prefs.map((p) => p.data_as_of).sort().pop() ?? null;
}

// ──────────────────────────────────────────────────────────────────────
// Tool: search_area

async function searchArea(args: {
  q: string;
  lang?: string;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const q = args.q.trim().toLowerCase();
  if (q.length === 0) {
    return { error: "empty_query", disclaimer: DISCLAIMER };
  }
  const matches: Array<Record<string, unknown>> = [];

  const matchesText = (s: string | null | undefined): boolean =>
    !!s && s.toLowerCase().includes(q);

  for (const p of prefs) {
    if (
      matchesText(p.prefecture.name) ||
      matchesText(p.prefecture.name_en)
    ) {
      matches.push({
        type: "prefecture",
        code: p.prefecture.code,
        name: p.prefecture.name,
        name_en: p.prefecture.name_en ?? null,
      });
    }
    for (const m of p.municipalities) {
      if (matchesText(m.municipality.name)) {
        matches.push({
          type: "municipality",
          code: m.municipality.code,
          name: m.municipality.name,
          prefecture: p.prefecture.name,
        });
      }
    }
    for (const a of p.wikidata_attractions ?? []) {
      if (
        matchesText(a.name_ja) ||
        matchesText(a.name_en) ||
        matchesText(a.name_zh) ||
        matchesText(a.name_ko)
      ) {
        matches.push({
          type: "attraction",
          source: "wikidata",
          qid: a.qid,
          name_ja: a.name_ja,
          name_en: a.name_en,
          coordinates: a.coordinates,
          prefecture_code: a.prefecture_code,
        });
      }
    }
  }

  return {
    query: args.q,
    match_count: matches.length,
    results: matches.slice(0, 50),
    truncated: matches.length > 50,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_spots

async function getSpots(args: {
  prefecture?: string;
  city?: string;
  limit?: number;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  const limit = Math.min(Math.max(args.limit ?? 50, 1), 500);
  const spots: Array<Record<string, unknown>> = [];

  const matchesPrefecture = (p: PrefectureFile): boolean => {
    if (!args.prefecture) return true;
    const q = args.prefecture.toLowerCase();
    return (
      p.prefecture.name.toLowerCase() === q ||
      p.prefecture.name_en?.toLowerCase() === q ||
      p.prefecture.code === args.prefecture
    );
  };

  for (const p of prefs) {
    if (!matchesPrefecture(p)) continue;
    for (const m of p.municipalities) {
      if (args.city && m.municipality.name !== args.city) continue;
      for (const s of m.spots) {
        spots.push({
          source: "municipal_scrape",
          id: s.id,
          name: s.name,
          description: s.description,
          coordinates: s.coordinates,
          address: s.address,
          url: s.url,
          municipality: m.municipality.name,
          municipality_code: m.municipality.code,
          prefecture: p.prefecture.name,
          language: s.language,
        });
        if (spots.length >= limit) break;
      }
      if (spots.length >= limit) break;
    }
    if (spots.length >= limit) break;
    if (!args.city) {
      for (const a of p.wikidata_attractions ?? []) {
        spots.push({
          source: "wikidata",
          id: a.qid,
          name: a.name_ja || a.name_en,
          name_en: a.name_en,
          name_zh: a.name_zh,
          name_ko: a.name_ko,
          description_en: a.description_en,
          coordinates: a.coordinates,
          url: a.wikidata_url,
          municipality: a.admin_name,
          municipality_code: a.admin_code,
          prefecture: p.prefecture.name,
        });
        if (spots.length >= limit) break;
      }
      if (spots.length >= limit) break;
    }
  }

  return {
    spots,
    count: spots.length,
    truncated: spots.length === limit,
    data_as_of: dataAsOf(prefs),
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_hotels (pending)

async function getHotels(_args: unknown): Promise<unknown> {
  return {
    status: "pending_implementation",
    message:
      "Hotel master list is part of  Step 2 (multi-source merge of 旅館業許可リスト, JNTO, OpenStreetMap, Wikidata, municipal pages). Returns no results until that source layer ships.",
    hotels: [],
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_transport (pending)

async function getTransport(args: { spot_id: string }): Promise<unknown> {
  return {
    status: "pending_implementation",
    message:
      "Transport / access information is part of  Step 4 (official HP enrichment). Pending.",
    spot_id: args.spot_id,
    transport: null,
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_events (pending)

async function getEvents(_args: unknown): Promise<unknown> {
  return {
    status: "pending_implementation",
    message:
      "Event/festival data is not yet part of the ingestion pipeline. Will be sourced from municipal events pages and 観光協会 in a later iteration.",
    events: [],
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool: get_multilingual (signature tool)

async function getMultilingual(args: {
  spot_id: string;
  lang?: string;
}): Promise<unknown> {
  const prefs = await loadAllPrefectures();
  for (const p of prefs) {
    for (const a of p.wikidata_attractions ?? []) {
      if (a.qid === args.spot_id) {
        return {
          spot_id: a.qid,
          source: "wikidata",
          languages: {
            ja: a.name_ja,
            en: a.name_en,
            zh: a.name_zh,
            ko: a.name_ko,
          },
          description_en: a.description_en,
          coordinates: a.coordinates,
          wikidata_url: a.wikidata_url,
          prefecture: p.prefecture.name,
          municipality: a.admin_name,
          data_as_of: p.data_as_of,
          disclaimer: DISCLAIMER,
        };
      }
    }
    for (const m of p.municipalities) {
      for (const s of m.spots) {
        if (s.id === args.spot_id) {
          return {
            spot_id: s.id,
            source: "municipal_scrape",
            languages: { [s.language]: s.name },
            note: "Municipal-scraped spots typically lack multilingual labels. Try a Wikidata QID via search_area for richer multilingual coverage.",
            url: s.url,
            description: s.description,
            data_as_of: p.data_as_of,
            disclaimer: DISCLAIMER,
          };
        }
      }
    }
  }
  return {
    error: "not_found",
    spot_id: args.spot_id,
    hint: "Use search_area or get_spots first to obtain a valid spot_id.",
    disclaimer: DISCLAIMER,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Tool definitions (advertised via ListTools)

const TOOLS = [
  {
    name: "search_area",
    description:
      "Search Japan tourism data by name or keyword. Returns matching prefectures, municipalities, and tourist attractions.\n\nUse this when the user wants to find an area or a specific spot by name. Static reference data, not live search.\n\nAccepts Japanese, English, Chinese, or Korean queries — the data layer searches all label languages.",
    inputSchema: {
      type: "object",
      properties: {
        q: {
          type: "string",
          description: "Search query (any language)",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description: "Preferred response language hint",
        },
      },
      required: ["q"],
    },
  },
  {
    name: "get_spots",
    description:
      "Returns tourist spots in a given prefecture or municipality.\n\nCombines two parallel data sources:\n  - Municipal-website scraping (spots from official tourism pages)\n  - Wikidata (multilingual labels, coordinates, CC0 license)\n\nUse this when the user wants to know 'what to see' in an area. Does NOT return availability or pricing — this is static reference data.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: {
          type: "string",
          description:
            "Prefecture name in Japanese, English, or 2-digit JIS code (e.g., '鳥取県', 'tottori', '31')",
        },
        city: { type: "string", description: "Municipality name in Japanese" },
        limit: {
          type: "number",
          description: "Max spots to return (1–500, default 50)",
        },
      },
    },
  },
  {
    name: "get_hotels",
    description:
      "Returns accommodations (hotels, ryokan) in a given area.\n\nNote: pending implementation — currently returns no results. The hotel master list is part of an upcoming source-merge step ( Step 2).\n\nDoes NOT return availability or pricing.",
    inputSchema: {
      type: "object",
      properties: {
        city: { type: "string" },
        lat: { type: "number" },
        lng: { type: "number" },
        radius: { type: "number", description: "Search radius in metres" },
      },
    },
  },
  {
    name: "get_transport",
    description:
      "Returns access and transit information for a tourist spot. Pending implementation.",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description: "Spot ID returned by search_area or get_spots",
        },
      },
      required: ["spot_id"],
    },
  },
  {
    name: "get_events",
    description:
      "Returns festivals and seasonal events in a prefecture / month. Pending implementation.",
    inputSchema: {
      type: "object",
      properties: {
        prefecture: { type: "string" },
        month: { type: "number", minimum: 1, maximum: 12 },
      },
    },
  },
  {
    name: "get_multilingual",
    description:
      "SIGNATURE TOOL. Returns multilingual labels and content (Japanese / English / Chinese / Korean) for a tourist spot.\n\nUse this when the user wants information for non-Japanese-speaking travellers. Multilingual content is sourced primarily from Wikidata (CC0) — call search_area or get_spots first to obtain a spot_id (typically a Wikidata QID for richest coverage).",
    inputSchema: {
      type: "object",
      properties: {
        spot_id: {
          type: "string",
          description:
            "Either a municipal-scrape spot ID or a Wikidata QID (e.g. 'Q11341')",
        },
        lang: {
          type: "string",
          enum: ["ja", "en", "zh", "ko"],
          description:
            "Specific language to highlight in the response (all languages are still returned)",
        },
      },
      required: ["spot_id"],
    },
  },
];

// ──────────────────────────────────────────────────────────────────────
// Server bootstrap

const server = new Server(
  { name: "japan-travel-mcp", version: "0.0.1" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const args = (rawArgs ?? {}) as Record<string, unknown>;
  try {
    let result: unknown;
    switch (name) {
      case "search_area":
        result = await searchArea({
          q: String(args.q ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      case "get_spots":
        result = await getSpots({
          prefecture: args.prefecture as string | undefined,
          city: args.city as string | undefined,
          limit:
            typeof args.limit === "number"
              ? args.limit
              : args.limit
                ? Number(args.limit)
                : undefined,
        });
        break;
      case "get_hotels":
        result = await getHotels(args);
        break;
      case "get_transport":
        result = await getTransport({ spot_id: String(args.spot_id ?? "") });
        break;
      case "get_events":
        result = await getEvents(args);
        break;
      case "get_multilingual":
        result = await getMultilingual({
          spot_id: String(args.spot_id ?? ""),
          lang: args.lang as string | undefined,
        });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: (err as Error).message ?? "unknown error",
            tool: name,
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[japan-travel-mcp] MCP server running on stdio");
}

main().catch((err) => {
  console.error("[japan-travel-mcp] FATAL:", err);
  process.exit(1);
});
