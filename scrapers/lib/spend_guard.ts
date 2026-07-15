/**
 * Spend circuit breaker for AI translation passes.
 *
 * Rationale: every translator in this repo is incremental — a normal run
 * translates a handful of genuinely new records. An unexpectedly LARGE
 * batch almost never means "lots of new content"; it means the incremental
 * premise broke (most commonly: the existing-output file was not restored
 * on the CI runner, so everything looked untranslated). That failure mode
 * once re-translated a whole source nightly at real Batch API cost.
 *
 * The guard refuses to spend when the planned request count exceeds the
 * cap, alerts Slack, and exits non-zero so the run fails loudly. A
 * deliberate large run states its intent explicitly by raising the cap env
 * or passing the script's full-rebuild flag — spending big must be a human
 * decision, never an accident.
 */

import { notify } from "./slack.js";

export type SpendGuardVerdict = "ok" | "block";

/** Pure decision — unit-testable without process/env access. */
export function spendGuardDecision(
  planned: number,
  cap: number,
  bypass: boolean,
): SpendGuardVerdict {
  if (bypass) return "ok";
  if (!Number.isFinite(cap) || cap <= 0) return "ok"; // guard disabled
  return planned > cap ? "block" : "ok";
}

export async function enforceSpendGuard(opts: {
  /** log prefix, e.g. "r3_translate" */
  label: string;
  /** records queued for AI translation this run */
  planned: number;
  /** rough cost estimate for the Slack message (null = unknown) */
  estUsd: number | null;
  /** env var that raises/disables the cap, e.g. "R3_SPEND_GUARD_MAX" */
  capEnv: string;
  defaultCap: number;
  /** explicit full-rebuild consent (e.g. FULL_RETRANSLATE=1) */
  bypass?: boolean;
}): Promise<void> {
  const raw = process.env[opts.capEnv]?.trim();
  const cap = raw ? parseInt(raw, 10) : opts.defaultCap;
  const verdict = spendGuardDecision(opts.planned, cap, opts.bypass === true);
  if (verdict === "ok") return;
  const est = opts.estUsd !== null ? ` (est. $${opts.estUsd.toFixed(2)})` : "";
  const msg =
    `🛑 ${opts.label} spend guard: ${opts.planned} records queued for AI translation${est} ` +
    `exceeds the cap of ${cap}. This usually means the existing-output file was not restored ` +
    `before the run — no API spend was made. For a deliberate large run set ` +
    `${opts.capEnv}=<n> (or the script's full-rebuild flag) explicitly.`;
  process.stderr.write(`[${opts.label}] ${msg}\n`);
  await notify(msg, "error");
  process.exit(3);
}
