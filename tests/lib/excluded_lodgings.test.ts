/**
 * The lodging audit list (src/lib/excluded_lodgings.ts).
 *
 * A hand-reviewed deletion list is the kind of file that rots quietly: an id
 * typo removes nothing, a duplicated id hides a disagreement, and an entry in
 * both maps would both delete a row and claim to reclassify it. These tests
 * guard the list's shape rather than its judgement, and pin the counts the
 * module's own documentation states, so the prose cannot drift from the data.
 */

import { describe, expect, it } from "vitest";
import {
  DELETED_LODGINGS,
  isDeletedLodging,
  LODGING_TYPE_OVERRIDES,
  lodgingTypeOverride,
} from "../../src/lib/excluded_lodgings.js";

describe("DELETED_LODGINGS", () => {
  it("holds the 86 rows the audit removed", () => {
    expect(DELETED_LODGINGS.size).toBe(86);
  });

  it("keys every entry by a master id", () => {
    for (const id of DELETED_LODGINGS.keys()) {
      expect(id, `id "${id}" is not a 12-hex master id`).toMatch(/^[0-9a-f]{12}$/);
    }
  });

  it("gives every entry a reason a reader can audit", () => {
    for (const [id, reason] of DELETED_LODGINGS) {
      expect(reason.length, `"${id}" has no usable reason`).toBeGreaterThan(3);
    }
  });

  it("answers for an id it holds and one it does not", () => {
    const [first] = [...DELETED_LODGINGS.keys()];
    expect(isDeletedLodging(first)).toBe(true);
    expect(isDeletedLodging("000000000000")).toBe(false);
  });
});

describe("LODGING_TYPE_OVERRIDES", () => {
  it("holds the two real accommodations that wore a campground label", () => {
    expect(LODGING_TYPE_OVERRIDES.size).toBe(2);
  });

  it("corrects them to a type that exists, and never back to campground", () => {
    for (const [id, override] of LODGING_TYPE_OVERRIDES) {
      expect(["hotel", "hostel", "guest_house", "apartment", "motel"]).toContain(override.type);
      expect(override.type, `"${id}" must not stay a campground`).not.toBe("campground");
      expect(override.was.length).toBeGreaterThan(0);
    }
  });

  it("reads back the corrected type", () => {
    const [first] = [...LODGING_TYPE_OVERRIDES.keys()];
    expect(lodgingTypeOverride(first)).toBe("hotel");
    expect(lodgingTypeOverride("000000000000")).toBeNull();
  });
});

describe("the two lists together", () => {
  it("never both deletes and reclassifies the same row", () => {
    const both = [...LODGING_TYPE_OVERRIDES.keys()].filter((id) => DELETED_LODGINGS.has(id));
    expect(both, `ids in both lists: ${both.join(", ")}`).toEqual([]);
  });

  it("names the emergency-shelter import and the bare duplicates in its reasons", () => {
    const reasons = [...DELETED_LODGINGS.values()].join(" ");
    // The two classes the audit found, each still represented in the list.
    expect(reasons).toMatch(/bare node beside/);
    expect([...DELETED_LODGINGS.values()].filter((r) => /bare node beside/.test(r)).length).toBe(12);
    expect([...DELETED_LODGINGS.values()].filter((r) => !/bare node beside/.test(r)).length).toBe(74);
  });
});
