import React from "react";
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

  it("PersonenRaster shows two people per row on the narrowest viewport", () => {
    const render = puckConfig.components.PersonenRaster?.render;
    if (!render) throw new Error("PersonenRaster render missing");
    const person = (name: string) => ({ foto: "", name, rolle: "Rolle", uni: "", studiengang: "" });
    const out = renderToStaticMarkup(
      render({ personen: [person("Eine"), person("Zwei")] } as never),
    );

    const grid = out.match(/class="([^"]*grid[^"]*)"/)?.[1] ?? "";
    // A card is a full-width square photo, so a single column filled a phone
    // screen with one person. Two columns is the base, three from `lg`.
    expect(grid).toContain("grid-cols-2");
    expect(grid).not.toMatch(/\bsm:grid-cols-2\b/);
  });

  it("PersonenRaster's rolle label is generic (not BSR-specific)", () => {
    const personen = puckConfig.components.PersonenRaster?.fields?.personen;
    if (personen?.type !== "array") throw new Error("personen must be an array field");
    expect(personen.arrayFields.rolle?.label).toBe("Rolle");
  });

  it("Fließtext renders stored rich text", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const out = renderToStaticMarkup(
      render({
        inhalt: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Hi", marks: [{ type: "bold" }] }],
            },
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

  it("Spalten offers a 2/3 column select", () => {
    const anzahl = puckConfig.components.Spalten?.fields?.anzahl;
    if (anzahl?.type !== "select") throw new Error("Spalten needs an anzahl select");
    expect(anzahl.options?.map((o) => o.value)).toEqual(["2", "3"]);
  });

  it("Spalten renders its drop zones and gates the third on anzahl", () => {
    const render = puckConfig.components.Spalten?.render;
    if (!render) throw new Error("Spalten render missing");
    const stub = {
      renderDropZone: ({ zone }: { zone: string }) =>
        React.createElement("div", { "data-zone": zone }),
    };
    const two = renderToStaticMarkup(render({ anzahl: "2", puck: stub } as never) as never);
    expect(two).toContain('data-zone="spalte-1"');
    expect(two).toContain('data-zone="spalte-2"');
    expect(two).not.toContain('data-zone="spalte-3"');
    const three = renderToStaticMarkup(render({ anzahl: "3", puck: stub } as never) as never);
    expect(three).toContain('data-zone="spalte-3"');
  });

  it("exposes the Organigramm block with the six box fields", () => {
    const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
    if (kaesten?.type !== "array") throw new Error("kaesten must be an array field");
    expect(Object.keys(kaesten.arrayFields).sort()).toEqual([
      "ebene",
      "hervorheben",
      "link",
      "logo",
      "titel",
      "untertitel",
    ]);
  });

  it("offers four Organigramm levels", () => {
    const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
    if (kaesten?.type !== "array") throw new Error("kaesten must be an array field");
    const ebene = kaesten.arrayFields.ebene;
    if (ebene?.type !== "select") throw new Error("ebene must be a select field");
    expect(ebene.options.map((o) => o.value)).toEqual(["1", "2", "3", "4"]);
  });

  it("pins hervorheben's option values as real booleans, not strings", () => {
    const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
    if (kaesten?.type !== "array") throw new Error("kaesten must be an array field");
    const hervorheben = kaesten.arrayFields.hervorheben;
    if (hervorheben?.type !== "radio") throw new Error("hervorheben must be a radio field");
    expect(hervorheben.options.map((o) => o.value)).toEqual([false, true]);
    expect(hervorheben.options.map((o) => typeof o.value)).toEqual(["boolean", "boolean"]);
    expect(hervorheben.options.map((o) => o.label)).toEqual(["Nein", "Ja"]);
  });

  it("summarises a box by level and title with a German fallback", () => {
    const kaesten = puckConfig.components.Organigramm?.fields?.kaesten;
    if (kaesten?.type !== "array" || !kaesten.getItemSummary) {
      throw new Error("array field with getItemSummary expected");
    }
    const box = {
      ebene: "2" as const,
      titel: "BDAJ",
      untertitel: "",
      link: "",
      logo: "",
      hervorheben: false,
    };
    expect(kaesten.getItemSummary(box, 0)).toBe("2 · BDAJ");
    expect(kaesten.getItemSummary({ ...box, titel: "" }, 0)).toBe("Neuer Kasten");
  });

  it("starts an Organigramm empty so an unfilled block renders nothing", () => {
    expect(puckConfig.components.Organigramm?.defaultProps).toEqual({ kaesten: [] });
  });

  it("Bild shows a placeholder in the editor when no image is chosen", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        bild: "",
        altText: "",
        bildunterschrift: "",
        breite: "voll",
        puck: { isEditing: true },
      } as never) as never,
    );
    expect(out).toContain("data-block-platzhalter");
    expect(out).toContain("Bild");
  });

  it("Button shows a placeholder in the editor when the link is still empty", () => {
    const render = puckConfig.components.Button?.render;
    if (!render) throw new Error("Button render missing");
    const out = renderToStaticMarkup(
      render({
        label: "Mehr erfahren",
        href: "",
        variante: "primaer",
        puck: { isEditing: true },
      } as never) as never,
    );
    expect(out).toContain("data-block-platzhalter");
    expect(out).toContain("Button");
  });

  it("Button shows a placeholder in the editor for an unsafe link, and nothing publicly", () => {
    const render = puckConfig.components.Button?.render;
    if (!render) throw new Error("Button render missing");
    const props = { label: "x", href: "javascript:alert(1)", variante: "primaer" };
    const editing = renderToStaticMarkup(
      render({ ...props, puck: { isEditing: true } } as never) as never,
    );
    expect(editing).toContain("data-block-platzhalter");
    expect(editing).not.toContain("javascript:");
    const publicOut = renderToStaticMarkup(
      render({ ...props, puck: { isEditing: false } } as never) as never,
    );
    expect(publicOut).toBe("");
  });

  it("Absatz shows a placeholder in the editor while its text is empty", () => {
    const render = puckConfig.components.Absatz?.render;
    if (!render) throw new Error("Absatz render missing");
    const editing = renderToStaticMarkup(
      render({ text: "   ", puck: { isEditing: true } } as never) as never,
    );
    expect(editing).toContain("data-block-platzhalter");
    const publicOut = renderToStaticMarkup(
      render({ text: "", puck: { isEditing: false } } as never) as never,
    );
    expect(publicOut).not.toContain("data-block-platzhalter");
  });

  it("Absatz renders its text once written", () => {
    const render = puckConfig.components.Absatz?.render;
    if (!render) throw new Error("Absatz render missing");
    const out = renderToStaticMarkup(
      render({ text: "Ein Satz.", puck: { isEditing: true } } as never) as never,
    );
    expect(out).toContain("Ein Satz.");
    expect(out).not.toContain("data-block-platzhalter");
  });

  it("Fließtext shows a placeholder in the editor while its document is empty", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const leer = { type: "doc", content: [{ type: "paragraph" }] };
    const editing = renderToStaticMarkup(
      render({ inhalt: leer, puck: { isEditing: true } } as never) as never,
    );
    expect(editing).toContain("data-block-platzhalter");
    const publicOut = renderToStaticMarkup(
      render({ inhalt: leer, puck: { isEditing: false } } as never) as never,
    );
    expect(publicOut).not.toContain("data-block-platzhalter");
  });
});
