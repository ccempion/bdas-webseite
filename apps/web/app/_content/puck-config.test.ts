import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { ausrichtungFlex, ausrichtungText, puckConfig } from "./puck-config";

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

  it("PersonenRaster shows a placeholder in the editor while it holds nobody", () => {
    const render = puckConfig.components.PersonenRaster?.render;
    if (!render) throw new Error("PersonenRaster render missing");
    const editing = renderToStaticMarkup(
      render({ personen: [], puck: { isEditing: true } } as never) as never,
    );
    expect(editing).toContain("data-block-platzhalter");
    const publicOut = renderToStaticMarkup(
      render({ personen: [], puck: { isEditing: false } } as never) as never,
    );
    expect(publicOut).not.toContain("data-block-platzhalter");
  });

  it("Organigramm shows a placeholder in the editor while it holds no boxes", () => {
    const render = puckConfig.components.Organigramm?.render;
    if (!render) throw new Error("Organigramm render missing");
    const editing = renderToStaticMarkup(
      render({ kaesten: [], puck: { isEditing: true } } as never) as never,
    );
    expect(editing).toContain("data-block-platzhalter");
    const publicOut = renderToStaticMarkup(
      render({ kaesten: [], puck: { isEditing: false } } as never) as never,
    );
    expect(publicOut).not.toContain("data-block-platzhalter");
  });

  it("no block renders a placeholder outside the editor", () => {
    const leereProps: Record<string, unknown> = {
      bild: "",
      altText: "",
      bildunterschrift: "",
      breite: "voll",
      label: "",
      href: "",
      variante: "primaer",
      text: "",
      quelle: "",
      inhalt: { type: "doc", content: [{ type: "paragraph" }] },
      personen: [],
      kaesten: [],
      ebene: "h2",
      hoehe: "mittel",
      anzahl: "2",
    };
    const puck = { isEditing: false, renderDropZone: () => null, dragRef: null, metadata: {} };

    for (const [name, component] of Object.entries(puckConfig.components)) {
      const render = component?.render;
      if (!render) throw new Error(`${name} render missing`);
      const out = renderToStaticMarkup(render({ ...leereProps, puck } as never) as never);
      expect(out, `${name} leaked a placeholder to the public page`).not.toContain(
        "data-block-platzhalter",
      );
    }
  });

  it("maps each Ausrichtung to its text class", () => {
    expect(ausrichtungText("links")).toBe("text-left");
    expect(ausrichtungText("mittig")).toBe("text-center");
    expect(ausrichtungText("rechts")).toBe("text-right");
  });

  it("maps each Ausrichtung to its flex-justify class", () => {
    expect(ausrichtungFlex("links")).toBe("justify-start");
    expect(ausrichtungFlex("mittig")).toBe("justify-center");
    expect(ausrichtungFlex("rechts")).toBe("justify-end");
  });

  it("falls back to left for a missing or unknown Ausrichtung", () => {
    expect(ausrichtungText(undefined)).toBe("text-left");
    expect(ausrichtungFlex(undefined)).toBe("justify-start");
    expect(ausrichtungText("quatsch" as never)).toBe("text-left");
    expect(ausrichtungFlex("quatsch" as never)).toBe("justify-start");
    for (const boese of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
      expect(ausrichtungText(boese as never)).toBe("text-left");
      expect(ausrichtungFlex(boese as never)).toBe("justify-start");
    }
    expect(ausrichtungText(null as never)).toBe("text-left");
    expect(ausrichtungFlex(null as never)).toBe("justify-start");
  });

  it("Ueberschrift aligns its heading", () => {
    const render = puckConfig.components.Ueberschrift?.render;
    if (!render) throw new Error("Ueberschrift render missing");
    const out = renderToStaticMarkup(
      render({ text: "Titel", ebene: "h2", ausrichtung: "mittig", puck: {} } as never) as never,
    );
    expect(out).toContain("text-center");
    expect(out).toContain("Titel");
  });

  it("Ueberschrift renders left-aligned when the prop is absent", () => {
    const render = puckConfig.components.Ueberschrift?.render;
    if (!render) throw new Error("Ueberschrift render missing");
    const out = renderToStaticMarkup(
      render({ text: "Titel", ebene: "h3", puck: {} } as never) as never,
    );
    expect(out).toContain("text-left");
  });

  it("Absatz aligns its paragraph", () => {
    const render = puckConfig.components.Absatz?.render;
    if (!render) throw new Error("Absatz render missing");
    const out = renderToStaticMarkup(
      render({ text: "Ein Satz.", ausrichtung: "rechts", puck: {} } as never) as never,
    );
    expect(out).toContain("text-right");
  });

  it("Zitat aligns its text", () => {
    const render = puckConfig.components.Zitat?.render;
    if (!render) throw new Error("Zitat render missing");
    const out = renderToStaticMarkup(
      render({ text: "Ein Zitat", quelle: "BSR", ausrichtung: "mittig", puck: {} } as never) as never,
    );
    expect(out).toContain("text-center");
    expect(out).toContain("<blockquote");
  });

  it("Fließtext wraps its rich text in an aligned container", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const inhalt = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hallo" }] }],
    };
    const out = renderToStaticMarkup(
      render({ inhalt, ausrichtung: "mittig", puck: { isEditing: false } } as never) as never,
    );
    expect(out).toContain("text-center");
    expect(out).toContain("Hallo");
  });

  it("Fließtext does not align the placeholder", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const leer = { type: "doc", content: [{ type: "paragraph" }] };
    const out = renderToStaticMarkup(
      render({ inhalt: leer, ausrichtung: "rechts", puck: { isEditing: true } } as never) as never,
    );
    expect(out).toContain("data-block-platzhalter");
    expect(out).not.toContain("text-right");
  });

  it("Fließtext exposes an Ausrichtung select defaulting to links", () => {
    const field = puckConfig.components.Fliesstext?.fields?.ausrichtung;
    if (field?.type !== "select") throw new Error("Fliesstext needs an ausrichtung select");
    expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
    expect(puckConfig.components.Fliesstext?.defaultProps?.ausrichtung).toBe("links");
  });

  it("the three text blocks expose an Ausrichtung select", () => {
    for (const name of ["Ueberschrift", "Absatz", "Zitat"] as const) {
      const field = puckConfig.components[name]?.fields?.ausrichtung;
      if (field?.type !== "select") throw new Error(`${name} needs an ausrichtung select`);
      expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
      expect(puckConfig.components[name]?.defaultProps?.ausrichtung).toBe("links");
    }
  });

  it("Bild centres the figure and its caption", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        bild: "https://cdn.test/x.jpg",
        altText: "Gruppenfoto",
        bildunterschrift: "Unterschrift",
        breite: "halb",
        ausrichtung: "mittig",
        puck: {},
      } as never) as never,
    );
    expect(out).toContain("justify-center");
    expect(out).toContain("text-center");
    expect(out).toContain('alt="Gruppenfoto"');
    // Element-scoped: the wrapper must carry justify-center and only the
    // figcaption must carry text-center, so a swap between ausrichtungFlex
    // and ausrichtungText on the wrong element would fail this.
    expect(out).toMatch(/<div class="flex justify-center">/);
    expect(out).toMatch(/<figcaption class="[^"]*\btext-center\b[^"]*">/);
  });

  it("Bild at halber Breite keeps an explicit width so it does not shrink-wrap", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        bild: "https://cdn.test/x.jpg",
        altText: "a",
        bildunterschrift: "",
        breite: "halb",
        ausrichtung: "links",
        puck: {},
      } as never) as never,
    );
    expect(out).toMatch(/<figure class="[^"]*\bw-full\b[^"]*\bsm:max-w-md\b/);
  });

  it("Bild does not align its placeholder", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        bild: "",
        altText: "",
        bildunterschrift: "",
        breite: "voll",
        ausrichtung: "rechts",
        puck: { isEditing: true },
      } as never) as never,
    );
    expect(out).toContain("data-block-platzhalter");
    expect(out).not.toContain("justify-end");
  });

  it("Button aligns without disturbing its href or rel", () => {
    const render = puckConfig.components.Button?.render;
    if (!render) throw new Error("Button render missing");
    const out = renderToStaticMarkup(
      render({
        label: "BDAJ",
        href: "https://bdaj.de",
        variante: "primaer",
        ausrichtung: "rechts",
        puck: {},
      } as never) as never,
    );
    expect(out).toContain("justify-end");
    expect(out).toContain('href="https://bdaj.de"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("Button still renders nothing publicly for an unsafe href, aligned or not", () => {
    const render = puckConfig.components.Button?.render;
    if (!render) throw new Error("Button render missing");
    const out = renderToStaticMarkup(
      render({
        label: "x",
        href: "javascript:alert(1)",
        variante: "primaer",
        ausrichtung: "mittig",
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toBe("");
  });

  it("Bild and Button expose an Ausrichtung select defaulting to links", () => {
    for (const name of ["Bild", "Button"] as const) {
      const field = puckConfig.components[name]?.fields?.ausrichtung;
      if (field?.type !== "select") throw new Error(`${name} needs an ausrichtung select`);
      expect(field.options?.map((o) => o.value)).toEqual(["links", "mittig", "rechts"]);
      expect(puckConfig.components[name]?.defaultProps?.ausrichtung).toBe("links");
    }
  });

  it("exactly the six intended blocks carry an Ausrichtung field", () => {
    const mit = Object.entries(puckConfig.components)
      .filter(([, c]) => c?.fields && "ausrichtung" in c.fields)
      .map(([name]) => name)
      .sort();
    expect(mit).toEqual(["Absatz", "Bild", "Button", "Fliesstext", "Ueberschrift", "Zitat"]);
  });

  it("a document saved before Ausrichtung existed still renders left-aligned", () => {
    const puck = { isEditing: false, renderDropZone: () => null, dragRef: null, metadata: {} };
    const faelle: Array<[string, Record<string, unknown>, string[]]> = [
      ["Ueberschrift", { text: "Titel", ebene: "h2" }, ["text-left"]],
      ["Absatz", { text: "Ein Satz." }, ["text-left"]],
      ["Zitat", { text: "Ein Zitat", quelle: "" }, ["text-left"]],
      [
        "Fliesstext",
        {
          inhalt: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
          },
        },
        ["text-left"],
      ],
      [
        "Bild",
        {
          bild: "https://cdn.test/x.jpg",
          altText: "a",
          bildunterschrift: "Unterschrift",
          breite: "voll",
        },
        // Bild calls ausrichtungText/ausrichtungFlex at two sites: the flex
        // wrapper and (only when a caption is set) the figcaption. A non-empty
        // caption is required here so both call sites are exercised.
        ["justify-start", "text-left"],
      ],
      ["Button", { label: "x", href: "/impressum", variante: "primaer" }, ["justify-start"]],
    ];

    for (const [name, props, erwarteteKlassen] of faelle) {
      const render = puckConfig.components[name as keyof typeof puckConfig.components]?.render;
      if (!render) throw new Error(`${name} render missing`);
      const out = renderToStaticMarkup(render({ ...props, puck } as never) as never);
      expect(out, `${name} must not centre or right-align a legacy document`).not.toMatch(
        /text-center|text-right|justify-center|justify-end/,
      );
      for (const klasse of erwarteteKlassen) {
        expect(out, `${name} must carry ${klasse} for a legacy document`).toContain(klasse);
      }
    }
  });
});
