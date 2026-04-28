import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
  type Mock,
} from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  RUNTIME_FILES,
  getCacheDir,
  findLocalDataIfPresent,
  ensureDataFromHf,
  resolveDataRoot,
} from "../../src/lib/hf_data.js";

// ─── Typed fetch mocks ────────────────────────────────────────────────

type FetchMock = Mock<typeof fetch>;

function mockFetchOk(body: string = "ok-body"): FetchMock {
  return vi.fn<typeof fetch>(
    async () => new Response(body, { status: 200, statusText: "OK" }),
  );
}

function mockFetchStatus(status: number, statusText = "Err"): FetchMock {
  return vi.fn<typeof fetch>(
    async () => new Response("", { status, statusText }),
  );
}

function fetchInitOf(call: Parameters<typeof fetch>): RequestInit | undefined {
  return call[1];
}

function fetchUrlOf(call: Parameters<typeof fetch>): string {
  const input = call[0];
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

// ─── Helpers ──────────────────────────────────────────────────────────

async function makeTempCacheDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "jtm-cache-"));
}

async function makeTempRepoRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "jtm-repo-"));
}

/**
 * Reset env vars to a known-clean state for the test, then restore the
 * original values afterwards. Handles "originally undefined" correctly by
 * deleting rather than re-assigning `undefined`.
 */
function withCleanEnv(keys: string[]): void {
  const snapshot = new Map<string, string | undefined>();
  beforeEach(() => {
    for (const k of keys) {
      snapshot.set(k, process.env[k]);
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of keys) {
      const v = snapshot.get(k);
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    snapshot.clear();
  });
}

/**
 * Silence the production code's progress logs to keep test output readable.
 * The asserts that matter use the mock's call log, not stderr scraping.
 */
function silenceStderr(): void {
  beforeEach(() => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
}

// ─── getCacheDir ──────────────────────────────────────────────────────

describe("getCacheDir", () => {
  withCleanEnv(["JAPAN_TRAVEL_MCP_CACHE"]);

  it("defaults to ~/.japan-travel-mcp/data", () => {
    expect(getCacheDir()).toBe(join(homedir(), ".japan-travel-mcp", "data"));
  });

  it("respects JAPAN_TRAVEL_MCP_CACHE env override", () => {
    process.env.JAPAN_TRAVEL_MCP_CACHE = "/custom/path";
    expect(getCacheDir()).toBe("/custom/path");
  });
});

// ─── RUNTIME_FILES sanity ─────────────────────────────────────────────

describe("RUNTIME_FILES", () => {
  it("includes all 47 prefecture files", () => {
    const prefectureCount = RUNTIME_FILES.filter((f) =>
      f.startsWith("prefectures/"),
    ).length;
    expect(prefectureCount).toBe(47);
  });

  it("includes the core runtime data sets", () => {
    expect(RUNTIME_FILES).toContain("hotels/master.json");
    expect(RUNTIME_FILES).toContain("translations/descriptions_complete.jsonl");
    expect(RUNTIME_FILES).toContain("translations/multilingual_complete.jsonl");
    expect(RUNTIME_FILES).toContain("_state/wikidata_attractions.json");
  });

  it("does not contain duplicates", () => {
    expect(new Set(RUNTIME_FILES).size).toBe(RUNTIME_FILES.length);
  });
});

// ─── findLocalDataIfPresent ──────────────────────────────────────────

describe("findLocalDataIfPresent", () => {
  let repoRoot: string;
  beforeEach(async () => {
    repoRoot = await makeTempRepoRoot();
  });
  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("returns null when data/_state/wikidata_attractions.json is missing", () => {
    expect(findLocalDataIfPresent(repoRoot)).toBeNull();
  });

  it("returns the data dir when the trigger file exists", async () => {
    await mkdir(resolve(repoRoot, "data/_state"), { recursive: true });
    await writeFile(
      resolve(repoRoot, "data/_state/wikidata_attractions.json"),
      "{}",
    );
    expect(findLocalDataIfPresent(repoRoot)).toBe(resolve(repoRoot, "data"));
  });
});

// ─── ensureDataFromHf ─────────────────────────────────────────────────

describe("ensureDataFromHf", () => {
  withCleanEnv(["JAPAN_TRAVEL_MCP_CACHE", "HF_TOKEN"]);
  silenceStderr();

  let cacheDir: string;

  beforeEach(async () => {
    cacheDir = await makeTempCacheDir();
    process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("downloads every RUNTIME_FILE on a cold cache", async () => {
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureDataFromHf();

    expect(result).toBe(cacheDir);
    expect(fetchMock).toHaveBeenCalledTimes(RUNTIME_FILES.length);

    for (const rel of RUNTIME_FILES) {
      const s = await stat(join(cacheDir, rel));
      expect(s.isFile()).toBe(true);
      expect(s.size).toBeGreaterThan(0);
    }
  });

  it("does not re-fetch when every file already exists in cache", async () => {
    for (const rel of RUNTIME_FILES) {
      const p = join(cacheDir, rel);
      await mkdir(resolve(p, ".."), { recursive: true });
      await writeFile(p, "cached");
    }
    const fetchMock = mockFetchOk("should-not-be-called");
    vi.stubGlobal("fetch", fetchMock);

    const result = await ensureDataFromHf();

    expect(result).toBe(cacheDir);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only downloads the files that are missing", async () => {
    const missingOne = RUNTIME_FILES[0];
    for (const rel of RUNTIME_FILES) {
      if (rel === missingOne) continue;
      const p = join(cacheDir, rel);
      await mkdir(resolve(p, ".."), { recursive: true });
      await writeFile(p, "cached");
    }
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    await ensureDataFromHf();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchUrlOf(fetchMock.mock.calls[0])).toContain(missingOne);
  });

  it("treats zero-byte cached files as missing and re-downloads them", async () => {
    const emptyOne = RUNTIME_FILES[1];
    for (const rel of RUNTIME_FILES) {
      const p = join(cacheDir, rel);
      await mkdir(resolve(p, ".."), { recursive: true });
      await writeFile(p, rel === emptyOne ? "" : "cached");
    }
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    await ensureDataFromHf();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchUrlOf(fetchMock.mock.calls[0])).toContain(emptyOne);
  });

  it("targets the correct Hugging Face dataset URL", async () => {
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    await ensureDataFromHf();

    const url = fetchUrlOf(fetchMock.mock.calls[0]);
    expect(url).toMatch(
      /^https:\/\/huggingface\.co\/datasets\/kjsunada\/japan-travel-mcp-data\/resolve\/main\//,
    );
  });

  it("includes Authorization header when HF_TOKEN is set", async () => {
    process.env.HF_TOKEN = "hf_test_token_xyz";
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    await ensureDataFromHf();

    const init = fetchInitOf(fetchMock.mock.calls[0]);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer hf_test_token_xyz");
  });

  it("does NOT send Authorization when HF_TOKEN is absent", async () => {
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    await ensureDataFromHf();

    const init = fetchInitOf(fetchMock.mock.calls[0]);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it("throws a descriptive error including HF_TOKEN hint on 401", async () => {
    vi.stubGlobal("fetch", mockFetchStatus(401, "Unauthorized"));

    await expect(ensureDataFromHf()).rejects.toThrow(/HF_TOKEN/);
  });

  it("throws a descriptive error mentioning version mismatch on 404", async () => {
    vi.stubGlobal("fetch", mockFetchStatus(404, "Not Found"));

    await expect(ensureDataFromHf()).rejects.toThrow(/file not found/);
  });

  it("aggregates multiple errors and truncates the message past 5 entries", async () => {
    // Force every fetch to fail with a distinct path so the aggregation tail
    // ("... and N more") is exercised.
    vi.stubGlobal("fetch", mockFetchStatus(500, "Internal Server Error"));

    await expect(ensureDataFromHf()).rejects.toThrow(/and \d+ more/);
  });

  it("writes the response body bytes to disk verbatim", async () => {
    const payload = "hello from HF " + "x".repeat(100);
    vi.stubGlobal("fetch", mockFetchOk(payload));

    await ensureDataFromHf();

    const sample = await readFile(join(cacheDir, RUNTIME_FILES[0]), "utf8");
    expect(sample).toBe(payload);
  });
});

// ─── resolveDataRoot ──────────────────────────────────────────────────

describe("resolveDataRoot", () => {
  withCleanEnv(["JAPAN_TRAVEL_MCP_CACHE", "HF_TOKEN"]);
  silenceStderr();

  let cacheDir: string;
  let repoRoot: string;

  beforeEach(async () => {
    cacheDir = await makeTempCacheDir();
    repoRoot = await makeTempRepoRoot();
    process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(cacheDir, { recursive: true, force: true });
    await rm(repoRoot, { recursive: true, force: true });
  });

  it("prefers local data/ when the trigger file is present (no fetch)", async () => {
    await mkdir(resolve(repoRoot, "data/_state"), { recursive: true });
    await writeFile(
      resolve(repoRoot, "data/_state/wikidata_attractions.json"),
      "{}",
    );
    const fetchMock = mockFetchOk("nope");
    vi.stubGlobal("fetch", fetchMock);

    const root = await resolveDataRoot(repoRoot);

    expect(root).toBe(resolve(repoRoot, "data"));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("falls back to HF cache when no local data/ checkout is available", async () => {
    const fetchMock = mockFetchOk("payload");
    vi.stubGlobal("fetch", fetchMock);

    const root = await resolveDataRoot(repoRoot);

    expect(root).toBe(cacheDir);
    expect(fetchMock).toHaveBeenCalled();
    expect(existsSync(join(cacheDir, RUNTIME_FILES[0]))).toBe(true);
  });
});
