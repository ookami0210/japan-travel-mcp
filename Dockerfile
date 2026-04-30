# Hugging Face Spaces / Cloudflare / any container host.
# Builds the HTTP-MCP entrypoint and starts it on $PORT (HF Spaces default 7860).

FROM node:20-slim AS build
WORKDIR /app

# Install deps first to leverage Docker layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=optional

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ── runtime stage ─────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /app

# Only ship dist + production deps to keep the image lean.
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# HF Spaces convention: the container must listen on $PORT (default 7860).
ENV PORT=7860
ENV NODE_ENV=production

# The data cache lives under /data on HF Spaces (persistent across restarts
# on Pro tier; ephemeral on free tier — re-downloaded on cold start).
ENV JAPAN_TRAVEL_MCP_CACHE=/data/japan-travel-mcp

EXPOSE 7860

# HF Spaces sends SIGTERM on shutdown; node handles that fine for a plain
# HTTP server, no extra trapping needed.
CMD ["node", "dist/src/index_http.js"]
