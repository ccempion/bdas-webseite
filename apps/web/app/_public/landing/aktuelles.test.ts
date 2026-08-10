import { describe, expect, it } from "vitest";

import { plainTextToDoc, type PostSummary } from "@bdas/blog";

import { extractTeaser, toAktuellesItem } from "./aktuelles";

describe("extractTeaser", () => {
  it("returns short text unchanged", () => {
    expect(extractTeaser("<p>Hallo Welt</p>")).toBe("Hallo Welt");
  });

  it("strips tags and collapses whitespace", () => {
    expect(extractTeaser("<p>Hallo</p>\n<p>Welt</p>")).toBe("Hallo Welt");
  });

  it("truncates on a word boundary and appends an ellipsis", () => {
    const long = `<p>${"wort ".repeat(60).trim()}</p>`;
    const teaser = extractTeaser(long, 20);
    expect(teaser.length).toBeLessThanOrEqual(21);
    expect(teaser.endsWith("…")).toBe(true);
    expect(teaser.endsWith(" …")).toBe(false);
  });
});

describe("toAktuellesItem", () => {
  const base: PostSummary = {
    id: "post_1",
    slug: "bundeskonferenz-2026",
    title: "Bundeskonferenz 2026",
    content: plainTextToDoc("Die Hochschulgruppen kommen zusammen."),
    visibility: "public",
    category: "verbandsintern",
    createdBy: "usr_1",
    createdAt: new Date("2026-06-15T00:00:00Z"),
    updatedAt: new Date("2026-06-15T00:00:00Z"),
  };

  it("links to the post's blog detail page", () => {
    expect(toAktuellesItem(base).href).toBe("/blog/bundeskonferenz-2026");
  });

  it("carries title and createdAt through", () => {
    const item = toAktuellesItem(base);
    expect(item.title).toBe("Bundeskonferenz 2026");
    expect(item.publishedAt).toEqual(base.createdAt);
  });

  it("derives a plain-text teaser from the rendered content", () => {
    expect(toAktuellesItem(base).teaser).toBe("Die Hochschulgruppen kommen zusammen.");
  });
});
