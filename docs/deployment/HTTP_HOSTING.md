# Hosting the HTTP-MCP transport

This guide stands up the **always-on, hosted** form of the server — the
Streamable-HTTP transport in [`src/index_http.ts`](../../src/index_http.ts) —
on Google Cloud. The npm/`npx` (stdio) path keeps working unchanged; this is the
*additional* front door for clients that can't spawn a local process (web/SaaS
MCP clients, mobile, hosted agents).

> **What this repo gives you vs. what you run:** everything here is
> deploy-ready — `Dockerfile`, a Cloud Run manifest, env-tunable rate limiting +
> access logs. **Provisioning the actual GCP resources (project, billing, IAM,
> deploy) is done by you with your own `gcloud` credentials.** The commands
> below are the whole job; copy-paste and fill in `PROJECT_ID` / `REGION`.

## How the server behaves when hosted

- Listens on `$PORT` (default `7860`). `POST /mcp` is the MCP endpoint;
  `GET /healthz` is a liveness probe; `GET /` is a landing page.
- **Connects first, downloads data lazily.** `/healthz` and the MCP handshake
  answer immediately; the ~685 MB dataset downloads from Hugging Face in the
  background and the first tool *call* waits for it. So a fresh instance is
  "up" in milliseconds and "fully answering queries" once the download lands.
- **Keeps itself fresh.** Past a 24 h TTL it reconciles the cache against the
  upstream dataset (incremental etag diff), so a long-lived host tracks the
  rolling daily updates without redeploys.
- **No LLM tokens are spent server-side.** Search is BM25 + a local
  `multilingual-e5-small` embedding model + RRF. The calling client's LLM pays
  for reading results, exactly as in the local model.

## Prerequisites

- A GCP project with billing enabled, and `gcloud` authenticated:
  `gcloud auth login && gcloud config set project PROJECT_ID`
- Enable the APIs you'll use:
  ```sh
  gcloud services enable run.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
  ```
- Pick a region close to your users, e.g. `asia-northeast1` (Tokyo).

---

## Option A — Cloud Run (recommended: least ops, HTTPS + URL for free)

Cloud Run gives you a managed HTTPS endpoint with autoscaling and zero machine
maintenance. The one wrinkle for this workload: the data cache lives in the
instance's in-memory filesystem, so size memory accordingly (the manifest uses
`2Gi`).

```sh
# 1. One-time: an Artifact Registry repo to hold the image.
gcloud artifacts repositories create japan-travel-mcp \
  --repository-format=docker --location=REGION

# 2. Build + push the image (Cloud Build reads the repo Dockerfile).
gcloud builds submit \
  --tag REGION-docker.pkg.dev/PROJECT_ID/japan-travel-mcp/japan-travel-mcp:latest

# 3a. Deploy (imperative — simplest).
gcloud run deploy japan-travel-mcp \
  --image REGION-docker.pkg.dev/PROJECT_ID/japan-travel-mcp/japan-travel-mcp:latest \
  --region REGION \
  --port 7860 \
  --memory 2Gi --cpu 1 \
  --min-instances 1 --max-instances 4 \
  --no-cpu-throttling \
  --allow-unauthenticated \
  --set-env-vars JAPAN_TRAVEL_MCP_CACHE=/tmp/japan-travel-mcp-cache,JAPAN_TRAVEL_MCP_RATE_LIMIT=120
```

Or, declaratively, edit the two placeholders in
[`deploy/cloudrun/service.yaml`](../../deploy/cloudrun/service.yaml) and:

```sh
# 3b. Deploy (declarative — version-controlled config).
gcloud run services replace deploy/cloudrun/service.yaml --region REGION
gcloud run services add-iam-policy-binding japan-travel-mcp --region REGION \
  --member=allUsers --role=roles/run.invoker   # public endpoint; see Security
```

Grab the URL:

```sh
gcloud run services describe japan-travel-mcp --region REGION --format='value(status.url)'
# → https://japan-travel-mcp-xxxx-an.a.run.app   (your /mcp endpoint is <url>/mcp)
```

**Cost (rough, low traffic):** one always-warm `cpu=1 / 2Gi` instance is the
dominant line — order of **$25–45/month** for `min-instances=1`. Set
`--min-instances 0` to scale to zero (near-$0 idle) at the price of a cold start
that re-downloads the dataset on the next request — fine for a demo, poor for a
"snappy" endpoint.

> **Cutting memory to 1Gi:** mount a GCS bucket as a volume and point
> `JAPAN_TRAVEL_MCP_CACHE` at it, so the cache lives on the volume instead of in
> RAM. Add `--add-volume name=cache,type=cloud-storage,bucket=YOUR_BUCKET` and
> `--add-volume-mount volume=cache,mount-path=/data`, then set the cache env to
> `/data`. (Requires the 2nd-gen execution environment.)

---

## Option B — Compute Engine VM (predictable cost, cache on real disk)

A small VM avoids the in-RAM-cache constraint (the 685 MB lives on the boot
disk) and has the most predictable bill. You manage the box and TLS yourself.

```sh
# 1. Create a small VM (Ubuntu, 2 vCPU / 2 GB is plenty for low traffic).
gcloud compute instances create japan-travel-mcp \
  --machine-type=e2-small --image-family=ubuntu-2204-lts --image-project=ubuntu-os-cloud \
  --zone=REGION-a --tags=mcp-http

# 2. Open the port (or, better, front it with TLS — see below).
gcloud compute firewall-rules create allow-mcp-http \
  --allow=tcp:7860 --target-tags=mcp-http --source-ranges=0.0.0.0/0

# 3. On the VM: install Docker, then run the image with a persistent cache dir
#    and automatic restart.
sudo apt-get update && sudo apt-get install -y docker.io
sudo docker build -t japan-travel-mcp https://github.com/ookami0210/japan-travel-mcp.git
sudo docker run -d --restart=always -p 7860:7860 \
  -v /var/lib/japan-travel-mcp:/data/japan-travel-mcp \
  -e JAPAN_TRAVEL_MCP_RATE_LIMIT=120 \
  --name japan-travel-mcp japan-travel-mcp
```

**TLS:** MCP clients expect `https://`. Easiest is to run [Caddy](https://caddyserver.com/)
in front for automatic Let's Encrypt certs (needs a domain pointed at the VM):

```
# /etc/caddy/Caddyfile
mcp.example.com {
    reverse_proxy localhost:7860
}
```

Then the endpoint is `https://mcp.example.com/mcp`.

**Cost:** `e2-small` ≈ **$13/month** + a few GB of disk. The cheapest
always-on option.

---

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `7860` | Listen port. |
| `JAPAN_TRAVEL_MCP_CACHE` | `~/.japan-travel-mcp/data` | Where the dataset cache lives. On Cloud Run use `/tmp/...` (in-memory) or a mounted volume. |
| `JAPAN_TRAVEL_MCP_RATE_LIMIT` | `120` | Max `/mcp` requests per IP per window. `0` disables limiting. |
| `JAPAN_TRAVEL_MCP_RATE_WINDOW_MS` | `60000` | Rate-limit window length (ms). |
| `JAPAN_TRAVEL_MCP_REFRESH_TTL_HOURS` | `24` | How often a long-lived host re-checks the dataset for updates. |
| `JAPAN_TRAVEL_MCP_NO_REFRESH` | unset | Set to pin the cache and never check upstream. |
| `HF_TOKEN` | unset | Only needed if the HF dataset is private. |

## Connecting an MCP client

```sh
# Sanity checks
curl https://YOUR_HOST/healthz          # → ok
```

Point any Streamable-HTTP MCP client at `https://YOUR_HOST/mcp`. For clients
configured via JSON (URL-style connectors):

```json
{ "mcpServers": { "japan-travel": { "url": "https://YOUR_HOST/mcp" } } }
```

## Security notes for a public endpoint

- **Rate limiting** is on by default (`120 req/IP/min`) and trusts the first
  `X-Forwarded-For` hop, which Cloud Run / load balancers set correctly. Tune
  via the env vars above. The limiter is per-instance — for multi-instance
  deployments put a shared limiter (Cloud Armor, an API gateway) in front.
- **Access logs**: one line per request to stderr (`ip method url status ms`),
  health probes excluded. These flow to Cloud Logging automatically on GCP.
- **`--allow-unauthenticated`** makes `/mcp` world-reachable (the point of a
  public MCP server). If you'd rather gate it, drop that flag and front the
  service with Cloud Armor / IAP / an API key check.
- The endpoint runs **no live source fetches and spends no LLM tokens** per
  query, so abuse costs you compute/bandwidth, not API spend.

## Operating notes

- **Freshness**: the background refresh keeps a long-lived instance current;
  nothing to schedule. A redeploy or instance recycle just re-pulls the cache.
- **Logs to watch**: `MCP server running` / `listening on`, `downloading N/М
  files`, `data ready`, and `background data bootstrap failed (will retry on
  first query)` if HF was briefly unreachable at boot.
