import { describe, expect, it } from "vitest";

import { buildSlug, slugifyTitle } from "./slug";

describe("slugifyTitle", () => {
  it("lowercases and dashes", () => {
    expect(slugifyTitle("Hallo Welt")).toBe("hallo-welt");
  });

  it("transliterates German umlauts", () => {
    expect(slugifyTitle("Über Grüße für Käse")).toBe("ueber-gruesse-fuer-kaese");
  });

  it("strips punctuation and collapses separators", () => {
    expect(slugifyTitle("Nowruz-Fest 2026!! (Aachen)")).toBe("nowruz-fest-2026-aachen");
  });

  it("falls back when the title has no url-safe characters", () => {
    expect(slugifyTitle("!!!")).toBe("beitrag");
  });

  it("caps the base length", () => {
    expect(slugifyTitle("a".repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe("buildSlug", () => {
  it("appends a random suffix so repeated titles do not collide", () => {
    const a = buildSlug("Gleicher Titel");
    const b = buildSlug("Gleicher Titel");
    expect(a).not.toBe(b);
    expect(a.startsWith("gleicher-titel-")).toBe(true);
    expect(a).toMatch(/^gleicher-titel-[a-z0-9]{6}$/);
  });
});
