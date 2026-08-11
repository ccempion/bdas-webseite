import { describe, expect, it } from "vitest";

import {
  BILD_BREITE_STUFEN,
  bildBreiteClass,
  normalizeBildBreite,
  snapBildBreite,
} from "./bild-breite";

describe("bildBreiteClass", () => {
  it("maps each step to its literal Tailwind classes", () => {
    expect(bildBreiteClass(25)).toBe("w-full sm:w-1/4");
    expect(bildBreiteClass(50)).toBe("w-full sm:w-1/2");
    expect(bildBreiteClass(75)).toBe("w-full sm:w-3/4");
    expect(bildBreiteClass(100)).toBe("w-full");
  });

  it("is full width below the sm breakpoint at every step", () => {
    for (const stufe of BILD_BREITE_STUFEN) {
      expect(bildBreiteClass(stufe).startsWith("w-full")).toBe(true);
    }
  });

  it("falls back to full width for a missing or unrecognised value", () => {
    expect(bildBreiteClass(undefined)).toBe("w-full");
    expect(bildBreiteClass(33 as never)).toBe("w-full");
    expect(bildBreiteClass("halb" as never)).toBe("w-full");
  });
});

describe("normalizeBildBreite", () => {
  it("migrates the two legacy string values", () => {
    expect(normalizeBildBreite("voll")).toBe(100);
    expect(normalizeBildBreite("halb")).toBe(50);
  });

  it("passes the four numeric steps through untouched", () => {
    expect(normalizeBildBreite(25)).toBe(25);
    expect(normalizeBildBreite(50)).toBe(50);
    expect(normalizeBildBreite(75)).toBe(75);
    expect(normalizeBildBreite(100)).toBe(100);
  });

  it("falls back to full width for anything unrecognised", () => {
    expect(normalizeBildBreite(undefined)).toBe(100);
    expect(normalizeBildBreite(null)).toBe(100);
    expect(normalizeBildBreite(33)).toBe(100);
    expect(normalizeBildBreite("50")).toBe(100);
    expect(normalizeBildBreite({})).toBe(100);
  });
});

describe("snapBildBreite", () => {
  it("snaps a fraction to the nearest step", () => {
    expect(snapBildBreite(0.26)).toBe(25);
    expect(snapBildBreite(0.48)).toBe(50);
    expect(snapBildBreite(0.6)).toBe(50);
    expect(snapBildBreite(0.7)).toBe(75);
    expect(snapBildBreite(0.9)).toBe(100);
  });

  it("clamps both ends", () => {
    expect(snapBildBreite(0)).toBe(25);
    expect(snapBildBreite(-3)).toBe(25);
    expect(snapBildBreite(1)).toBe(100);
    expect(snapBildBreite(4.2)).toBe(100);
  });

  it("resolves an exact tie downwards", () => {
    // 0.375 sits exactly between 25 and 50. Ties go to the smaller step so a
    // slow drag does not flicker between two values at the midpoint.
    expect(snapBildBreite(0.375)).toBe(25);
    expect(snapBildBreite(0.625)).toBe(50);
  });

  it("falls back to full width for a non-finite fraction", () => {
    // A zero-width container divides to NaN; the block must not vanish.
    expect(snapBildBreite(Number.NaN)).toBe(100);
    expect(snapBildBreite(Number.POSITIVE_INFINITY)).toBe(100);
  });
});
