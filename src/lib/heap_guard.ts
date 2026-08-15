/**
 * Heap headroom guard for the server entrypoints.
 *
 * The full dataset (47 prefecture files + wikidata attractions + hotels)
 * parses to well over 2 GB of JS objects. Node's default old-space limit on
 * many machines and containers is ~2 GB, which made the process die with
 * "FATAL ERROR: Reached heap limit" the first time a tool touched the full
 * corpus (search_area was the reproducible crash). Rather than asking every
 * consumer to pass --max-old-space-size, the entrypoint re-execs itself once
 * with a larger heap when the current limit is too small.
 *
 * stdio: "inherit" hands the parent's stdin/stdout straight to the child, so
 * the MCP stdio transport keeps working across the respawn.
 */

import { spawn } from "node:child_process";
import v8 from "node:v8";

/** Minimum old-space limit (MB) considered safe for the full corpus. */
export const MIN_HEAP_MB = 3072;
/** Heap size (MB) requested when respawning. */
export const TARGET_HEAP_MB = 4096;
/** Set on the respawned child so it never respawns again (loop guard). */
export const RESPAWN_ENV = "JAPAN_TRAVEL_MCP_HEAP_RESPAWNED";

export function currentHeapLimitMb(): number {
  return v8.getHeapStatistics().heap_size_limit / (1024 * 1024);
}

/**
 * When the current heap limit is below MIN_HEAP_MB, respawn the same script
 * with --max-old-space-size=TARGET_HEAP_MB and mirror the child's exit.
 *
 * Returns true when a respawn was started — the caller must NOT continue
 * into normal startup (the child owns stdio from here). Returns false when
 * the current process should just keep running (enough heap, already
 * respawned once, or no script path to re-exec).
 */
export function ensureHeapHeadroom(): boolean {
  if (process.env[RESPAWN_ENV]) return false; // never respawn twice
  if (currentHeapLimitMb() >= MIN_HEAP_MB) return false;
  const script = process.argv[1];
  if (!script) return false;

  const execArgs = [
    ...process.execArgv.filter((a) => !a.startsWith("--max-old-space-size")),
    `--max-old-space-size=${TARGET_HEAP_MB}`,
    script,
    ...process.argv.slice(2),
  ];
  const child = spawn(process.execPath, execArgs, {
    stdio: "inherit",
    env: { ...process.env, [RESPAWN_ENV]: "1" },
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
  console.error(
    `[japan-travel-mcp] heap limit ${Math.round(currentHeapLimitMb())} MB < ${MIN_HEAP_MB} MB — respawned with --max-old-space-size=${TARGET_HEAP_MB}`,
  );
  return true;
}
