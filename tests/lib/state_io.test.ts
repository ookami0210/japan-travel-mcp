import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/promises so loadState/saveState operate against vi.fn() stubs.
// Only the three functions state.ts uses are stubbed; everything else
// (e.g. import.meta.url machinery) keeps the real implementation.
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises",
    );
  return {
    ...actual,
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  };
});

import { readFile, writeFile, mkdir } from "node:fs/promises";
import {
  loadState,
  saveState,
  type ScraperState,
  type MunicipalityState,
} from "../../scrapers/lib/state.js";

const mockedReadFile = vi.mocked(readFile);
const mockedWriteFile = vi.mocked(writeFile);
const mockedMkdir = vi.mocked(mkdir);

beforeEach(() => {
  mockedReadFile.mockReset();
  mockedWriteFile.mockReset();
  mockedMkdir.mockReset();
  // mkdir / writeFile resolve successfully by default
  mockedMkdir.mockResolvedValue(undefined);
  mockedWriteFile.mockResolvedValue(undefined);
});

// ──────────────────────────────────────────────────────────────────────
// Helpers

/**
 * Stub readFile to deliver text content. Cast is necessary because
 * readFile has many overloads and `mockResolvedValue` infers the first.
 */
function stubReadOk(body: string): void {
  mockedReadFile.mockResolvedValueOnce(body as never);
}

function stubReadEnoent(): void {
  mockedReadFile.mockRejectedValueOnce(
    Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
  );
}

function muniState(overrides: Partial<MunicipalityState> = {}): MunicipalityState {
  return {
    last_scraped_at: null,
    last_status: null,
    pages_fetched: 0,
    spots_found: 0,
    error_count: 0,
    ...overrides,
  };
}

function sampleState(
  overrides: Partial<ScraperState> = {},
): ScraperState {
  return {
    schema_version: 1,
    last_run_at: null,
    per_municipality: {},
    auto_stop: { triggered: false, reason: null, triggered_at: null },
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────────
// loadState

describe("loadState", () => {
  it("returns DEFAULT_STATE when the state file is missing", async () => {
    stubReadEnoent();
    expect(await loadState()).toEqual(sampleState());
  });

  it("returns DEFAULT_STATE when JSON is malformed", async () => {
    stubReadOk("{not json");
    expect(await loadState()).toEqual(sampleState());
  });

  it("returns DEFAULT_STATE when schema_version mismatches", async () => {
    stubReadOk(
      JSON.stringify({
        schema_version: 99,
        last_run_at: "2026-05-04T00:00:00Z",
        per_municipality: { "01100": {} },
        auto_stop: { triggered: true, reason: "x", triggered_at: "y" },
      }),
    );
    expect(await loadState()).toEqual(sampleState());
  });

  it("returns the parsed state when schema matches", async () => {
    const parsed = sampleState({
      last_run_at: "2026-05-04T00:00:00Z",
      per_municipality: {
        "01100": muniState({
          last_scraped_at: "2026-04-01T00:00:00Z",
          last_status: "success",
          pages_fetched: 12,
          spots_found: 4,
        }),
      },
    });
    stubReadOk(JSON.stringify(parsed));
    expect(await loadState()).toEqual(parsed);
  });

  it("reads the canonical state path inside data/_state/", async () => {
    stubReadEnoent();
    await loadState();
    const [calledPath, encoding] = mockedReadFile.mock.calls[0];
    expect(String(calledPath)).toMatch(/data\/_state\/scrape_state\.json$/);
    expect(encoding).toBe("utf8");
  });
});

// ──────────────────────────────────────────────────────────────────────
// saveState

describe("saveState", () => {
  const sample = sampleState({
    last_run_at: "2026-05-04T12:00:00Z",
    per_municipality: {
      "13104": muniState({
        last_scraped_at: "2026-05-03T00:00:00Z",
        last_status: "partial",
        pages_fetched: 7,
        spots_found: 2,
        error_count: 1,
      }),
    },
  });

  it("creates the parent directory recursively before writing", async () => {
    await saveState(sample);
    expect(mockedMkdir).toHaveBeenCalledTimes(1);
    const [dir, opts] = mockedMkdir.mock.calls[0];
    expect(String(dir)).toMatch(/data\/_state$/);
    expect(opts).toEqual({ recursive: true });
  });

  it("writes pretty-printed JSON to scrape_state.json with utf8", async () => {
    await saveState(sample);
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const [path, content, encoding] = mockedWriteFile.mock.calls[0];
    expect(String(path)).toMatch(/data\/_state\/scrape_state\.json$/);
    expect(encoding).toBe("utf8");
    expect(String(content)).toMatch(/\n  "schema_version": 1/); // 2-space indent
    expect(JSON.parse(String(content))).toEqual(sample);
  });

  it("performs mkdir before writeFile", async () => {
    const order: string[] = [];
    mockedMkdir.mockImplementationOnce(async () => {
      order.push("mkdir");
      return undefined;
    });
    mockedWriteFile.mockImplementationOnce(async () => {
      order.push("writeFile");
    });
    await saveState(sample);
    expect(order).toEqual(["mkdir", "writeFile"]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// Round-trip

describe("load → save round-trip", () => {
  it("reads a state, mutates it, and writes the mutated version", async () => {
    stubReadOk(JSON.stringify(sampleState()));
    const loaded = await loadState();
    loaded.last_run_at = "2026-05-04T00:00:00Z";
    loaded.per_municipality["27100"] = muniState({
      last_scraped_at: "2026-05-04T00:00:00Z",
      last_status: "success",
      pages_fetched: 3,
      spots_found: 1,
    });
    await saveState(loaded);
    const written = JSON.parse(String(mockedWriteFile.mock.calls[0][1]));
    expect(written.last_run_at).toBe("2026-05-04T00:00:00Z");
    expect(written.per_municipality["27100"].pages_fetched).toBe(3);
  });
});
