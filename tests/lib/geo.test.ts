import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  haversineKm,
  parseWktPoint,
  EARTH_RADIUS_M,
  EARTH_RADIUS_KM,
} from "../../src/lib/geo.js";

// ─── Constants ───────────────────────────────────────────────────────

describe("EARTH_RADIUS constants", () => {
  it("EARTH_RADIUS_M / 1000 equals EARTH_RADIUS_KM", () => {
    expect(EARTH_RADIUS_M / 1000).toBe(EARTH_RADIUS_KM);
  });
});

// ─── haversineMeters / haversineKm ───────────────────────────────────

describe("haversineMeters", () => {
  it("returns 0 for identical points", () => {
    const p = { lat: 35.681236, lng: 139.767125 }; // Tokyo Station
    expect(haversineMeters(p, p)).toBe(0);
  });

  it("is symmetric: d(a, b) === d(b, a)", () => {
    const a = { lat: 35.681236, lng: 139.767125 };
    const b = { lat: 34.985458, lng: 135.758765 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });

  it("Tokyo → Kyoto is ~371 km (spherical haversine)", () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 };
    const kyoto = { lat: 34.985458, lng: 135.758765 };
    const m = haversineMeters(tokyo, kyoto);
    // Spherical-Earth haversine puts this at ~371.7 km; WGS-84 ellipsoid
    // gives ~365 km. We're a sphere here — accept ±1 km around 371.7.
    expect(m / 1000).toBeGreaterThan(370.5);
    expect(m / 1000).toBeLessThan(372.5);
  });

  it("1° of latitude on the equator is ~111 km", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 1, lng: 0 };
    const km = haversineMeters(a, b) / 1000;
    expect(km).toBeGreaterThan(110.5);
    expect(km).toBeLessThan(111.5);
  });

  it("1° of longitude shrinks with latitude (cos factor)", () => {
    const equator = haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const at60 = haversineMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    // cos(60°) = 0.5, so ratio should be ~0.5.
    expect(at60 / equator).toBeCloseTo(0.5, 2);
  });

  it("antipodal points are ~π × R apart (~20,015 km)", () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 180 };
    const km = haversineMeters(a, b) / 1000;
    expect(km).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 0);
  });
});

describe("haversineKm", () => {
  it("equals haversineMeters / 1000 (single source of truth)", () => {
    const a = { lat: 35.0, lng: 139.0 };
    const b = { lat: 34.0, lng: 138.0 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineMeters(a, b) / 1000, 9);
  });

  it("Tokyo → Kyoto is ~371 km (spherical)", () => {
    const tokyo = { lat: 35.681236, lng: 139.767125 };
    const kyoto = { lat: 34.985458, lng: 135.758765 };
    expect(haversineKm(tokyo, kyoto)).toBeGreaterThan(370.5);
    expect(haversineKm(tokyo, kyoto)).toBeLessThan(372.5);
  });
});

// ─── parseWktPoint ───────────────────────────────────────────────────

describe("parseWktPoint", () => {
  it("parses standard Wikidata SPARQL POINT(lng lat)", () => {
    expect(parseWktPoint("Point(139.767125 35.681236)")).toEqual({
      lng: 139.767125,
      lat: 35.681236,
    });
  });

  it("is case-insensitive on the POINT token", () => {
    expect(parseWktPoint("POINT(0 0)")).toEqual({ lng: 0, lat: 0 });
    expect(parseWktPoint("point(0 0)")).toEqual({ lng: 0, lat: 0 });
  });

  it("handles negative coordinates", () => {
    expect(parseWktPoint("Point(-122.4194 -37.7749)")).toEqual({
      lng: -122.4194,
      lat: -37.7749,
    });
  });

  it("tolerates extra whitespace inside the parens", () => {
    expect(parseWktPoint("Point(  139.0   35.0  )")).toEqual({
      lng: 139.0,
      lat: 35.0,
    });
  });

  it("returns null for malformed input", () => {
    expect(parseWktPoint("")).toBeNull();
    expect(parseWktPoint("not a point")).toBeNull();
    expect(parseWktPoint("Polygon(0 0)")).toBeNull();
    expect(parseWktPoint("Point(0)")).toBeNull();          // missing one coord
    expect(parseWktPoint("Point(abc def)")).toBeNull();    // non-numeric
  });

  it("preserves WKT lng-then-lat order (NOT lat-then-lng)", () => {
    // 139 > 90 so it can only be longitude. Catches accidental swaps.
    const p = parseWktPoint("Point(139 35)");
    expect(p?.lng).toBe(139);
    expect(p?.lat).toBe(35);
  });
});
