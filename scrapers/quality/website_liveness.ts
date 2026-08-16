/**
 * Official-website liveness probe — activity signal v0 for the hotels master.
 *
 * WHY: permit rosters are application-based and say nothing about whether a
 * facility operates TODAY. The ledger target is ACTIVE inventory, so every
 * entry needs activity evidence. The cheapest real-world signal: does the
 * facility's own official site respond? A dead domain is strong (not
 * conclusive) evidence of closure; an alive one anchors the later
 * official-page content pass (hours, 営業期間/seasonality, reservations).
 *
 * One request per site (HEAD, GET fallback), identifying UA, 8s timeout.
 * Verdicts: alive (2xx/3xx) / blocked_unknown (401/403/405/429 — bot
 * defenses, NOT evidence of closure) / http_error (4xx/5xx) /
 * unreachable (DNS/TLS/timeout). Honest nulls: no verdict is "closed" —
 * closure needs a second signal (permit 廃止, page content).
 *
 * Checkpointed: safe to interrupt and re-run, only unprobed URLs are hit
 * (30-day recheck window).
 *
 * Run: npx tsx scrapers/quality/website_liveness.ts [--limit N]
 * Output: data/_state/website_liveness.json (per-hotel verdicts + summary)
 */

import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);
const MASTER_URL = new URL("data/hotels/master.json", ROOT);
const STATE_URL = new URL("data/_state/website_liveness.json", ROOT);

const USER_AGENT =
  "JapanTravelMCP/1.3 (+https://github.com/ookami0210/japan-travel-mcp; official-site liveness check)";
const TIMEOUT_MS = 8_000;
const CONCURRENCY = 16;
const CHECKPOINT_EVERY = 250;
const RECHECK_DAYS = 30;

type Verdict = "alive" | "blocked_unknown" | "http_error" | "unreachable";

interface Probe {
  url: string;
  verdict: Verdict;
  status: number | null;
  checked_at: string;
}

interface StateFile {
  schema_version: number;
  probes: Record<string, Probe>; // key = hotel id
}

async function probeUrl(url: string): Promise<{ verdict: Verdict; status: number | null }> {
  const attempt = async (method: "HEAD" | "GET"): Promise<{ verdict: Verdict; status: number | null }> => {
    const res = await fetch(url, {
      method,
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
    });
    // Consume nothing: HEAD has no body; for GET we cancel immediately.
    if (method === "GET") await res.body?.cancel().catch(() => {});
    const s = res.status;
    if (s >= 200 && s < 400) return { verdict: "alive", status: s };
    if ([401, 403, 405, 429].includes(s)) return { verdict: "blocked_unknown", status: s };
    return { verdict: "http_error", status: s };
  };
  try {
    const head = await attempt("HEAD");
    // Some servers reject HEAD (405/501) — retry once with GET before judging.
    if (head.verdict === "alive") return head;
    return await attempt("GET");
  } catch {
    try {
      return await attempt("GET");
    } catch {
      return { verdict: "unreachable", status: null };
    }
  }
}

async function main(): Promise<void> {
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : Infinity;

  const master = JSON.parse(await readFile(MASTER_URL, "utf8")) as {
    hotels: { id: string; website: string | null }[];
  };
  let state: StateFile;
  try {
    state = JSON.parse(await readFile(STATE_URL, "utf8")) as StateFile;
  } catch {
    state = { schema_version: 1, probes: {} };
  }

  const cutoff = Date.now() - RECHECK_DAYS * 86_400_000;
  const targets = master.hotels
    .filter((h): h is { id: string; website: string } => !!h.website && /^https?:\/\//.test(h.website))
    .filter((h) => {
      const p = state.probes[h.id];
      return !p || p.url !== h.website || Date.parse(p.checked_at) < cutoff;
    })
    .slice(0, Number.isFinite(limit) ? limit : undefined);

  console.error(`[liveness] ${targets.length} sites to probe (of ${master.hotels.filter((h) => h.website).length} with websites)`);

  let done = 0;
  const save = async (): Promise<void> => {
    const tmp = fileURLToPath(STATE_URL) + ".tmp";
    await writeFile(tmp, JSON.stringify(state, null, 1), "utf8");
    await rename(tmp, fileURLToPath(STATE_URL));
  };

  const queue = [...targets];
  const worker = async (): Promise<void> => {
    for (;;) {
      const h = queue.shift();
      if (!h) return;
      const { verdict, status } = await probeUrl(h.website);
      state.probes[h.id] = {
        url: h.website,
        verdict,
        status,
        checked_at: new Date().toISOString(),
      };
      done += 1;
      if (done % CHECKPOINT_EVERY === 0) {
        await save();
        console.error(`[liveness] ${done}/${targets.length} checkpointed`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await save();

  const counts: Record<Verdict, number> = {
    alive: 0, blocked_unknown: 0, http_error: 0, unreachable: 0,
  };
  for (const p of Object.values(state.probes)) counts[p.verdict] += 1;
  console.error(`[liveness] done. totals across state:`, JSON.stringify(counts));
  console.error(`[liveness] wrote ${fileURLToPath(STATE_URL)}`);
}

main().catch((err) => {
  console.error("[website_liveness] fatal:", err);
  process.exitCode = 1;
});
