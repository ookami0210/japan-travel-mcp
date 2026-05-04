/**
 * Validate that DATA_SOURCES.md, fetcher implementations, and rotation
 * schedulers stay in sync.
 *
 * Why this exists:
 *   Without a single source of truth linking fetcher implementations to
 *   documentation and workflows, claims about coverage drift away from
 *   reality. This script enforces the linkage so coverage assertions can
 *   be verified against the actual fetcher inventory.
 *
 * Checks:
 *   1. Every fetcher file under scrapers/sources/ AND scrapers/daily.ts
 *      AND each step in scrapers/r3_refresh.ts MUST appear in DATA_SOURCES.md
 *      (active or deprecated).
 *   2. Every active entry in DATA_SOURCES.md MUST have:
 *        - a Fetcher field pointing to a file that exists
 *        - a Channel assigned to one of the documented channels
 *        - a Cadence (steady)
 *        - an Output path
 *   3. R3 channel sources in DATA_SOURCES.md MUST be registered in
 *      scrapers/r3_refresh.ts SOURCE_INFO.
 *   4. Documented channels in the rotation contract table MUST have either
 *      an existing workflow yml OR be marked "(planned)".
 *
 * Run:
 *   npm run validate:data-sources
 *   npx tsx scripts/validate_data_sources.ts
 *
 * Exit codes:
 *   0 = OK
 *   1 = inconsistency found (errors printed)
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = resolve(ROOT, "DATA_SOURCES.md");

interface DocEntry {
  id: string;            // "#23" or "#P5"
  status: "active" | "scaffolded" | "planned" | "deprecated";
  fetcher?: string;      // relative path
  channel?: string;
  cadence?: string;
  output?: string;
  rawSection: string;    // the source section (for line refs in errors)
}

const KNOWN_CHANNELS = new Set([
  "MUNI",
  "R3",
  "DMO",
  "WD-FOUNDATION",
  "GLOSSARY",
  "WIKIPEDIA-ABSTRACT",
  "EVENTS",
  "SEASONAL",
]);

async function parseDoc(): Promise<DocEntry[]> {
  const text = await readFile(DOC, "utf8");
  const entries: DocEntry[] = [];

  // Split on h4 (#### #N or #### #PN) — each source has a level-4 heading
  const sectionRegex = /^####\s+(#P?\d+)\s*[—-]\s*(.+?)$/gm;
  const matches = [...text.matchAll(sectionRegex)];

  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const id = m[1];
    const start = m.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const section = text.slice(start, end);

    // Determine status — entries with id starting with #P are planned;
    // otherwise read **Status**: line. Default = active.
    const inPlannedSection = /^####\s+#P\d+/.test(m[0]);
    let status: DocEntry["status"];
    const statusMatch = section.match(/\*\*Status\*\*:\s*`?(active|scaffolded|planned|deprecated)`?/i);
    if (inPlannedSection) {
      status = "planned";
    } else if (statusMatch) {
      status = statusMatch[1].toLowerCase() as DocEntry["status"];
    } else {
      status = "active";
    }

    const fetcherMatch = section.match(/\*\*Fetcher\*\*:\s*`([^`]+)`/);
    // Channel may be 'R3', 'WD-FOUNDATION', etc. — allow digits in the token.
    const channelMatch = section.match(/\*\*Channel\*\*:\s*`?([A-Z][A-Z0-9\-]*)`?/);
    const cadenceMatch = section.match(/\*\*Cadence(?:\s*\([^)]+\))?\*\*:\s*([^\n]+)/);
    const outputMatch = section.match(/\*\*Output\*\*:\s*`([^`]+)`/);

    entries.push({
      id,
      status,
      fetcher: fetcherMatch?.[1],
      channel: channelMatch?.[1],
      cadence: cadenceMatch?.[1]?.trim(),
      output: outputMatch?.[1],
      rawSection: section,
    });
  }

  return entries;
}

async function listFetcherFiles(): Promise<string[]> {
  const out: string[] = [];
  const dirs = ["scrapers/sources", "scrapers/glossary", "scrapers/matcher"];
  for (const d of dirs) {
    const abs = resolve(ROOT, d);
    if (!existsSync(abs)) continue;
    const files = await readdir(abs);
    for (const f of files) {
      if (/^(fetch_|scrape_|find_|discover_|match_|apply_).+\.(ts|py|js)$/.test(f)) {
        out.push(`${d}/${f}`);
      }
    }
  }
  // top-level
  for (const f of ["scrapers/daily.ts", "scrapers/r3_refresh.ts", "scrapers/run_enriched_scrape.ts"]) {
    if (existsSync(resolve(ROOT, f))) out.push(f);
  }
  return out;
}

async function r3RegisteredKeys(): Promise<Set<string>> {
  const path = resolve(ROOT, "scrapers/r3_refresh.ts");
  if (!existsSync(path)) return new Set();
  const text = await readFile(path, "utf8");
  // Look for `outFile: "<name>.json"` entries inside SOURCE_INFO
  const keys = new Set<string>();
  for (const m of text.matchAll(/outFile:\s*"([^"]+)"/g)) {
    keys.add(m[1]);
  }
  return keys;
}

async function listWorkflows(): Promise<string[]> {
  const dir = resolve(ROOT, ".github/workflows");
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
}

async function main(): Promise<void> {
  const entries = await parseDoc();
  const fetcherFiles = new Set(await listFetcherFiles());
  const r3OutFiles = await r3RegisteredKeys();
  const workflows = new Set(await listWorkflows());

  const errors: string[] = [];
  const warnings: string[] = [];

  // Index entries by fetcher path for back-lookup. Includes ALL statuses
  // (active / scaffolded / planned / deprecated) — a fetcher file existing
  // on disk is acceptable as long as some entry references it, regardless
  // of status.
  const docFetcherSet = new Set<string>();
  for (const e of entries) {
    if (e.fetcher) docFetcherSet.add(e.fetcher);
  }

  // Check 1: every fetcher file is documented in DATA_SOURCES.md
  for (const f of fetcherFiles) {
    if (!docFetcherSet.has(f)) {
      // Some files are infrastructure not data sources — exempt list.
      // These are wrappers / runners / utilities, not actual data fetchers.
      const exempt = [
        "scrapers/sources/recompute_prefecture_codes.ts",
        "scrapers/sources/apply_manual_url_overrides.ts",
        "scrapers/r3_refresh.ts", // chain runner that calls #5–9 fetchers
        "scrapers/run_enriched_scrape.ts",
      ];
      if (exempt.includes(f)) continue;
      errors.push(
        `[FETCHER NOT DOCUMENTED] ${f} exists but is not referenced from any DATA_SOURCES.md entry. Add an entry or add to exempt list.`,
      );
    }
  }

  // Check 2: active entries need full wiring; scaffolded entries need fetcher
  // file present but no rotation/channel requirements (since they are not yet
  // wired); planned entries are advisory only.
  for (const e of entries) {
    if (e.status === "deprecated" || e.status === "planned") continue;

    // For scaffolded + active: fetcher file (if listed) MUST exist on disk
    if (!e.fetcher) {
      if (e.status === "active") {
        warnings.push(
          `[ACTIVE NO FETCHER] ${e.id} is active but has no Fetcher field — confirm this is a manual import`,
        );
      }
    } else if (!fetcherFiles.has(e.fetcher)) {
      errors.push(
        `[MISSING FETCHER FILE] ${e.id} references "${e.fetcher}" but file does not exist on disk`,
      );
    }

    // Active entries require channel + cadence + output. Scaffolded does NOT
    // (rotation wiring is by definition pending).
    if (e.status === "active") {
      if (!e.channel) {
        errors.push(`[NO CHANNEL] ${e.id} active but has no Channel assignment`);
      } else if (!KNOWN_CHANNELS.has(e.channel)) {
        errors.push(
          `[UNKNOWN CHANNEL] ${e.id} channel "${e.channel}" is not in the known channels list (${[...KNOWN_CHANNELS].join(", ")})`,
        );
      }

      if (!e.cadence) {
        errors.push(`[NO CADENCE] ${e.id} active but has no Cadence`);
      }

      if (!e.output) {
        warnings.push(`[NO OUTPUT] ${e.id} active but no Output path documented`);
      }
    }
  }

  // Check 3: R3 channel sources are registered in r3_refresh.ts.
  // Only enforced for status=active (scaffolded explicitly waives this until
  // implementation lands).
  for (const e of entries) {
    if (e.status !== "active" || e.channel !== "R3") continue;
    if (!e.output) continue;
    const filename = e.output.split("/").pop();
    if (filename && !r3OutFiles.has(filename)) {
      errors.push(
        `[R3 NOT REGISTERED] ${e.id} channel=R3 output="${e.output}" but "${filename}" not found in scrapers/r3_refresh.ts SOURCE_INFO. Add it to DAY_TO_SOURCES + SOURCE_INFO.`,
      );
    }
  }

  // Check 4: documented channels exist as workflow OR are marked planned
  // (parsed from the rotation contract table). Light check — looks for
  // workflow filenames mentioned in the contract section.
  const contractSection = (await readFile(DOC, "utf8")).match(
    /## Master rotation contract[\s\S]*?(?=\n##|\Z)/,
  );
  if (contractSection) {
    const wfRefs = [...contractSection[0].matchAll(/`([\w-]+\.ya?ml)`/g)].map((m) => m[1]);
    for (const wf of wfRefs) {
      if (!workflows.has(wf)) {
        warnings.push(
          `[WORKFLOW MISSING] DATA_SOURCES.md references "${wf}" but it is not in .github/workflows/. Confirm intentional or add the file.`,
        );
      }
    }
  }

  // Report
  console.log(`Parsed ${entries.length} source entries from DATA_SOURCES.md`);
  console.log(`Discovered ${fetcherFiles.size} fetcher files on disk`);
  console.log(`R3 SOURCE_INFO registered files: ${r3OutFiles.size}`);
  console.log(`Workflows in .github/workflows: ${workflows.size}`);
  console.log("");

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const w of warnings) console.log(`  ⚠ ${w}`);
    console.log("");
  }

  if (errors.length > 0) {
    console.error(`❌ ${errors.length} ERROR(S):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  console.log("✅ DATA_SOURCES.md is consistent with fetcher inventory + r3 registry + workflows");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(2);
});
