import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildBlogHref,
  CATEGORY_CHIPS,
  parseCategory,
  parseZeitraum,
  resolveSince,
  SINCE_OPTIONS,
} from "./filters";

describe("CATEGORY_CHIPS / SINCE_OPTIONS", () => {
  it("has 6 category chips and 3 since options with German labels", () => {
    expect(CATEGORY_CHIPS).toHaveLength(6);
    expect(CATEGORY_CHIPS.map((c) => c.key)).toContain("verbandsintern");
    expect(SINCE_OPTIONS).toEqual([
      { key: "7d", label: "Letzte 7 Tage" },
      { key: "30d", label: "Letzte 30 Tage" },
      { key: "jahr", label: "Dieses Jahr" },
    ]);
  });
});

describe("parseCategory", () => {
  it("accepts a valid category", () => {
    expect(parseCategory("gruppenleben")).toBe("gruppenleben");
  });
  it("rejects an unknown value", () => {
    expect(parseCategory("unsinn")).toBeUndefined();
  });
  it("passes through undefined", () => {
    expect(parseCategory(undefined)).toBeUndefined();
  });
});

describe("parseZeitraum", () => {
  it("accepts the three valid keys", () => {
    expect(parseZeitraum("7d")).toBe("7d");
    expect(parseZeitraum("30d")).toBe("30d");
    expect(parseZeitraum("jahr")).toBe("jahr");
  });
  it("rejects anything else", () => {
    expect(parseZeitraum("90d")).toBeUndefined();
    expect(parseZeitraum(undefined)).toBeUndefined();
  });
});

describe("resolveSince", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-26T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns undefined for 'alle' (no filter)", () => {
    expect(resolveSince(undefined)).toBeUndefined();
  });
  it("resolves 7d to 7 days before now", () => {
    expect(resolveSince("7d")).toEqual(new Date("2026-07-19T12:00:00Z"));
  });
  it("resolves 30d to 30 days before now", () => {
    expect(resolveSince("30d")).toEqual(new Date("2026-06-26T12:00:00Z"));
  });
  it("resolves jahr to January 1st of the current year", () => {
    expect(resolveSince("jahr")).toEqual(new Date(2026, 0, 1));
  });
});

describe("buildBlogHref", () => {
  it("returns /blog with no filters", () => {
    expect(buildBlogHref(undefined, undefined)).toBe("/blog");
  });
  it("includes kategorie and zeitraum when set", () => {
    expect(buildBlogHref("gruppenleben", "30d")).toBe("/blog?kategorie=gruppenleben&zeitraum=30d");
  });
});
