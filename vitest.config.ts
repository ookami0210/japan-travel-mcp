import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    // The MCP integration smoke suites (tests/server_smoke.test.ts,
    // tests/server_http_smoke.test.ts) build the full server which
    // ingests every per-prefecture fixture, the R-3 sources, and the
    // multilingual translation jsonl streams; first-call latency on a
    // cold worker is dominated by JSON ingestion, not test logic.
    // 60s keeps the suite green on slow runners without masking real
    // hangs (we observed ~35s wall time on a populated workstation).
    testTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "scrapers/lib/**/*.ts"],
      exclude: ["**/*.d.ts", "scrapers/lib/slack.ts"],
    },
  },
});
