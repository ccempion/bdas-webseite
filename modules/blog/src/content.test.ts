import { describe, expect, it } from "vitest";

import { plainTextToDoc, renderPostContentHtml } from "./content";
import type { TiptapDoc } from "./types";

describe("renderPostContentHtml", () => {
  it("returns empty string for empty/null docs", () => {
    expect(renderPostContentHtml(null)).toBe("");
    expect(renderPostContentHtml({ type: "doc", content: [] })).toBe("");
  });

  it("renders paragraphs and marks", () => {
    const html = renderPostContentHtml(plainTextToDoc("Hallo Welt"));
    expect(html).toContain("<p>Hallo Welt</p>");
  });

  it("hardens links with rel/target", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              marks: [{ type: "link", attrs: { href: "https://bdas.de" } }],
              text: "BDAS",
            },
          ],
        },
      ],
    } as unknown as TiptapDoc;
    const html = renderPostContentHtml(doc);
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("strips a script injected via raw text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
      ],
    } as unknown as TiptapDoc;
    expect(renderPostContentHtml(doc)).not.toContain("<script>");
  });

  it("keeps a YouTube embed iframe", () => {
    const doc = {
      type: "doc",
      content: [{ type: "youtube", attrs: { src: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } }],
    } as unknown as TiptapDoc;
    const html = renderPostContentHtml(doc);
    expect(html).toContain("<iframe");
    expect(html).toMatch(/youtube(-nocookie)?\.com\/embed\//);
  });

  it("drops a non-YouTube iframe", () => {
    // Simulate a doc that somehow carries a foreign iframe embed src.
    const doc = {
      type: "doc",
      content: [{ type: "youtube", attrs: { src: "https://evil.example.com/embed/x" } }],
    } as unknown as TiptapDoc;
    const html = renderPostContentHtml(doc);
    expect(html).not.toContain("evil.example.com");
  });
});
