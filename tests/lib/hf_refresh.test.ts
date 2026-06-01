import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type Mock,
} from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { RUNTIME_FILES, refreshFromHfIfStale } from "../../src/lib/hf_data.js";

// ──────────────────────────────────────────────────────────────────────
// Cache-busting: refreshFromHfIfStale() detects upstream dataset changes
// and re-downloads only the files that moved. Every assertion runs against
// a stubbed fetch, so the suite stays fully offline.
//
// Mechanism (verified against the real Hugging Face endpoints): every
// `resolve` response carries `x-repo-commit` (the repo's current commit —
// a cheap global staleness signal) and `x-linked-etag` (a per-file content
// identity, for both regular and LFS files). A HEAD request reads both
// without downloading the body.

const MANIFEST = ".sync.json";
const RESOLVE_PREFIX =
  "https://huggingface.co/datasets/open-travel/japan-travel-mcp-data/resolve/main/";
const DAY_MS = 24 * 60 * 60 * 1000;

const ENV_KEYS = [
  "JAPAN_TRAVEL_MCP_CACHE",
  "HF_TOKEN",
  "JAPAN_TRAVEL_MCP_NO_REFRESH",
  "JAPAN_TRAVEL_MCP_REFRESH",
  "JAPAN_TRAVEL_MCP_REFRESH_TTL_HOURS",
];

type FetchMock = Mock<typeof fetch>;

function relOf(call: Parameters<typeof fetch>): string {
  const input = call[0];
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return url.startsWith(RESOLVE_PREFIX) ? url.slice(RESOLVE_PREFIX.length) : url;
}

function methodOf(call: Parameters<typeof fetch>): string {
  return (call[1]?.method ?? "GET").toUpperCase();
}

function callsWithMethod(mock: FetchMock, method: string): Parameters<typeof fetch>[] {
  return mock.mock.calls.filter((c) => methodOf(c) === method);
}

/**
 * Stub fetch the way Hugging Face behaves: HEAD returns headers only
 * (x-repo-commit + per-file x-linked-etag), GET returns the file body.
 */
function mockHf(opts: {
  commit?: string;
  etags?: Record<string, string>;
  downloadBody?: string;
}): FetchMock {
  const body = opts.downloadBody ?? "NEW-FILE-BODY";
  return vi.fn<typeof fetch>(async (input, init) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const rel = url.startsWith(RESOLVE_PREFIX) ? url.slice(RESOLVE_PREFIX.length) : url;
    const method = (init?.method ?? "GET").toUpperCase();
    if (method === "HEAD") {
      const headers = new Headers();
      if (opts.commit) headers.set("x-repo-commit", opts.commit);
      const etag = opts.etags?.[rel];
      if (etag) headers.set("x-linked-etag", etag);
      return new Response(null, { status: 200, headers });
    }
    return new Response(body, { status: 200, statusText: "OK" });
  });
}

let cacheDir: string;
const snapshot = new Map<string, string | undefined>();

beforeEach(async () => {
  for (const k of ENV_KEYS) {
    snapshot.set(k, process.env[k]);
    delete process.env[k];
  }
  vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  cacheDir = await mkdtemp(join(tmpdir(), "jtm-refresh-"));
  process.env.JAPAN_TRAVEL_MCP_CACHE = cacheDir;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await rm(cacheDir, { recursive: true, force: true });
  for (const k of ENV_KEYS) {
    const v = snapshot.get(k);
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  snapshot.clear();
});

async function writeManifest(m: unknown): Promise<void> {
  await writeFile(join(cacheDir, MANIFEST), JSON.stringify(m), "utf8");
}

async function readManifest(): Promise<{
  repoCommit: string | null;
  checkedAt: number;
  etags: Record<string, string>;
}> {
  return JSON.parse(await readFile(join(cacheDir, MANIFEST), "utf8"));
}

describe("refreshFromHfIfStale", () => {
  it("does no network when the manifest is fresh within the TTL", async () => {
    await writeManifest({ repoCommit: "C1", checkedAt: Date.now(), etags: {} });
    const fetchMock = mockHf({ commit: "C1" });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when JAPAN_TRAVEL_MCP_NO_REFRESH is set, even if stale", async () => {
    process.env.JAPAN_TRAVEL_MCP_NO_REFRESH = "1";
    await writeManifest({
      repoCommit: "C1",
      checkedAt: Date.now() - 2 * DAY_MS,
      etags: {},
    });
    const fetchMock = mockHf({ commit: "C2" });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does only the cheap commit HEAD (no downloads) when upstream is unchanged", async () => {
    const checkedAt = Date.now() - 2 * DAY_MS;
    await writeManifest({
      repoCommit: "C1",
      checkedAt,
      etags: { [RUNTIME_FILES[0]]: "e0" },
    });
    const fetchMock = mockHf({ commit: "C1" });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    expect(callsWithMethod(fetchMock, "HEAD")).toHaveLength(1);
    expect(callsWithMethod(fetchMock, "GET")).toHaveLength(0);
    const m = await readManifest();
    expect(m.repoCommit).toBe("C1");
    expect(m.checkedAt).toBeGreaterThan(checkedAt);
  });

  it("re-downloads only the files whose etag changed when the commit changed", async () => {
    const changedRel = RUNTIME_FILES[1];
    const baseEtags = Object.fromEntries(
      RUNTIME_FILES.map((r) => [r, `etag-${r}`]),
    );
    const remoteEtags = { ...baseEtags, [changedRel]: `etag-${changedRel}-NEW` };
    await writeManifest({
      repoCommit: "C1",
      checkedAt: Date.now() - 2 * DAY_MS,
      etags: baseEtags,
    });
    const fetchMock = mockHf({
      commit: "C2",
      etags: remoteEtags,
      downloadBody: "REFRESHED",
    });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    const gets = callsWithMethod(fetchMock, "GET");
    expect(gets).toHaveLength(1);
    expect(relOf(gets[0])).toBe(changedRel);
    expect(await readFile(join(cacheDir, changedRel), "utf8")).toBe("REFRESHED");
    const m = await readManifest();
    expect(m.repoCommit).toBe("C2");
    expect(m.etags[changedRel]).toBe(`etag-${changedRel}-NEW`);
  });

  it("seeds the manifest without downloading when none exists yet", async () => {
    const remoteEtags = Object.fromEntries(
      RUNTIME_FILES.map((r) => [r, `etag-${r}`]),
    );
    const fetchMock = mockHf({ commit: "C9", etags: remoteEtags });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    expect(callsWithMethod(fetchMock, "GET")).toHaveLength(0);
    const m = await readManifest();
    expect(m.repoCommit).toBe("C9");
    expect(m.etags[RUNTIME_FILES[0]]).toBe(`etag-${RUNTIME_FILES[0]}`);
    expect(Object.keys(m.etags)).toHaveLength(RUNTIME_FILES.length);
  });

  it("is non-fatal when the network fails during the check", async () => {
    await writeManifest({
      repoCommit: "C1",
      checkedAt: Date.now() - 2 * DAY_MS,
      etags: {},
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => {
        throw new Error("network down");
      }),
    );

    await expect(refreshFromHfIfStale()).resolves.toBeUndefined();
  });

  it("JAPAN_TRAVEL_MCP_REFRESH forces a check despite a fresh manifest", async () => {
    process.env.JAPAN_TRAVEL_MCP_REFRESH = "1";
    await writeManifest({ repoCommit: "C1", checkedAt: Date.now(), etags: {} });
    const fetchMock = mockHf({ commit: "C1" });
    vi.stubGlobal("fetch", fetchMock);

    await refreshFromHfIfStale();

    expect(callsWithMethod(fetchMock, "HEAD").length).toBeGreaterThanOrEqual(1);
  });
});
