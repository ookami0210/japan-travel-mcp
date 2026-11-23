import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertNotCollapsed,
  CollapsedResultError,
  countRecordsInFile,
  MissingPreviousFileError,
  previousRecordCount,
} from "../../scrapers/lib/r3_write_guard.js";

afterEach(() => {
  delete process.env.R3_ALLOW_COLLAPSE;
  delete process.env.R3_REQUIRE_PREVIOUS;
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

describe("previousRecordCount", () => {
  it("counts the file it would replace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "r3prev-"));
    const good = join(dir, "good.json");
    await writeFile(good, JSON.stringify({ records: [{}, {}] }), "utf8");
    process.env.R3_REQUIRE_PREVIOUS = "1";
    expect(await previousRecordCount("x", good)).toBe(2);
  });
  it("treats a missing file as a first run outside CI", async () => {
    const dir = await mkdtemp(join(tmpdir(), "r3prev-"));
    expect(await previousRecordCount("x", join(dir, "missing.json"))).toBe(0);
  });
  it("refuses a missing file when the runner was meant to restore it", async () => {
    // A CI runner starts empty. If the previous file was not downloaded, a
    // count of 0 would wave an empty crawl through to the dataset.
    const dir = await mkdtemp(join(tmpdir(), "r3prev-"));
    process.env.R3_REQUIRE_PREVIOUS = "1";
    await expect(previousRecordCount("x", join(dir, "missing.json"))).rejects.toThrow(
      MissingPreviousFileError,
    );
  });
  it("lets a deliberate first publish through", async () => {
    const dir = await mkdtemp(join(tmpdir(), "r3prev-"));
    process.env.R3_REQUIRE_PREVIOUS = "1";
    process.env.R3_ALLOW_COLLAPSE = "1";
    expect(await previousRecordCount("x", join(dir, "missing.json"))).toBe(0);
  });
});
