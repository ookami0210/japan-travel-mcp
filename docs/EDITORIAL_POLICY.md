# Editorial Policy

> What this dataset includes and excludes, where the line is between
> faithful integration of official sources and personal curation, and how
> the search infrastructure layer relates to the editorial principle.
>
> Companion to [DATA_POLICY.md](../DATA_POLICY.md), which covers what URLs
> we crawl. This document covers what content we surface and why.

## TL;DR

1. **Content principle** — "公式の積み上げ" (kōshiki no tsumiage, _stacking
   official sources_). Every record traces back to a government body, an
   official designation registry, or an officially-recognised public body.
2. **No personal curation** — neither KJ nor any AI assistant adds entries
   based on personal taste. "Lesser-known", "hidden", "off-the-beaten-path"
   selections are explicitly out of scope as primary content.
3. **Faithful interpretation IS allowed** — if an official source describes
   something with specific language ("徐々に失われつつある漆掻きの技"), tagging
   that record `dying-craft` is faithful integration, not curation. The line
   is whether the language came from the source or from us.
4. **Search infrastructure is content-neutral** — BM25 indexing, vector
   embeddings, and ranking algorithms are retrieval tools. They reorder
   official content; they do not select or suppress it.
5. **MCP server vs. LLM client** — MCP returns official content
   comprehensively. LLM clients (Claude, ChatGPT, etc.) reframe and select
   from that content for the end user's context. Subjective filtering
   ("famous", "hidden", "good for kids") is the LLM client's job.

---

## Why this principle

Japan has thousands of municipalities, each with tourism information
published in Japanese on government and tourism-association websites.
That information is largely invisible to AI agents and to non-Japanese
travellers. The opportunity is to translate and distribute it openly,
not to second-guess it.

The risk in any "best of Japan" project is that the curator's perspective
narrows the dataset. A KJ-curated list looks like KJ's preferences; an
AI-curated list looks like the training data's biases. A list of
official designations looks like the country's own institutional view of
what matters — that's the asset class no other open dataset offers.

The project's value is **"yatta-mongachi" (やったもんがち)** — the work
that has been done is the moat. Translating 690+ designation records into
17 languages, scraping 1,938 municipalities, normalising the schema:
nobody else has done this end-to-end. Adding KJ's taste on top would
add nothing the world wants, and would dilute the institutional
authority the dataset rests on.

KJ is a business operator, not a tourism content expert. The project's
positioning has to reflect that honestly.

---

## What is "official"

We accept content from these source classes:

### National government

- Cabinet Office, Ministry of Education (MEXT), Ministry of Agriculture
  (MAFF), Ministry of Economy (METI), Ministry of Internal Affairs
  (MIC), Japan Tourism Agency (JTA), Agency for Cultural Affairs (Bunka-cho)
- Their published lists, registries, and designations

### Local government

- All 47 prefectures, all 1,741 municipalities, the 197 designated-city
  wards
- Their official `.lg.jp` / `.go.jp` / `.pref.*.jp` / `.city.*.jp` /
  `.town.*.jp` / `.village.*.jp` / `.vill.*.jp` domains

### Officially-recognised public bodies

- Tourism associations (観光協会, 観光連盟) registered with their
  prefecture
- Chambers of commerce (商工会議所) as authoritative for craft industry
- JNTO (Japan National Tourism Organization)
- Universities and museum institutions for academic / cultural records

### Official designation registries

- Geographical Indications (MAFF GI) — 172 records
- Traditional Crafts / Dentō Kōgeihin (METI) — 231 records
- Japan Heritage / Nihon Isan (Bunka-cho) — 104 stories
- Important Intangible Cultural Properties + Folk (Bunka-cho) — 125 records
- UNESCO Intangible Cultural Heritage (Japan inscriptions) — 58 records
- UNESCO World Heritage (Japan) — to be added
- 重要伝統的建造物群保存地区 / Jūden-ken (Bunka-cho) — to be added
- Ramsar Convention Japanese sites — to be added when relevant

### Wikidata (CC0)

Wikidata is accepted because:

- it is a public, openly-licensed knowledge graph
- entries are sourced from Wikipedia and other public references
- attribution is preserved per record (Q-id, source URL)

We do not treat Wikidata as a curator — we treat it as a structured mirror
of public information, the same way we treat OpenStreetMap.

### What is NOT official

- Personal blogs, food review sites (食べログ, トリップアドバイザー), SNS
  posts
- AI-generated entity lists where the AI selects which entities to include
- Lists curated by KJ or any AI assistant from personal taste
- Aggregated review rankings as primary content

---

## The line: faithful integration vs. curation

This is the most-asked question and deserves precision.

### Allowed (faithful integration)

If an official source describes a craft with the exact phrase _"徐々に失われ
つつある"_ (gradually being lost), tagging that record with a
machine-readable label such as `endangered-tradition` is **faithful
integration**. The judgment came from the source; we only normalised the
language for retrieval.

If MAFF GI organises records into food / craft / fish / fruit / vegetable
/ etc. categories, copying those category labels into a `category` field
is **faithful integration**. MAFF made the call; we lifted the call into
a structured form.

If Wikidata classifies an entity as `instance-of: 磨崖仏` (Q606960),
adopting that classification as a tag is **faithful integration**.
Wikidata made the call; we normalised it.

If a tourism-association page calls a festival "山梨県下最大の火祭り"
(the largest fire festival in Yamanashi prefecture), recording the text
verbatim in a `description` and tagging the record `festival-fire` is
**faithful integration**. The official source labelled it; we kept that
labelling discoverable.

### Forbidden (personal curation)

Choosing which 30 of 231 traditional crafts to feature on a "must-see
crafts of Japan" page would be **curation**. The selection is the
editorial act, regardless of how official the underlying records are.

Adding a `lesser-known` tag based on an AI's judgment of relative fame
would be **curation**. "Lesser-known" is a comparative judgment we are
making; nothing in the official sources says it.

Producing a "best 50 Japanese gardens" list ranked by aesthetic quality
would be **curation**. Even if every garden is from an official register,
the ranking imposes a viewpoint.

### The test

Ask: **could this label, tag, or selection be regenerated by another
person reading the same official sources?** If yes, it is integration.
If it requires our taste, it is curation.

---

## Search infrastructure is content-neutral

The dataset contains official records. Retrieving them is a separate
question from selecting them.

The following are accepted retrieval-layer techniques because they
re-order existing content without adding or removing it:

- **Substring / keyword match** (current `search_area`)
- **BM25 inverted index** with morphological tokenisation (kuromoji for
  Japanese)
- **Dense vector embeddings** (multilingual-e5 etc.) for semantic search
- **Reciprocal Rank Fusion** combining multiple retrievers
- **Cross-encoder rerankers** for precision when latency permits
- **Pre-filters on structured fields** (prefecture, accommodation type,
  designation registry, etc.)

The model used for embeddings has its own training-data biases — that is
a property of any retrieval system and is acceptable for the same reason
we accept BM25's IDF weighting: it is a public, neutral retrieval tool,
not a content judgment. We will note the embedding model used (e.g.
`multilingual-e5-large`) in dataset metadata so callers can swap it.

### Concrete example

Query: _"Show me Japanese crafts that are dying out"_

The dataset has 231 traditional craft records. None has a `dying` tag we
authored. Each has a long description from METI which sometimes contains
phrases like _"後継者不足"_ or _"技術伝承が課題"_.

- A keyword search for "dying" returns nothing — the word does not appear
- A vector embedding search ranks records whose descriptions discuss
  succession problems higher
- A hybrid retrieval surfaces the right cluster: 漆掻き, 紙漉き, 桶結, 組子, 木綿絞り

We have not curated. We have not selected. We have made the existing
official text retrievable through a richer query model. The records, the
attributions, the descriptions all came from METI.

---

## MCP server vs. LLM client — responsibility split

The MCP server is a **comprehensive returner of official content**. It
should:

- Return all matching records, not just a "best" subset
- Preserve `source_url`, `authority`, `disclaimer` on every record
- Sort by retrieval relevance, not by editorial preference
- Expose filters that map to structured fields (prefecture, category,
  registry, season) without smuggling in subjective filters

The LLM client (Claude, ChatGPT, Cursor, the user's agent) is the
**reframing layer**. It should:

- Read the MCP results in the user's context
- Decide which subset to surface (this is where "lesser-known", "famous",
  "good for a rainy day" lives)
- Translate, summarise, and present in the user's preferred form
- Cite back to the official source so the user can verify

This split is the project's editorial firewall. The MCP server cannot
have a perspective; the LLM client always has one (the model's training).
By keeping subjective filtering at the LLM-client edge, we keep the data
layer clean and the perspective layer auditable per response.

We document this split in user-facing places (README, tool descriptions)
so users understand what the MCP can and cannot do.

---

## Implementation phases — principle compliance

### Phase 1 — store more raw text (no schema change beyond text size)

We currently keep up to 8 paragraphs of body text per spot. Phase 1
raises that to ~30 paragraphs and relaxes the per-paragraph length filter.

Principle compliance: trivial — we are storing more of what the official
source already published.

### Phase 2 — vector embeddings as a retrieval index

We compute one ~1024-dimensional vector per spot using a multilingual
embedding model, store it as an index, and add a semantic-search MCP
tool.

Principle compliance: the embedding model is a public retrieval tool,
the index sorts existing official records, and no record is added or
removed by virtue of having an embedding. This is identical in principle
to BM25 and TF-IDF, which are accepted information-retrieval methods.

### Phase 3 — hybrid retrieval (BM25 + vector + RRF)

We combine BM25 (sparse, exact-match strong) with vector search (dense,
semantic) using Reciprocal Rank Fusion, optionally followed by a
cross-encoder reranker.

Principle compliance: same as Phase 2, layered. The BM25 score, the
vector score, and the RRF formula are all public and content-neutral.
The reranker model — if used — is documented like the embedding model.

---

## Future expansions of "official"

We anticipate accepting submissions directly from official bodies in
the future:

- A tourism association sends us their attractions list → accepted as a
  source on par with their public website (verified via their domain)
- A municipality contributes structured data (events, opening hours) →
  accepted with attribution
- A national designation register adds a new category → covered as soon
  as the register publishes a machine-readable feed

We will publish a short submission protocol when the inbound interest
materialises. Until then, the project pulls from public official sources
unilaterally.

### Grey zones we have not decided

These will be decided case by case, with the call recorded in the
[ADR directory](decisions/):

- Local newspaper feature articles (大手新聞社の地方版): treat as official
  for tourism purposes, or exclude as editorial?
- Academic research outputs (大学の地域研究センター): treat as official,
  or only when a public dataset is released?
- Religious bodies (寺社の自社サイト): yes (the institution is the
  authority on itself), but with care around proselytising content
- Tourism trade unions / brand collectives (e.g. 日本酒蔵元会): yes when
  they are an officially-recognised industry body, no when they are a
  marketing collective

---

## Decision log

| Date | Decision | Reference |
|:---|:---|:---|
| 2026-04-27 | "公式の積み上げ" set as the data-source principle. Personal curation by KJ or any AI is forbidden as a primary content source. | KJ chat, project_japan_travel_mcp_data_principle.md |
| 2026-04-30 | Multi-source acquisition (city hall + tourism org URLs in parallel) approved. Per-municipality coverage targets were set after the acquisition strategy was clarified, not the other way around. | docs/decisions/0001-multi-source-tourism-data.md |
| 2026-04-30 | Strategy 4 (city-hall outbound link + internal kanko subpage harvest) added. The internal kanko subpage on a city-hall domain counts as a tourism seed because the city's own publication identifies it as such. | commit `be1d009` |
| 2026-05-01 | Faithful integration vs. curation line clarified. Tags whose language is sourced from the official text are faithful integration; tags requiring KJ/AI judgment are curation and forbidden. | KJ chat, this document |
| 2026-05-01 | Phase 1 (more raw text) + Phase 2 (vector embeddings) + Phase 3 (BM25+vector hybrid) accepted as principle-compliant retrieval infrastructure. The LLM client is the explicit reframing layer for subjective queries. | KJ chat, this document |
