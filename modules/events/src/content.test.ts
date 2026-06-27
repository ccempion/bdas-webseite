import { describe, expect, it } from "vitest";

import { plainTextToDoc, renderEventContentHtml } from "./content";

describe("renderEventContentHtml", () => {
  it("returns empty string for null/empty docs", () => {
    expect(renderEventContentHtml(null)).toBe("");
    expect(renderEventContentHtml(undefined)).toBe("");
    expect(renderEventContentHtml({ type: "doc", content: [] })).toBe("");
  });

  it("renders headings and bold text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Titel" }] },
        { type: "paragraph", content: [{ type: "text", text: "Fett", marks: [{ type: "bold" }] }] },
      ],
    } as const;
    const html = renderEventContentHtml(doc as Parameters<typeof renderEventContentHtml>[0]);
    expect(html).toContain("<h2>");
    expect(html).toContain("Titel");
    expect(html).toContain("<strong>");
    expect(html).toContain("Fett");
    // plain paragraph still works
    const plain = renderEventContentHtml(plainTextToDoc("Hallo Welt"));
    expect(plain).toContain("Hallo Welt");
    expect(plain).toContain("<p>");
  });

  it("strips dangerous markup (no script, no onerror)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
        {
          type: "image",
          attrs: { src: "https://x/y.png", onerror: "alert(1)" },
        },
      ],
    } as const;
    const html = renderEventContentHtml(doc as Parameters<typeof renderEventContentHtml>[0]);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("onerror");
  });
});
