/**
 * Hugging Face dataset bootstrap.
 *
 * On first run we download the runtime data from
 *   https://huggingface.co/datasets/open-travel/japan-travel-mcp-data
 * to ~/.japan-travel-mcp/data/ (override via env JAPAN_TRAVEL_MCP_CACHE).
 *
 * Subsequent runs use the cached copy and never hit HF.
 *
 * Token policy:
 *   - HF dataset Private  → HF_TOKEN required
 *   - HF dataset Public   → HF_TOKEN optional (anonymous fetch works)
 *
 * Development-mode fallback: if the repository checkout still has data/
 * populated (i.e. you're running from a clone where data/ hasn't been
 * stripped), we use that and skip the HF download entirely.
 */

import { mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const HF_REPO = "open-travel/japan-travel-mcp-data";
const HF_BASE = `https://huggingface.co/datasets/${HF_REPO}/resolve/main`;

const PREFECTURE_SLUGS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima",
  "ibaraki", "tochigi", "gunma", "saitama", "chiba", "tokyo", "kanagawa",
  "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano", "gifu",
  "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara",
  "wakayama", "tottori", "shimane", "okayama", "hiroshima", "yamaguchi",
  "tokushima", "kagawa", "ehime", "kochi", "fukuoka", "saga", "nagasaki",
  "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
];

/** Files that the MCP server needs at runtime. Build-time-only assets
 *  (e.g. glossary/wikipedia_multilingual.json, glossary/wikipedia_pairs.json)
 *  are NOT in this list — they're fetched only when scrapers run. */
export const RUNTIME_FILES: readonly string[] = [
  "translations/descriptions_complete.jsonl",
  "translations/multilingual_complete.jsonl",
  "hotels/master.json",
  "_state/wikidata_attractions.json",
  "_state/municipalities.json",
  "_state/municipality_centroids.json",
  "_state/official_urls.json",
  "r3/maff_gi.json",
  "r3/meti_densan.json",
  "r3/japan_heritage.json",
  "r3/bunka_intangible.json",
  "r3/unesco_japan.json",
  "r3/translations/r3_translations.jsonl",
  "glossary/seed_canonical.json",
  "glossary/mlit_canonical.json",
  ...PREFECTURE_SLUGS.map((s) => `prefectures/${s}.json`),
];

/** Where the cached data lives. */
export function getCacheDir(): string {
  if (process.env.JAPAN_TRAVEL_MCP_CACHE) {
    return process.env.JAPAN_TRAVEL_MCP_CACHE;
  }
  return join(homedir(), ".japan-travel-mcp", "data");
}

async function fileExistsNonEmpty(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

async function downloadOne(
  repoPath: string,
  localPath: string,
  token: string | undefined,
): Promise<void> {
  const url = `${HF_BASE}/${repoPath}`;
  const headers: Record<string, string> = {
    "User-Agent": "japan-travel-mcp/1.0 (+https://github.com/ookami0210/japan-travel-mcp)",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    let hint = "";
    if (res.status === 401 || res.status === 403) {
      hint =
        "\n  → The dataset is currently private. Get a read-scope HF token at" +
        "\n    https://huggingface.co/settings/tokens and pass it as HF_TOKEN," +
        "\n    e.g. HF_TOKEN=hf_xxx npx japan-travel-mcp" +
        "\n  → If you reach this from Claude Desktop, add `\"env\": { \"HF_TOKEN\": \"hf_...\" }`" +
        "\n    to the mcpServers entry in claude_desktop_config.json.";
    } else if (res.status === 404) {
      hint = " — file not found on HF (dataset version mismatch?)";
    }
    throw new Error(
      `HF fetch ${repoPath} → HTTP ${res.status} ${res.statusText}${hint}`,
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await mkdir(dirname(localPath), { recursive: true });
  await writeFile(localPath, buf);
}

/**
 * Ensure all RUNTIME_FILES are present in the cache; download whatever is
 * missing in parallel (concurrency 8). Returns the cache directory.
 */
export async function ensureDataFromHf(): Promise<string> {
  const cacheDir = getCacheDir();
  const token = process.env.HF_TOKEN;

  const missing: string[] = [];
  for (const rel of RUNTIME_FILES) {
    if (!(await fileExistsNonEmpty(join(cacheDir, rel)))) {
      missing.push(rel);
    }
  }

  if (missing.length === 0) {
    process.stderr.write(
      `[japan-travel-mcp] using cached data at ${cacheDir}\n`,
    );
    return cacheDir;
  }

  process.stderr.write(
    `[japan-travel-mcp] downloading ${missing.length}/${RUNTIME_FILES.length} files from huggingface.co/datasets/${HF_REPO}\n`,
  );
  if (!token) {
    process.stderr.write(
      `[japan-travel-mcp] (anonymous mode — set HF_TOKEN if the dataset is private)\n`,
    );
  }

  const CONCURRENCY = 8;
  let completed = 0;
  const errors: string[] = [];
  const queue = [...missing];

  async function worker(): Promise<void> {
    while (true) {
      const rel = queue.shift();
      if (!rel) return;
      try {
        await downloadOne(rel, join(cacheDir, rel), token);
        completed += 1;
        if (completed % 10 === 0 || completed === missing.length) {
          process.stderr.write(
            `[japan-travel-mcp] ${completed}/${missing.length} downloaded\n`,
          );
        }
      } catch (err) {
        errors.push((err as Error).message);
      }
    }
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => worker()),
  );

  if (errors.length > 0) {
    const head = errors.slice(0, 5).join("\n  ");
    const tail =
      errors.length > 5 ? `\n  ... and ${errors.length - 5} more` : "";
    throw new Error(
      `[japan-travel-mcp] ${errors.length} HF downloads failed:\n  ${head}${tail}`,
    );
  }

  process.stderr.write(
    `[japan-travel-mcp] data ready at ${cacheDir}\n`,
  );
  return cacheDir;
}

/**
 * Local-checkout fallback. If the repo still ships data/ inline (development
 * before Phase C), use that and skip HF entirely.
 */
export function findLocalDataIfPresent(repoRoot: string): string | null {
  const candidate = resolve(repoRoot, "data");
  // Check a stable file that's always present in a populated data/ tree.
  if (existsSync(resolve(candidate, "_state/wikidata_attractions.json"))) {
    return candidate;
  }
  return null;
}

/**
 * Resolve the data root for this run.
 *   - Local checkout with populated data/   → that path
 *   - Otherwise                              → HF cache (download if missing)
 */
export async function resolveDataRoot(repoRoot: string): Promise<string> {
  const local = findLocalDataIfPresent(repoRoot);
  if (local) {
    process.stderr.write(
      `[japan-travel-mcp] using local data/ from checkout (${local})\n`,
    );
    return local;
  }
  return ensureDataFromHf();
}
