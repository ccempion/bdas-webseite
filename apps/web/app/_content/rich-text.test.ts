import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { istLeererRichText, renderRichText, umflussClass } from "./rich-text";

const doc = (content: unknown[]) => ({ type: "doc", content });
const para = (content: unknown[]) => ({ type: "paragraph", content });
const text = (t: string, marks?: unknown[]) => ({ type: "text", text: t, marks });
const bild = (attrs: Record<string, unknown>) => ({ type: "image", attrs });
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

describe("istLeererRichText", () => {
  it("treats the Fließtext default document as empty", () => {
    expect(istLeererRichText({ type: "doc", content: [{ type: "paragraph" }] })).toBe(true);
  });

  it("treats a missing or contentless document as empty", () => {
    expect(istLeererRichText(null)).toBe(true);
    expect(istLeererRichText({ type: "doc" })).toBe(true);
    expect(istLeererRichText({ type: "doc", content: [] })).toBe(true);
  });

  it("treats a document with text as non-empty", () => {
    expect(istLeererRichText(doc([para([text("Hallo")])]))).toBe(false);
  });

  it("treats malformed nodes as empty instead of throwing", () => {
    expect(() => istLeererRichText({ type: "doc", content: [null] })).not.toThrow();
    expect(istLeererRichText({ type: "doc", content: [null] })).toBe(true);
    expect(() => istLeererRichText({ type: "doc", content: [undefined] })).not.toThrow();
    expect(istLeererRichText({ type: "doc", content: [undefined] })).toBe(true);
    expect(() => istLeererRichText({ type: "doc", content: ["x"] })).not.toThrow();
    expect(istLeererRichText({ type: "doc", content: ["x"] })).toBe(true);
  });
});

describe("umflussClass", () => {
  it("floats only from the sm breakpoint up", () => {
    expect(umflussClass("links")).toBe("sm:float-left sm:mr-4 sm:mb-2");
    expect(umflussClass("rechts")).toBe("sm:float-right sm:ml-4 sm:mb-2");
  });

  it("emits no float class when text should not wrap", () => {
    expect(umflussClass("keine")).toBe("");
    expect(umflussClass(undefined)).toBe("");
    expect(umflussClass("mittig" as never)).toBe("");
  });
});

describe("renderRichText images", () => {
  it("renders an image with its width and float classes", () => {
    const out = html(
      doc([bild({ src: "https://cdn.test/a.jpg", alt: "Ein Bild", breite: 50, umfluss: "links" })]),
    );
    expect(out).toContain('src="https://cdn.test/a.jpg"');
    expect(out).toContain('alt="Ein Bild"');
    expect(out).toMatch(/\bw-full\b/);
    expect(out).toMatch(/\bsm:w-1\/2\b/);
    expect(out).toMatch(/\bsm:float-left\b/);
  });

  it("covers every width and wrap combination", () => {
    const breiten = [25, 50, 75, 100] as const;
    const erwartet: Record<number, RegExp> = {
      25: /\bsm:w-1\/4\b/,
      50: /\bsm:w-1\/2\b/,
      75: /\bsm:w-3\/4\b/,
      100: /class="[^"]*"/,
    };
    for (const breite of breiten) {
      for (const umfluss of ["keine", "links", "rechts"] as const) {
        const out = html(doc([bild({ src: "https://cdn.test/a.jpg", alt: "x", breite, umfluss })]));
        expect(out, `breite ${breite}`).toMatch(erwartet[breite] as RegExp);
        if (umfluss === "keine") expect(out, "keine darf nicht floaten").not.toMatch(/sm:float-/);
        else
          expect(out, `umfluss ${umfluss}`).toMatch(
            new RegExp(`sm:float-${umfluss === "links" ? "left" : "right"}`),
          );
      }
    }
  });

  it("renders nothing for an unsafe src", () => {
    // The direct analogue of the existing unsafe-link test: the renderer
    // allow-lists on top of the editor, defence in depth.
    const out = html(doc([bild({ src: "javascript:alert(1)", alt: "böse", breite: 50 })]));
    expect(out).not.toContain("<img");
    expect(out).not.toContain("alert");
  });

  it("renders nothing when src is missing entirely", () => {
    expect(html(doc([bild({ alt: "ohne" })]))).not.toContain("<img");
  });

  it("emits an empty alt rather than dropping the attribute", () => {
    // A decorative image must not be announced as "image" by a screen reader.
    const out = html(doc([bild({ src: "https://cdn.test/a.jpg", breite: 100 })]));
    expect(out).toContain('alt=""');
  });

  it("falls back to full width for an unrecognised stored width", () => {
    const out = html(doc([bild({ src: "https://cdn.test/a.jpg", alt: "x", breite: "50%" })]));
    expect(out).toMatch(/\bw-full\b/);
    expect(out).not.toMatch(/\bsm:w-/);
  });

  it("renders an image sitting inside a paragraph's content", () => {
    // Tiptap's Image node is inline-capable; a dropped image commonly lands
    // inside the paragraph the cursor was in.
    const out = html(
      doc([para([text("Vorher "), bild({ src: "https://cdn.test/a.jpg", alt: "Mitte" })])]),
    );
    expect(out).toContain("Vorher");
    expect(out).toContain('alt="Mitte"');
  });
});
