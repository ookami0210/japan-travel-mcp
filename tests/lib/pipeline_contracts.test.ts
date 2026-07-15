/**
 * Pipeline spend contracts.
 *
 * The costliest failure mode in this repo has not been "wrong code" but a
 * broken ENVIRONMENTAL premise: an incremental AI translator whose
 * existing-output file was not restored on the CI runner, so every record
 * looked new and a whole source was re-translated at real Batch API cost —
 * nightly. The code was correct; the runner環境 violated its premise.
 *
 * These tests pin the premise mechanically:
 *   1. Every incremental translator's existing-output file must be listed in
 *      the prefetch preset of the workflow that runs it.
 *   2. The workflows must actually invoke those presets and pass the API key
 *      to exactly the steps that spend.
 *   3. Every AI translator must carry the spend circuit breaker.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function read(rel: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../${rel}`, import.meta.url)),
    "utf8",
  );
}

/** Extract the file list of one named preset from prefetch_state.py. */
function preset(name: string): string[] {
  const src = read("scrapers/hf/prefetch_state.py");
  const start = src.indexOf(`"${name}": [`);
  expect(start, `preset "${name}" exists`).toBeGreaterThan(-1);
  const end = src.indexOf("]", start);
  const block = src.slice(start, end);
  return [...block.matchAll(/"([^"]+\.[a-z0-9]+)"/g)]
    .map((m) => m[1])
    .filter((f) => f !== name);
}

describe("prefetch presets restore every incremental translator's prior output", () => {
  it("steady restores the R-3 translation corpus before the r3 chain runs", () => {
    // Without this line, every nightly rotation re-translates the whole
    // day's source (real cost) and the HF sync clobbers the corpus.
    expect(preset("steady")).toContain("r3/translations/r3_translations.jsonl");
  });

  it("steady restores scrape_state so the daily batch stays stale-first", () => {
    expect(preset("steady")).toContain("_state/scrape_state.json");
  });

  it("translations restores both prior outputs (names + descriptions)", () => {
    const p = preset("translations");
    expect(p).toContain("translations/multilingual_complete.jsonl");
    expect(p).toContain("translations/descriptions_complete.jsonl");
  });

  it("dmo restores the overrides map so known DMOs are never re-discovered", () => {
    expect(preset("dmo")).toContain("_state/dmo_website_overrides.json");
  });
});

describe("workflows wire the presets and scope the API key to spending steps", () => {
  it("steady-scrape prefetches the steady preset and keys only the R-3 chain", () => {
    const wf = read(".github/workflows/steady-scrape.yml");
    expect(wf).toContain("--preset steady");
    // The API key belongs to the R-3 rotation (its translation pass), and
    // must NOT be handed to the plain municipal scrape step.
    const scrapeStep = wf.slice(
      wf.indexOf("Run daily MUNI scrape"),
      wf.indexOf("R-3 weekly rotation"),
    );
    expect(scrapeStep).not.toContain("ANTHROPIC_API_KEY");
    const r3Step = wf.slice(
      wf.indexOf("R-3 weekly rotation"),
      wf.indexOf("Coverage verifier"),
    );
    expect(r3Step).toContain("ANTHROPIC_API_KEY");
  });

  it("translations-refresh prefetches the translations preset", () => {
    const wf = read(".github/workflows/translations-refresh.yml");
    expect(wf).toContain("--preset translations");
    expect(wf).toContain("ANTHROPIC_API_KEY");
  });

  it("dmo-refresh prefetches the dmo preset", () => {
    const wf = read(".github/workflows/dmo-refresh.yml");
    expect(wf).toContain("--preset dmo");
  });
});

describe("every AI translator carries the spend circuit breaker", () => {
  for (const script of [
    "scrapers/translate/translate_r3.ts",
    "scrapers/translate/translate_descriptions.ts",
    "scrapers/translate/translate_multilingual.ts",
  ]) {
    it(`${script} enforces the guard`, () => {
      expect(read(script)).toContain("enforceSpendGuard(");
    });
  }
});

describe("incremental premises inside the translators", () => {
  it("translate_r3 reads the exact file the steady preset restores", () => {
    const src = read("scrapers/translate/translate_r3.ts");
    expect(src).toContain("r3_translations.jsonl");
  });
  it("descriptions reads the exact files the translations preset restores", () => {
    const src = read("scrapers/translate/translate_descriptions.ts");
    expect(src).toContain("descriptions_complete.jsonl");
    expect(src).toContain("multilingual_complete.jsonl");
  });
});
