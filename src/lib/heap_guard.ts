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
import { readFileSync } from "node:fs";
import v8 from "node:v8";

/** Minimum old-space limit (MB) considered safe for the full corpus. */
export const MIN_HEAP_MB = 3072;
/** Heap size (MB) requested when respawning (no container limit detected). */
export const TARGET_HEAP_MB = 4096;
/** Set on the respawned child so it never respawns again (loop guard). */
export const RESPAWN_ENV = "JAPAN_TRAVEL_MCP_HEAP_RESPAWNED";
/** Operator override for the respawn heap size (MB). Wins over detection. */
export const HEAP_MB_ENV = "JAPAN_TRAVEL_MCP_MAX_HEAP_MB";
/** Headroom left under a detected container limit for non-heap memory. */
const CONTAINER_HEADROOM_MB = 512;

export function currentHeapLimitMb(): number {
  return v8.getHeapStatistics().heap_size_limit / (1024 * 1024);
}

/**
 * Container (cgroup) memory limit in MB, or null when unlimited / not in a
 * container. Asking V8 for more heap than the cgroup allows doesn't fail
 * fast — it OOM-kills the whole container once the heap actually grows —
 * so the respawn target must stay under this.
 */
export function containerMemoryLimitMb(): number | null {
  for (const path of [
    "/sys/fs/cgroup/memory.max", // cgroup v2
    "/sys/fs/cgroup/memory/memory.limit_in_bytes", // cgroup v1
  ]) {
    try {
      const raw = readFileSync(path, "utf8").trim();
      if (raw === "max") return null;
      const bytes = Number(raw);
      // v1 reports a huge sentinel when unlimited.
      if (!Number.isFinite(bytes) || bytes <= 0 || bytes > 2 ** 60) return null;
      return Math.floor(bytes / (1024 * 1024));
    } catch {
      // try next path
    }
  }
  return null;
}

/** The heap size a respawn should request, honoring env + container limit. */
export function respawnTargetHeapMb(): number {
  const envRaw = process.env[HEAP_MB_ENV];
  if (envRaw) {
    const n = Number(envRaw);
    if (Number.isFinite(n) && n >= 512) return Math.floor(n);
  }
  const container = containerMemoryLimitMb();
  if (container !== null) {
    return Math.min(TARGET_HEAP_MB, Math.max(512, container - CONTAINER_HEADROOM_MB));
  }
  return TARGET_HEAP_MB;
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
  const current = currentHeapLimitMb();
  if (current >= MIN_HEAP_MB) return false;
  const script = process.argv[1];
  if (!script) return false;

  const target = respawnTargetHeapMb();
  if (target <= current) {
    // A memory-constrained container (e.g. 2Gi Cloud Run) can't give us
    // more heap than we already have — respawning would only risk a
    // container-level OOM kill. Run as-is and say so.
    console.error(
      `[japan-travel-mcp] heap limit ${Math.round(current)} MB < ${MIN_HEAP_MB} MB, ` +
        `but the container/env cap allows only ${target} MB — running without respawn. ` +
        `Set ${HEAP_MB_ENV} to override.`,
    );
    return false;
  }

  const execArgs = [
    ...process.execArgv.filter((a) => !a.startsWith("--max-old-space-size")),
    `--max-old-space-size=${target}`,
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
    `[japan-travel-mcp] heap limit ${Math.round(current)} MB < ${MIN_HEAP_MB} MB — respawned with --max-old-space-size=${target}`,
  );
  return true;
}
