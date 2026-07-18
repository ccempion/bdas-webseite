import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderRichText } from "./rich-text";

const doc = (content: unknown[]) => ({ type: "doc", content });
const para = (content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, marks });
const html = (d: unknown) => renderToStaticMarkup(renderRichText(d) as never);

describe("renderRichText", () => {
  it("renders bold and italic marks", () => {
    const out = html(
      doc([
        para([
          text("Hallo "),
          text("Welt", [{ type: "bold" }]),
          text(" "),
          text("!", [{ type: "italic" }]),
        ]),
      ]),
    );
    expect(out).toContain("<strong>Welt</strong>");
    expect(out).toContain("<em>!</em>");
  });

  it("keeps an unsafe link as plain text (no anchor)", () => {
    const out = html(
      doc([para([text("klick", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])])]),
    );
    expect(out).not.toContain("<a");
    expect(out).toContain("klick");
  });

  it("adds rel and target to external links", () => {
    const out = html(
      doc([para([text("bdaj", [{ type: "link", attrs: { href: "https://bdaj.de" } }])])]),
    );
    expect(out).toContain('href="https://bdaj.de"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it("renders internal links without a target", () => {
    const out = html(
      doc([para([text("intern", [{ type: "link", attrs: { href: "/impressum" } }])])]),
    );
    expect(out).toContain('href="/impressum"');
    expect(out).not.toContain("target=");
  });

  it("renders bullet lists", () => {
    const out = html(
      doc([
        { type: "bulletList", content: [{ type: "listItem", content: [para([text("eins")])] }] },
      ]),
    );
    expect(out).toContain("<ul");
    expect(out).toContain("<li>");
    expect(out).toContain("eins");
  });

  it("drops unknown nodes but keeps their text", () => {
    const out = html(doc([{ type: "codeBlock", content: [text("x = 1")] }]));
    expect(out).toContain("x = 1");
    expect(out).not.toContain("<code");
  });

  it("returns null for non-doc input", () => {
    expect(renderRichText(null)).toBeNull();
    expect(renderRichText({ foo: 1 })).toBeNull();
    expect(renderRichText("string")).toBeNull();
  });
});
