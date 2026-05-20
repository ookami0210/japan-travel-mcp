---
license: cc-by-4.0
language:
  - en
  - ja
  - zh
  - ko
  - fr
  - es
  - de
  - it
  - pt
  - ru
  - th
  - vi
  - id
  - ms
  - ar
  - hi
  - tl
task_categories:
  - text-retrieval
  - translation
tags:
  - tourism
  - travel
  - japan
  - mcp
  - model-context-protocol
  - geography
  - cultural-heritage
size_categories:
  - 100K<n<1M
pretty_name: Japan Travel MCP — Comprehensive Travel Data
---

# Japan Travel MCP — Data

The runtime data for the [japan-travel-mcp](https://github.com/ookami0210/japan-travel-mcp)
Model Context Protocol server. Comprehensive Japanese travel data for AI agents,
built from public official sources, covering all 47 prefectures and 1,938 local
government entities.

> Code lives on GitHub: [github.com/ookami0210/japan-travel-mcp](https://github.com/ookami0210/japan-travel-mcp)
> Data lives here. The npm package downloads this dataset on first run.

## Why this dataset exists

Japan's tourism information — created to reach the world — is published across
thousands of municipal websites. Almost none of it is accessible to AI agents in
a structured, multilingual form. This dataset fixes that gap.

— **KJ Sunada**, founder of [KabuK Style](https://kabuk.co.jp/)

## What's inside

```
translations/
  descriptions_complete.jsonl     # 13,394 attractions × 17 languages — rich
                                  # 200-300 char tourism descriptions
  multilingual_complete.jsonl     # 13,961 attractions × 17 languages — names
  multilingual_wikipedia.jsonl    # 17-language names from Wikipedia sitelinks
  jp_en.jsonl                     # JP → EN canonical name mapping

prefectures/                      # 47 prefecture files: municipal-scrape spots
                                  # + Wikidata attractions per prefecture

hotels/
  master.json                     # 19,943 accommodations (Wikidata + OSM merged)

r3/                               # Official designation registries
  maff_gi.json                    # 172 MAFF Geographical Indications (food / agri-products)
  meti_densan.json                # 231 METI-designated Traditional Crafts (Dentō Kōgeihin)
  japan_heritage.json             # 104 Japan Heritage stories (Nihon Isan)
  bunka_intangible.json           # 125 Important Intangible Cultural Properties
  unesco_japan.json               # 58 UNESCO ICH inscriptions for Japan
  translations/
    r3_translations.jsonl         # 690 designation records × 17 languages

glossary/
  seed_canonical.json             # House style for translations
  mlit_canonical.json             # Japan Tourism Agency (MLIT) official terminology
  wikipedia_multilingual.json     # 17-language Wikipedia sitelinks (build-time)

_state/
  wikidata_attractions.json       # 41,404 Wikidata attractions, ja-anchored
  municipalities.json             # 1,938 municipalities + designated-city wards
  municipality_centroids.json     # JIS-coded centroid coordinates
  official_urls.json              # Resolved official tourism site URLs
```

## Source policy — official build-up only

This dataset only contains records that an authoritative public body has
designated, scraped from that body's own publication. No editorial picks,
no AI-curated lists, no UGC.

| Layer | Authority | License of source |
|:---|:---|:---|
| Municipal tourism pages | 1,938 city / town / ward governments of Japan | Public information; per-page robots.txt respected |
| Wikidata attractions | Wikidata, Wikimedia Foundation | CC0 |
| Hotels | Wikidata (CC0) + OpenStreetMap (ODbL) | CC0 + ODbL |
| Tourist descriptions (17-lang) | AI-translated from Wikidata + project glossary | CC BY 4.0 (this compilation) |
| Geographical Indications (GI) | Ministry of Agriculture, Forestry and Fisheries (MAFF) | Government Standard Terms of Use 2.0 (CC BY 4.0 compatible) |
| Traditional Crafts (Dentō Kōgeihin) | Ministry of Economy, Trade and Industry (METI) / Association for the Promotion of Traditional Craft Industries | Public designation; cited |
| Japan Heritage (Nihon Isan) | Agency for Cultural Affairs | Public designation; cited |
| Important Intangible Cultural Properties (Jūyō Mukei Bunkazai / Folk) | Agency for Cultural Affairs — mirrored via Wikidata | CC0 (Wikidata mirror) |
| UNESCO ICH inscriptions for Japan | UNESCO — mirrored via Wikidata | CC0 (Wikidata mirror) |

## 17 supported languages

English (en), Japanese (ja), Chinese Simplified (zh), Korean (ko),
French (fr), Spanish (es), German (de), Italian (it), Portuguese (pt),
Russian (ru), Thai (th), Vietnamese (vi), Indonesian (id), Malay (ms),
Arabic (ar), Hindi (hi), Tagalog (tl).

The 17 were chosen to cover the JNTO inbound-tourism priority languages plus
major source markets across Asia-Pacific, Europe, and the Middle East.

## Coverage

All 47 prefectures are populated; every entity has descriptions in **all 17
languages** (no per-language gaps inside the 13,394-entity description set).
The chart shows the per-prefecture entity count — the long tail outside Kyoto
/ Tokyo / Hokkaido is the actual point of this dataset.

![Coverage by prefecture](coverage_chart.png)

**13,394 attractions × 17 languages = 227,698 description cells.** Plus 690
official-designation records (MAFF GI, METI crafts, Japan Heritage,
Bunka-cho intangible records, UNESCO ICH) translated to the same 17
languages = 11,730 more cells. Plus 13,961 canonical names × 17 languages
= 237,337 more cells.

## Refresh cadence

The GitHub Actions cron in the [code repo](https://github.com/ookami0210/japan-travel-mcp)
refreshes data on two tracks and re-publishes to this dataset:

| Track | Items | Cycle | Per-day work |
|:---|:---|:---|:---|
| Municipal tourism pages | 1,938 entities | rolling 30 days | ~70 / day |
| Official designation sources | 5 sources | rolling 7 days | 1–2 sources / day |

Each domain is hit at most once per cycle.

## How to use

### Via the MCP server (recommended)

```bash
npm install -g japan-travel-mcp
japan-travel-mcp                  # downloads this dataset to ~/.japan-travel-mcp/data/ on first run
```

Then add to your AI agent's MCP config (Claude Desktop, Cursor, etc.).

### Direct download

```python
from huggingface_hub import snapshot_download
local_dir = snapshot_download(
    repo_id="open-travel/japan-travel-mcp-data",
    repo_type="dataset",
)
```

```bash
# Or via git-lfs:
git clone https://huggingface.co/datasets/open-travel/japan-travel-mcp-data
```

## Citation

If you use this dataset in research or a product, please cite:

```
KJ Sunada, "Japan Travel MCP", 2026.
GitHub: https://github.com/ookami0210/japan-travel-mcp
HF dataset: https://huggingface.co/datasets/open-travel/japan-travel-mcp-data
License: CC BY 4.0
```

## License

**Data**: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — free to use
including commercially, attribution required.

**Code** (separate repo): [MIT](https://github.com/ookami0210/japan-travel-mcp/blob/main/LICENSE).

Underlying source data carries its own licenses (see source-policy table above).
