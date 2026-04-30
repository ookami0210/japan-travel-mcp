---
title: Japan Travel MCP
emoji: 🗾
colorFrom: indigo
colorTo: orange
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: 17-language Japan tourism MCP server (HTTP transport)
---

# Japan Travel MCP — hosted demo

This Space runs the [japan-travel-mcp](https://github.com/ookami0210/japan-travel-mcp)
MCP server with the **Streamable HTTP** transport so any web / SaaS MCP
client can connect remotely (no local install required).

- **Streamable HTTP MCP endpoint**: `POST <space-url>/mcp`
- **Liveness probe**: `GET <space-url>/healthz`
- **Browser landing**: `GET <space-url>/`

For the full project (data, tools, code), see the GitHub repo above and the
[Hugging Face dataset](https://huggingface.co/datasets/kjsunada/japan-travel-mcp-data).

## Why a hosted endpoint?

The npm `japan-travel-mcp` package speaks **stdio**, which is what Claude
Desktop / Cursor / Windsurf use. But cloud-hosted AI agents (ChatGPT plugins,
Lindy, Adept, Claude.ai web) cannot spawn a stdio subprocess on the user's
machine — they need an **HTTP MCP endpoint**, which is what this Space
provides.

## Secrets

The Space needs `HF_TOKEN` (read-scope) set in **Space settings → Secrets**
to download the dataset on cold start. Once the dataset is made public,
the secret is no longer required.
