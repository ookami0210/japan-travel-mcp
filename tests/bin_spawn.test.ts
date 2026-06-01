import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

import { EXPECTED_TOOLS, materialiseFixtures } from "./_helpers/server_fixtures.js";

// ──────────────────────────────────────────────────────────────────────
// End-to-end entrypoint test.
//
// The in-process smoke suites call buildServer() directly, so they never
// exercise the `isMain` guard that decides whether mainStdio() runs. The
// published bin is launched through a node_modules/.bin symlink (npx,
// `npm i -g`, Claude Desktop), so this test spawns the BUILT dist binary
// THROUGH A SYMLINK and asserts it actually starts and answers tools/list.
// A guard that compares import.meta.url against an unresolved argv[1]
// fails under that symlink and the process exits silently — which is the
// regression this test exists to catch.

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const distEntry = resolve(repoRoot, "dist/src/index.js");

let cacheDir: string;
let binLink: string;

async function spawnAndListTools(entry: string): Promise<{
  tools: string[];
  banner: boolean;
  exitCode: number | null;
  stderr: string;
}> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [entry], {
      env: {
        ...process.env,
        JAPAN_TRAVEL_MCP_CACHE: cacheDir,
        JAPAN_TRAVEL_MCP_SKIP_LOCAL: "1",
        JAPAN_TRAVEL_MCP_NO_REFRESH: "1",
        HF_TOKEN: "",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      rejectPromise(
        new Error(`timed out waiting for tools/list response.\nstderr:\n${stderr}`),
      );
    }, 30_000);

    function finish(tools: string[], exitCode: number | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolvePromise({
        tools,
        banner: /MCP server running on stdio/.test(stderr),
        exitCode,
        stderr,
      });
    }

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      let nl: number;
      while ((nl = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, nl).trim();
        stdout = stdout.slice(nl + 1);
        if (!line) continue;
        let msg: { id?: number; result?: { tools?: Array<{ name: string }> } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 2 && msg.result?.tools) {
          finish(msg.result.tools.map((t) => t.name).sort(), null);
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    // The process exiting before answering id:2 is exactly the silent
    // no-op failure mode — surface it instead of hanging to the timeout.
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(
        new Error(
          `server exited (code ${code}) without answering tools/list — ` +
            `mainStdio() never ran.\nstderr:\n${stderr || "(empty)"}`,
        ),
      );
    });

    const send = (m: unknown): void => {
      child.stdin.write(`${JSON.stringify(m)}\n`);
    };
    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "bin-spawn-test", version: "0.0.0" },
      },
    });
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  });
}

describe("published bin entrypoint (spawned through a symlink)", () => {
  beforeAll(async () => {
    if (!existsSync(distEntry)) {
      execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "inherit" });
    }
    cacheDir = await mkdtemp(join(tmpdir(), "japan-travel-mcp-bin-"));
    await materialiseFixtures(cacheDir);
    // A node_modules/.bin shim is a symlink to dist/src/index.js — reproduce it.
    binLink = join(cacheDir, "japan-travel-mcp-bin");
    await symlink(distEntry, binLink);
  });

  afterAll(async () => {
    if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
  });

  it("starts and answers tools/list when launched via a symlinked path", async () => {
    const { tools, banner } = await spawnAndListTools(binLink);
    expect(tools).toEqual([...EXPECTED_TOOLS].sort());
    expect(banner).toBe(true);
  });
});
