import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    globals: false,
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "scrapers/lib/**/*.ts"],
      exclude: ["**/*.d.ts", "scrapers/lib/slack.ts"],
    },
  },
});
