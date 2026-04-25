# Japan Travel MCP

> The most comprehensive Japanese travel data server for AI agents.  
> 47 prefectures · 1,741 municipalities · Hotels & Ryokan · Multilingual · Built from public sources.

---

## Why this exists

Japan has incredible destinations, rich local culture, and tourism information  
published across thousands of municipal websites — almost none of it accessible to AI agents.

I've spent years in Japan's travel industry. I know how much the world is missing.  
This project exists because I believe Japan deserves to be better represented in the AI era.

Not a business. A contribution.

— **KJ Sunada**, Founder & CEO, [KabuK Style](https://kabuk.com) / [HafH](https://hafh.com)  
Japan's leading travel-tech startup.

---

## Works with any AI

| Interface | Who it's for | How to use |
|-----------|-------------|------------|
| **MCP Server** | Claude, Cursor, Windsurf | Add to MCP config — see below |
| **REST API** | OpenAI, Gemini, LangChain, any LLM | `fetch` any endpoint |
| **Raw JSON** | All developers | Download directly from `/data` |

No API key required. No account. Just use it.

---

## Quick start (Claude Desktop)

```json
{
  "mcpServers": {
    "japan-travel": {
      "command": "npx",
      "args": ["japan-travel-mcp"]
    }
  }
}
```

---

## Quick start (REST API)

```bash
# Search a region — try the places you've never heard of
curl https://japan-travel-mcp.com/api/area?q=tottori

# Get spots in an area — Naoshima, art island in the Seto Inland Sea
curl https://japan-travel-mcp.com/api/spots?city=naoshima

# Get hotels — Onomichi, a hillside port town in Hiroshima
curl https://japan-travel-mcp.com/api/hotels?city=onomichi

# Multilingual content — English, Chinese, Korean from official sources
curl https://japan-travel-mcp.com/api/spots?id=12345&lang=en
```

> All 47 prefectures and all 1,741 municipalities are covered in parallel.
> Tokyo and Kyoto are here too — but the point of this dataset is everywhere else.

---

## What's inside

### Tools (MCP)

| Tool | Description |
|------|-------------|
| `search_area` | Search by place name or keyword |
| `get_spots` | Tourist spots by region |
| `get_hotels` | Accommodation by city or coordinates |
| `get_transport` | Access and transit information |
| `get_events` | Festivals and seasonal events |
| `get_multilingual` | EN / ZH / KO content from official sources |

**Signature tool: `get_multilingual`**
Multilingual tourism content — English, Chinese, Korean — published by Japanese
municipalities and hotels has never been aggregated for AI agents until now.
This is the dataset nobody else has.

### Data layers

```
Layer 1: Municipal tourism pages     — all 1,741 municipalities
Layer 2: Prefecture tourism offices  — all 47 prefectures
Layer 3: Hotel & ryokan master list  — built from 7 sources (see below)
Layer 4: JNTO official data          — multilingual, inbound-focused
Layer 5: OpenStreetMap               — coordinates and POI
```

---

## How the hotel master list is built

No single source covers all of Japan's accommodations.  
We combine multiple public datasets and resolve duplicates by location and name.

```
Sources → Raw data → Entity matching → Master list → Official HP crawl
```

**Sources used:**
- Prefectural ryokan business license registries (旅館業許可リスト)
- JNTO official accommodation data
- OpenStreetMap Japan
- Wikidata
- Municipal tourism websites
- Official hotel homepages
- 観光庁 (Japan Tourism Agency) accommodation statistics

**Matching logic:**  
Two records are considered the same property if they fall within 100 meters of each other  
AND share a sufficiently similar name (accounting for kanji / kana / romaji variations).  
Final confirmation uses phone number or street-level address match.

Uncertain matches go into `/data/review/` — open for community resolution.

**This pipeline is fully open source.**  
The matching engine is in `/scrapers/matcher/`. Imperfect matches are PRs waiting to happen.

---

## A note on data collection

I built this because Japan's tourism information —  
created to reach the world — is nearly invisible to AI agents.  
That gap seemed worth fixing.

Here's how I think about robots.txt:  
I read it on every domain I crawl. I respect clear intent —  
private paths, member areas, anything not meant to be public.  
But when a municipality publishes tourism content  
to attract visitors from around the world,  
I don't think blocking AI agents serves that intent.  
I think it contradicts it.

You may disagree. That's a fair conversation to have.

**What I commit to:**  
- One domain visited at most once per month  
- 5-second minimum interval between page requests — slower than Googlebot, by design  
- Static caching only — source sites are never hit at query time  
- 48-hour response to any removal request (open an issue)

— KJ Sunada

---

## Data freshness

Each domain is visited at most once per month.  
We are not a continuous crawler — we are a periodic snapshot.  
Tourism information changes slowly. Monthly is enough.

Initial dataset: collected over 30 days to avoid server impact.  
Update schedule: monthly, via GitHub Actions.  
Last updated: see `data/metadata.json`

---

## Repository structure

```
japan-travel-mcp/
├── README.md
├── CONTRIBUTING.md
├── DATA_POLICY.md
├── src/
│   ├── index.ts              # MCP server
│   ├── api/                  # REST API endpoints
│   └── tools/                # MCP tool definitions
├── data/
│   ├── prefectures/          # Tourism data by prefecture
│   ├── hotels/
│   │   ├── master.json       # Unified hotel list
│   │   ├── raw/              # Per-source raw data
│   │   └── review/           # Unresolved matches — PRs welcome
│   └── metadata.json         # Source list, update timestamps
├── scrapers/
│   ├── municipal/            # Per-municipality scrapers
│   ├── hotel/                # Hotel HP scrapers
│   ├── sources/              # JNTO, OSM, license registries
│   └── matcher/              # Entity resolution engine
└── .github/
    └── workflows/
        └── scrape.yml        # Monthly update automation
```

---

## Contributing

PRs are not just welcome — they're the whole point.  
See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

Data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)  
Code: [MIT](./LICENSE)

Attribution: **Japan Travel MCP** by KJ Sunada / KabuK Style Inc.
