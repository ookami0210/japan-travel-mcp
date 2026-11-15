import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNotCollapsed,
  CollapsedResultError,
  countRecordsInFile,
} from "../../scrapers/lib/r3_write_guard.js";

afterEach(() => {
  delete process.env.R3_ALLOW_COLLAPSE;
});

describe("assertNotCollapsed", () => {
  it("refuses to replace a populated file with an empty result", () => {
    expect(() => assertNotCollapsed("x", 231, 0)).toThrow(CollapsedResultError);
  });
  it("refuses a result that lost more than half of a sizeable registry", () => {
    expect(() => assertNotCollapsed("x", 100, 49)).toThrow(CollapsedResultError);
    expect(() => assertNotCollapsed("x", 100, 50)).not.toThrow();
  });
  it("lets a first run, a repair of an empty file and small registries through", () => {
    expect(() => assertNotCollapsed("x", 0, 0)).not.toThrow();
    expect(() => assertNotCollapsed("x", 0, 12)).not.toThrow();
    expect(() => assertNotCollapsed("x", 10, 3)).not.toThrow();
    expect(() => assertNotCollapsed("x", 10, 0)).toThrow(CollapsedResultError);
  });
  it("can be overridden on purpose", () => {
    process.env.R3_ALLOW_COLLAPSE = "1";
    expect(() => assertNotCollapsed("x", 231, 0)).not.toThrow();
  });
});

describe("countRecordsInFile", () => {
  it("counts records and treats a missing or torn file as empty", async () => {
    const dir = await mkdtemp(join(tmpdir(), "r3guard-"));
    const good = join(dir, "good.json");
    await writeFile(good, JSON.stringify({ records: [{}, {}, {}] }), "utf8");
    const torn = join(dir, "torn.json");
    await writeFile(torn, "{not json", "utf8");
    expect(await countRecordsInFile(good)).toBe(3);
    expect(await countRecordsInFile(torn)).toBe(0);
    expect(await countRecordsInFile(join(dir, "missing.json"))).toBe(0);
  });
});
