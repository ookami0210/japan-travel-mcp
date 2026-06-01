import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { materialiseFixtures } from "./_helpers/server_fixtures.js";

// ──────────────────────────────────────────────────────────────────────
// The HTTP entrypoint (src/index_http.ts) has the same `isMain` guard as the
// stdio one. Like tests/bin_spawn.test.ts, spawn the built file THROUGH A
// SYMLINK and assert main() actually runs — a guard that compares
// import.meta.url to an unresolved argv[1] never matches under a symlink, so
// the server would exit without ever listening. PORT=0 takes an OS-assigned
// free port so the test never collides with the 7860 default.

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const distEntry = resolve(repoRoot, "dist/src/index_http.js");

let cacheDir: string;
let binLink: string;

function spawnHttpAndAwaitBanner(
  entry: string,
): Promise<{ banner: boolean; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        JAPAN_TRAVEL_MCP_CACHE: cacheDir,
        JAPAN_TRAVEL_MCP_SKIP_LOCAL: "1",
        JAPAN_TRAVEL_MCP_NO_REFRESH: "1",
        PORT: "0",
        HF_TOKEN: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(
        new Error(`timed out waiting for HTTP listen banner.\nstderr:\n${stderr}`),
      );
    }, 30_000);

    function finish(banner: boolean): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolvePromise({ banner, stderr });
    }

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (/HTTP MCP server listening on/.test(stderr)) finish(true);
    });

    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(
        new Error(
          `server exited (code ${code}) without listening — main() never ran.\n` +
            `stderr:\n${stderr || "(empty)"}`,
        ),
      );
    });
  });
}

describe("HTTP entrypoint (spawned through a symlink)", () => {
  beforeAll(async () => {
    if (!existsSync(distEntry)) {
      execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit" });
    }
    cacheDir = await mkdtemp(join(tmpdir(), "japan-travel-mcp-http-bin-"));
    await materialiseFixtures(cacheDir);
    binLink = join(cacheDir, "japan-travel-mcp-http-bin");
    await symlink(distEntry, binLink);
  });

  afterAll(async () => {
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  });

  it("starts the HTTP server when launched via a symlinked path", async () => {
    const { banner } = await spawnHttpAndAwaitBanner(binLink);
    expect(banner).toBe(true);
  });
});
