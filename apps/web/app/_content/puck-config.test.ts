import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { puckConfig } from "./puck-config";

describe("puckConfig", () => {
  it("keeps the legacy Absatz and PersonenRaster blocks", () => {
    expect(puckConfig.components.Absatz).toBeDefined();
    expect(puckConfig.components.PersonenRaster).toBeDefined();
  });

  it("exposes the Fließtext rich-text block", () => {
    const inhalt = puckConfig.components.Fliesstext?.fields?.inhalt;
    expect(inhalt?.type).toBe("custom");
  });

  it("PersonenRaster items carry the five BSR fields", () => {
    const personen = puckConfig.components.PersonenRaster?.fields?.personen;
    expect(personen).toBeDefined();
    if (personen?.type !== "array") throw new Error("personen must be an array field");
    expect(Object.keys(personen.arrayFields).sort()).toEqual([
      "foto",
      "name",
      "rolle",
      "studiengang",
      "uni",
    ]);
  });

  it("summarises a person by name with a German fallback", () => {
    const personen = puckConfig.components.PersonenRaster?.fields?.personen;
    if (personen?.type !== "array" || !personen.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    expect(
      personen.getItemSummary(
        { foto: "", name: "Aylin Kaya", rolle: "", uni: "", studiengang: "" },
        0,
      ),
    ).toBe("Aylin Kaya");
    expect(
      personen.getItemSummary({ foto: "", name: "", rolle: "", uni: "", studiengang: "" }, 0),
    ).toBe("Neue Person");
  });

  it("Fließtext renders stored rich text", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const out = renderToStaticMarkup(
      render({
        inhalt: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }] },
          ],
        },
        puck: { renderDropZone: () => null, isEditing: false, dragRef: null, metadata: {} },
      } as never) as never,
    );
    expect(out).toContain("<strong>Hi</strong>");
  });

  it("Bild renders an accessible image and hides when empty", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const withImg = renderToStaticMarkup(
      render({
        bild: "https://cdn.test/x.jpg",
        altText: "Gruppenfoto",
        bildunterschrift: "",
        breite: "voll",
        puck: {},
      } as never) as never,
    );
    expect(withImg).toContain('alt="Gruppenfoto"');
    const empty = renderToStaticMarkup(
      render({
        bild: "",
        altText: "",
        bildunterschrift: "",
        breite: "voll",
        puck: {},
      } as never) as never,
    );
    expect(empty).toBe("");
  });

  it("Button applies safeHref and rel/target for external links", () => {
    const render = puckConfig.components.Button?.render;
    if (!render) throw new Error("Button render missing");
    const ext = renderToStaticMarkup(
      render({
        label: "BDAJ",
        href: "https://bdaj.de",
        variante: "primaer",
        puck: {},
      } as never) as never,
    );
    expect(ext).toContain('href="https://bdaj.de"');
    expect(ext).toContain('rel="noopener noreferrer"');
    const bad = renderToStaticMarkup(
      render({
        label: "x",
        href: "javascript:alert(1)",
        variante: "primaer",
        puck: {},
      } as never) as never,
    );
    expect(bad).toBe("");
    const internal = renderToStaticMarkup(
      render({
        label: "Impressum",
        href: "/impressum",
        variante: "sekundaer",
        puck: {},
      } as never) as never,
    );
    expect(internal).toContain('href="/impressum"');
    expect(internal).not.toContain("target=");
  });

  it("Zitat renders text and an optional source", () => {
    const render = puckConfig.components.Zitat?.render;
    if (!render) throw new Error("Zitat render missing");
    const out = renderToStaticMarkup(
      render({ text: "Ein Zitat", quelle: "BSR", puck: {} } as never) as never,
    );
    expect(out).toContain("Ein Zitat");
    expect(out).toContain("BSR");
    expect(out).toContain("<blockquote");
  });

  it("Trenner renders a horizontal rule", () => {
    const render = puckConfig.components.Trenner?.render;
    if (!render) throw new Error("Trenner render missing");
    expect(renderToStaticMarkup(render({ puck: {} } as never) as never)).toContain("<hr");
  });

  it("Abstand renders a spacer sized by hoehe", () => {
    const render = puckConfig.components.Abstand?.render;
    if (!render) throw new Error("Abstand render missing");
    expect(renderToStaticMarkup(render({ hoehe: "gross", puck: {} } as never) as never)).toContain(
      "h-16",
    );
  });
});
