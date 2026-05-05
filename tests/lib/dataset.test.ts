import { describe, it, expect } from "vitest";
import { dataAsOf } from "../../src/lib/dataset.js";

describe("dataAsOf", () => {
  it("returns null for an empty input", () => {
    expect(dataAsOf([])).toBeNull();
  });

  it("returns the freshest watermark across the input", () => {
    expect(
      dataAsOf([
        { data_as_of: "2026-04-01" },
        { data_as_of: "2026-05-01" },
        { data_as_of: "2026-03-15" },
      ]),
    ).toBe("2026-05-01");
  });

  it("is order-independent", () => {
    const a = dataAsOf([
      { data_as_of: "2026-01-01" },
      { data_as_of: "2026-12-31" },
    ]);
    const b = dataAsOf([
      { data_as_of: "2026-12-31" },
      { data_as_of: "2026-01-01" },
    ]);
    expect(a).toBe(b);
    expect(a).toBe("2026-12-31");
  });

  it("handles full ISO-8601 timestamps", () => {
    expect(
      dataAsOf([
        { data_as_of: "2026-05-05T08:00:00Z" },
        { data_as_of: "2026-05-05T20:00:00Z" },
      ]),
    ).toBe("2026-05-05T20:00:00Z");
  });

  it("returns the single value for a single-entry input", () => {
    expect(dataAsOf([{ data_as_of: "2026-05-05" }])).toBe("2026-05-05");
  });
});
