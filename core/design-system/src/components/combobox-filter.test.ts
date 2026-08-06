import { describe, expect, it } from "vitest";

import {
  filterOptions,
  nextIndex,
  reconcileIndex,
  SEARCH_THRESHOLD,
  shouldSearch,
  type ComboboxOption,
} from "./combobox-filter";

const opt = (label: string): ComboboxOption => ({ value: label, label });

const UNIS = [
  "TU München",
  "LMU München",
  "Universität zu Köln",
  "Hochschule München",
  "RWTH Aachen",
  "Universität Münster",
].map(opt);

const labels = (options: ReadonlyArray<ComboboxOption>) => options.map((o) => o.label);

describe("shouldSearch", () => {
  it("stays off for a list that is still scannable", () => {
    expect(shouldSearch(30)).toBe(false);
    expect(shouldSearch(0)).toBe(false);
  });

  it("turns on past the threshold", () => {
    expect(shouldSearch(31)).toBe(true);
    expect(shouldSearch(388)).toBe(true);
  });

  it("takes a caller's threshold", () => {
    expect(shouldSearch(10, 5)).toBe(true);
    expect(shouldSearch(10, 50)).toBe(false);
  });

  it("defaults to 30", () => {
    expect(SEARCH_THRESHOLD).toBe(30);
  });
});

describe("filterOptions", () => {
  it("returns everything for an empty or blank query", () => {
    expect(filterOptions(UNIS, "")).toEqual(UNIS);
    expect(filterOptions(UNIS, "   ")).toEqual(UNIS);
  });

  it("ignores case", () => {
    expect(labels(filterOptions(UNIS, "rwth"))).toEqual(["RWTH Aachen"]);
  });

  it("matches without the umlaut", () => {
    expect(labels(filterOptions(UNIS, "munchen"))).toEqual([
      "TU München",
      "LMU München",
      "Hochschule München",
    ]);
  });

  it("matches an umlaut spelled out, for keyboards without one", () => {
    expect(labels(filterOptions(UNIS, "muenchen"))).toEqual([
      "TU München",
      "LMU München",
      "Hochschule München",
    ]);
  });

  it("matches the umlaut typed properly", () => {
    expect(labels(filterOptions(UNIS, "münchen"))).toEqual([
      "TU München",
      "LMU München",
      "Hochschule München",
    ]);
  });

  it("requires every term but not their order", () => {
    expect(labels(filterOptions(UNIS, "uni köln"))).toEqual(["Universität zu Köln"]);
    expect(labels(filterOptions(UNIS, "köln uni"))).toEqual(["Universität zu Köln"]);
  });

  it("ranks a label that starts with the query above one that merely contains it", () => {
    expect(labels(filterOptions(UNIS, "tu"))[0]).toBe("TU München");
  });

  it("keeps source order among equally good matches", () => {
    expect(labels(filterOptions(UNIS, "universität"))).toEqual([
      "Universität zu Köln",
      "Universität Münster",
    ]);
  });

  it("ignores punctuation and extra spacing on both sides", () => {
    expect(labels(filterOptions([opt("Eichstätt - Ingolstadt")], "eichstatt ingolstadt"))).toEqual([
      "Eichstätt - Ingolstadt",
    ]);
    expect(labels(filterOptions(UNIS, "  rwth   aachen "))).toEqual(["RWTH Aachen"]);
  });

  it("folds ß to ss", () => {
    expect(labels(filterOptions([opt("Großhochschule")], "grosshochschule"))).toHaveLength(1);
  });

  it("returns nothing when a term matches no option", () => {
    expect(filterOptions(UNIS, "münchen aachen")).toEqual([]);
    expect(filterOptions(UNIS, "zzz")).toEqual([]);
  });
});

describe("nextIndex", () => {
  it("starts at the top going down and the bottom going up", () => {
    expect(nextIndex(-1, 5, 1)).toBe(0);
    expect(nextIndex(-1, 5, -1)).toBe(4);
  });

  it("steps and wraps at both ends", () => {
    expect(nextIndex(0, 5, 1)).toBe(1);
    expect(nextIndex(4, 5, 1)).toBe(0);
    expect(nextIndex(0, 5, -1)).toBe(4);
  });

  it("has nowhere to go in an empty list", () => {
    expect(nextIndex(-1, 0, 1)).toBe(-1);
    expect(nextIndex(2, 0, -1)).toBe(-1);
  });
});

describe("reconcileIndex", () => {
  it("keeps the highlight on the same option after a re-filter", () => {
    expect(reconcileIndex(UNIS, "RWTH Aachen")).toBe(4);
  });

  it("falls back to the first option when that one filtered away", () => {
    expect(reconcileIndex(UNIS, "gone")).toBe(0);
    expect(reconcileIndex(UNIS, undefined)).toBe(0);
  });

  it("reports nothing highlighted when nothing matched", () => {
    expect(reconcileIndex([], "RWTH Aachen")).toBe(-1);
    expect(reconcileIndex([], undefined)).toBe(-1);
  });
});
