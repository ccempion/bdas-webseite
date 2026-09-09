import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { Data } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";

// The canvas chrome pulls in the footer view, which renders the logo through
// next/image; Vite resolves that import to a URL string and next/image then
// demands an explicit width. The logo is not what these tests are about.
vi.mock("next/image", () => ({
  default: ({ alt, className }: { alt: string; className?: string }) =>
    React.createElement("img", { alt, className }),
}));

// The offer itself is covered next to it (app/_newsletter/NewsletterOffer.test.tsx)
// and is built on `useFormState`, which throws outside an action context. What
// belongs here is the block's own job: reading the state out of metadata.
vi.mock("../_newsletter/NewsletterOffer", () => ({
  NewsletterOffer: (p: { state: string; source: string; sourcePath: string; heading: string }) =>
    React.createElement("div", {
      "data-offer": p.state,
      "data-source": p.source,
      "data-source-path": p.sourcePath,
      "data-heading": p.heading,
    }),
}));

import { legalUrls } from "../../lib/legal";
import { ausrichtungFlex, ausrichtungText } from "./ausrichtung";
import { akkordeonKeys, breiteClass, normalizeContent, puckConfig } from "./puck-config";

/** The nav the server derives and passes through metadata. Flags are off in the
 *  test environment, so this is deliberately richer than anything `navItems()`
 *  would produce here — which is the point: the canvas must render what it is
 *  given, not re-derive it. */
const CHROME_NAV = [
  { label: "Unsere Arbeit", href: "/unsere-arbeit" },
  { label: "Events", href: "/events" },
  { label: "Blog", href: "/blog" },
];

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

  it("Fließtext renders through the typography scale so paragraphs keep their spacing", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const out = renderToStaticMarkup(
      render({
        inhalt: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "eins" }] },
            { type: "paragraph", content: [{ type: "text", text: "zwei" }] },
          ],
        },
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).toContain("prose");
    expect(out).toContain("max-w-none");
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

  it("Spalten offers a 2/3/4 column and asymmetric select", () => {
    const anzahl = puckConfig.components.Spalten?.fields?.anzahl;
    if (anzahl?.type !== "select") throw new Error("Spalten needs an anzahl select");
    expect(anzahl.options?.map((o) => o.value)).toEqual(["2", "3", "4", "1-2", "2-1"]);
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
    expect(publicOut).toBe("");
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
      render({
        text: "Ein Zitat",
        quelle: "BSR",
        ausrichtung: "mittig",
        puck: {},
      } as never) as never,
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
        breite: 50,
        ausrichtung: "mittig",
        puck: {},
      } as never) as never,
    );
    expect(out).toContain("justify-center");
    expect(out).toContain("text-center");
    expect(out).toContain('alt="Gruppenfoto"');
    // Element-scoped: the wrapper must carry justify-center and only the
    // figcaption must carry text-center, so a swap between ausrichtungFlex
    // and ausrichtungText on the wrong element would fail this. The class
    // value is still pinned exactly; the element just carries attributes
    // after it now (`data-bild-rahmen`).
    expect(out).toMatch(/<div class="flex justify-center"[ >]/);
    expect(out).toMatch(/<figcaption class="[^"]*\btext-center\b[^"]*">/);
  });

  it("Bild below full width keeps an explicit width so it does not shrink-wrap", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        bild: "https://cdn.test/x.jpg",
        altText: "a",
        bildunterschrift: "",
        breite: 50,
        ausrichtung: "links",
        puck: {},
      } as never) as never,
    );
    // `w-full` under the alignment wrapper, narrowed from `sm` up. Without the
    // explicit width the figure shrink-wraps to the image's intrinsic size.
    expect(out).toMatch(/<figure class="[^"]*\bw-full\b[^"]*\bsm:w-1\/2\b/);
  });

  it("Bild offers the four width steps as numbers", () => {
    const breite = puckConfig.components.Bild?.fields?.breite;
    if (breite?.type !== "select") throw new Error("breite must be a select field");
    expect(breite.options.map((o) => o.value)).toEqual([25, 50, 75, 100]);
    expect(breite.options.map((o) => o.label)).toEqual(["25 %", "50 %", "75 %", "100 %"]);
  });

  it("a new Bild is full width", () => {
    expect(puckConfig.components.Bild?.defaultProps?.breite).toBe(100);
  });

  it("Bild renders the width class for each step", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const figureClass = (breite: number) => {
      const out = renderToStaticMarkup(
        render({
          bild: "https://cdn.test/x.jpg",
          altText: "a",
          bildunterschrift: "",
          breite,
          ausrichtung: "links",
          puck: {},
        } as never) as never,
      );
      return out.match(/<figure class="([^"]*)"/)?.[1] ?? "";
    };
    // Matched by containment, not equality: Task 4 adds `relative` to this same
    // element, and an exact-string assertion would break on a change that has
    // nothing to do with width.
    expect(figureClass(25)).toMatch(/\bw-full\b.*\bsm:w-1\/4\b/);
    expect(figureClass(50)).toMatch(/\bw-full\b.*\bsm:w-1\/2\b/);
    expect(figureClass(75)).toMatch(/\bw-full\b.*\bsm:w-3\/4\b/);
    expect(figureClass(100)).toMatch(/\bw-full\b/);
    expect(figureClass(100)).not.toMatch(/\bsm:w-/);
  });

  it("Bild ships no resize handle to the public page", () => {
    const render = puckConfig.components.Bild?.render;
    if (!render) throw new Error("Bild render missing");
    const out = renderToStaticMarkup(
      render({
        id: "bild-1",
        bild: "https://cdn.test/x.jpg",
        altText: "a",
        bildunterschrift: "",
        breite: 50,
        ausrichtung: "links",
        puck: { isEditing: false },
      } as never) as never,
    );
    expect(out).not.toContain("data-bild-groesse-griff");
  });

  it("a Bild saved before the numeric scale still renders full width", () => {
    // The migration runs in normalizeContent, but the render must not blow up on
    // an unmigrated prop bag either — the structural sweep passes none at all.
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
    expect(out).toMatch(/<figure class="[^"]*\bw-full\b/);
    expect(out).not.toMatch(/\bsm:w-/);
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

  it("exactly the seven intended blocks carry an Ausrichtung field", () => {
    const mit = Object.entries(puckConfig.components)
      .filter(([, c]) => c?.fields && "ausrichtung" in c.fields)
      .map(([name]) => name)
      .sort();
    expect(mit).toEqual([
      "Absatz",
      "Bild",
      "Button",
      "Fliesstext",
      "Hero",
      "Ueberschrift",
      "Zitat",
    ]);
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

  it("normalizeContent seeds the root width when the document has none", () => {
    const data = { content: [], root: {} } as unknown as Data;
    const out = normalizeContent(data, "breit");
    expect((out.root.props as { breite?: string }).breite).toBe("breit");
  });

  it("normalizeContent keeps a width the document already carries", () => {
    const data = { content: [], root: { props: { breite: "schmal" } } } as unknown as Data;
    const out = normalizeContent(data, "breit");
    expect((out.root.props as { breite?: string }).breite).toBe("schmal");
  });

  it("normalizeContent migrates legacy Bild widths onto the numeric scale", () => {
    const data = {
      content: [
        { type: "Bild", props: { id: "a", bild: "x.jpg", breite: "voll" } },
        { type: "Bild", props: { id: "b", bild: "y.jpg", breite: "halb" } },
        { type: "Bild", props: { id: "c", bild: "z.jpg" } },
      ],
      root: {},
    } as unknown as Data;

    const breiten = normalizeContent(data, "schmal").content.map(
      (item) => (item.props as { breite?: unknown }).breite,
    );
    expect(breiten).toEqual([100, 50, 100]);
  });

  it("normalizeContent leaves a document's other blocks and ids alone", () => {
    const data = {
      content: [
        { type: "Bild", props: { id: "a", bild: "x.jpg", altText: "Foto", breite: "halb" } },
        { type: "Absatz", props: { id: "b", text: "Ein Satz." } },
      ],
      root: {},
    } as unknown as Data;

    const out = normalizeContent(data, "schmal");
    expect(out.content[0]?.props).toMatchObject({ id: "a", altText: "Foto", breite: 50 });
    expect(out.content[1]?.props).toEqual({ id: "b", text: "Ein Satz." });
  });

  it("normalizeContent keeps root under a props key, never the legacy flat shape", () => {
    // transformProps unwraps root to root.props when the incoming root has no
    // props key. Seeding the width first is what stops that from happening.
    const data = { content: [], root: {} } as unknown as Data;
    const out = normalizeContent(data, "schmal");
    expect(out.root.props).toBeDefined();
    expect((out.root as { breite?: string }).breite).toBeUndefined();
  });
  it("Fließtext wraps its content in a single element that can contain a float", () => {
    const render = puckConfig.components.Fliesstext?.render;
    if (!render) throw new Error("Fliesstext render missing");
    const out = renderToStaticMarkup(
      render({
        inhalt: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: { src: "https://cdn.test/a.jpg", alt: "x", breite: 50, umfluss: "links" },
            },
            { type: "paragraph", content: [{ type: "text", text: "Text daneben." }] },
          ],
        },
        ausrichtung: "links",
        puck: {},
      } as never) as never,
    );
    // One wrapper around both the floated image and the text it wraps: they must
    // share a formatting context for the wrap to happen at all, and that wrapper
    // is what keeps the float from reaching the next Puck block.
    expect(out).toMatch(/^<div class="[^"]*\btext-left\b[^"]*">/);
    expect(out).toContain("sm:float-left");
    expect(out).toContain("Text daneben.");
    expect(out.endsWith("</div>")).toBe(true);
  });
  it("root renders no page chrome outside the editor", () => {
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: React.createElement("p", null, "Inhalt"),
        puck: {
          isEditing: false,
          metadata: { chrome: { navItems: CHROME_NAV, events: true, groups: true } },
        },
      } as never) as never,
    );
    expect(out).toContain("Inhalt");
    // A visitor must never get a second header: the layout already renders one.
    expect(out).not.toContain("<header");
    expect(out).not.toContain("<footer");
  });

  it("root frames the column in visitor chrome inside the editor", () => {
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: React.createElement("p", null, "Inhalt"),
        puck: {
          isEditing: true,
          metadata: { chrome: { navItems: CHROME_NAV, events: true, groups: true } },
        },
      } as never) as never,
    );
    expect(out).toContain("<header");
    expect(out).toContain("<footer");
    expect(out).toContain("Inhalt");
    // The visitor's header, not the board member's.
    expect(out).toContain("Anmelden");
    expect(out).not.toContain("Mein Konto");
  });

  it("the canvas header renders the nav the server derived, not its own", () => {
    // root.render runs in the browser, where isFlagOn reads a computed
    // process.env key that Next cannot inline — every flag would read false and
    // the header would silently drop Events, Blog and Gruppen while the footer
    // beside it showed them. The nav therefore arrives through metadata.
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: null,
        puck: {
          isEditing: true,
          metadata: { chrome: { navItems: CHROME_NAV, events: true, groups: true } },
        },
      } as never) as never,
    );
    expect(out).toContain('href="/events"');
    expect(out).toContain('href="/blog"');
    expect(out).toContain('href="/unsere-arbeit"');
  });

  it("the canvas footer links to the legal routes the app owns", () => {
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: null,
        puck: {
          isEditing: true,
          metadata: { chrome: { navItems: [], events: false, groups: false } },
        },
      } as never) as never,
    );
    expect(out).toContain(`href="${legalUrls().privacy}"`);
    expect(out).toContain(`href="${legalUrls().imprint}"`);
    expect(out).toContain(`href="${legalUrls().terms}"`);
  });

  it("the canvas chrome is inert and hidden from assistive tech", () => {
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: React.createElement("p", null, "Inhalt"),
        puck: {
          isEditing: true,
          metadata: { chrome: { navItems: CHROME_NAV, events: false, groups: false } },
        },
      } as never) as never,
    );
    // A stray click on a nav link navigates the canvas iframe away and the
    // board loses the editor. `inert` covers the keyboard too, and takes the
    // chrome out of the accessibility tree without leaving focusable controls
    // behind an aria-hidden wrapper; pointer-events-none is the fallback for
    // browsers without inert.
    expect(out).toMatch(/pointer-events-none/);
    expect(out.match(/inert=""/g)?.length).toBe(2);
  });

  it("the canvas footer honours the chrome flags it is given", () => {
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const mit = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: null,
        puck: {
          isEditing: true,
          metadata: { chrome: { navItems: CHROME_NAV, events: true, groups: false } },
        },
      } as never) as never,
    );
    expect(mit).toContain('href="/events"');
    expect(mit).not.toContain('href="/gruppen"');
  });

  it("root survives an editor session with no chrome metadata", () => {
    // Defensive: a route that forgot the prop must degrade to no chrome, not a
    // crashed canvas.
    const render = puckConfig.root?.render;
    if (!render) throw new Error("root render missing");
    const out = renderToStaticMarkup(
      render({
        breite: "schmal",
        children: React.createElement("p", null, "Inhalt"),
        puck: { isEditing: true, metadata: {} },
      } as never) as never,
    );
    expect(out).toContain("Inhalt");
  });

  describe("Breite: voll", () => {
    it("breiteClass has no max-width class for voll", () => {
      expect(breiteClass("voll")).toBe("");
    });

    it("breiteClass keeps existing schmal/breit behaviour", () => {
      expect(breiteClass("schmal")).toBe("max-w-3xl");
      expect(breiteClass("breit")).toBe("max-w-5xl");
    });

    it("normalizeContent keeps a voll width the document already carries", () => {
      const data = { root: { props: { breite: "voll" } }, content: [] } as unknown as Data;
      const out = normalizeContent(data, "schmal");
      expect((out.root.props as { breite?: string }).breite).toBe("voll");
    });

    it("normalizeContent still seeds the fallback when no width is stored", () => {
      const data = { root: { props: {} }, content: [] } as unknown as Data;
      const out = normalizeContent(data, "voll");
      expect((out.root.props as { breite?: string }).breite).toBe("voll");
    });
  });

  describe("root breite field", () => {
    it("offers schmal/breit/voll by default (no slug in metadata)", () => {
      const resolve = puckConfig.root?.resolveFields;
      if (!resolve) throw new Error("root.resolveFields missing");
      const fields = resolve(
        { props: { breite: "schmal" } } as never,
        { metadata: {} } as never,
      ) as unknown as { breite: { options: { value: string }[] } };
      expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit", "voll"]);
    });

    it("hides voll for legal-text slugs", () => {
      const resolve = puckConfig.root?.resolveFields;
      if (!resolve) throw new Error("root.resolveFields missing");
      for (const slug of ["datenschutz", "impressum", "nutzungsbedingungen"]) {
        const fields = resolve(
          { props: { breite: "schmal" } } as never,
          { metadata: { slug } } as never,
        ) as unknown as { breite: { options: { value: string }[] } };
        expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit"]);
      }
    });

    it("keeps voll for content-page slugs, including dynamic group slugs", () => {
      const resolve = puckConfig.root?.resolveFields;
      if (!resolve) throw new Error("root.resolveFields missing");
      for (const slug of ["ueber-uns", "ueber-uns/bdaj", "gruppen/berlin"]) {
        const fields = resolve(
          { props: { breite: "schmal" } } as never,
          { metadata: { slug } } as never,
        ) as unknown as { breite: { options: { value: string }[] } };
        expect(fields.breite.options.map((o) => o.value)).toEqual(["schmal", "breit", "voll"]);
      }
    });
  });

  describe("Spalten presets", () => {
    const render = () => {
      const r = puckConfig.components.Spalten?.render;
      if (!r) throw new Error("Spalten render missing");
      return r;
    };
    const puck = { renderDropZone: ({ zone }: { zone: string }) => `[${zone}]` };

    it("2 and 3 keep their existing equal-column classes", () => {
      const out2 = renderToStaticMarkup(render()({ anzahl: "2", puck } as never));
      expect(out2).toContain("sm:grid-cols-2");
      const out3 = renderToStaticMarkup(render()({ anzahl: "3", puck } as never));
      expect(out3).toContain("sm:grid-cols-3");
    });

    it("4 renders four zones on a four-column grid", () => {
      const out = renderToStaticMarkup(render()({ anzahl: "4", puck } as never));
      expect(out).toContain("lg:grid-cols-4");
      for (const zone of ["spalte-1", "spalte-2", "spalte-3", "spalte-4"]) {
        expect(out).toContain(`[${zone}]`);
      }
    });

    it("1-2 gives the second zone a double column-span", () => {
      const out = renderToStaticMarkup(render()({ anzahl: "1-2", puck } as never));
      expect(out).toContain("sm:col-span-1");
      expect(out).toContain("sm:col-span-2");
    });

    it("2-1 gives the first zone a double column-span", () => {
      const out = renderToStaticMarkup(render()({ anzahl: "2-1", puck } as never));
      const firstSpanIndex = out.indexOf("sm:col-span-2");
      const secondSpanIndex = out.indexOf("sm:col-span-1");
      expect(firstSpanIndex).toBeGreaterThan(-1);
      expect(secondSpanIndex).toBeGreaterThan(firstSpanIndex);
    });

    it("exposes all five options on the anzahl field", () => {
      const anzahl = puckConfig.components.Spalten?.fields?.anzahl;
      if (anzahl?.type !== "select") throw new Error("anzahl must be a select field");
      expect(anzahl.options.map((o) => o.value)).toEqual(["2", "3", "4", "1-2", "2-1"]);
    });
  });

  describe("Hero block", () => {
    it("exposes its eight fields with defaults for every one", () => {
      const hero = puckConfig.components.Hero;
      expect(hero?.label).toBe("Hero / Aufmacher");
      // A field without a default ships a control the board cannot rely on, so
      // the two lists must stay in step — hence one assertion over both.
      expect(hero?.defaultProps).toEqual({
        ueberschrift: "Überschrift",
        untertext: "",
        hintergrund: "hell",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
      });
      expect(Object.keys(hero?.fields ?? {}).sort()).toEqual(
        Object.keys(hero?.defaultProps ?? {}).sort(),
      );
    });

    it("offers exactly the option values the component understands", () => {
      // A select value outside the component's lookup silently falls back and
      // reads as a broken control, so these lists are pinned to it.
      const hintergrund = puckConfig.components.Hero?.fields?.hintergrund;
      if (hintergrund?.type !== "select") throw new Error("hintergrund must be a select");
      expect(hintergrund.options.map((o) => o.value)).toEqual(["hell", "akzent", "bild"]);

      const hoehe = puckConfig.components.Hero?.fields?.hoehe;
      if (hoehe?.type !== "select") throw new Error("hoehe must be a select");
      expect(hoehe.options.map((o) => o.value)).toEqual(["kompakt", "mittel", "gross"]);
    });

    it("shows a placeholder in the editor while headline, text and image are all empty", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const out = renderToStaticMarkup(
        render({
          ueberschrift: "",
          untertext: "",
          hintergrund: "hell",
          bild: "",
          hoehe: "mittel",
          ausrichtung: "links",
          buttonLabel: "",
          buttonHref: "",
          puck: { isEditing: true },
        } as never) as never,
      );
      expect(out).toContain("data-block-platzhalter");
      expect(out).toContain("Noch kein Inhalt");
    });

    it("renders nothing at all on the public page while empty", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const out = renderToStaticMarkup(
        render({
          ueberschrift: "",
          untertext: "",
          hintergrund: "akzent",
          bild: "",
          hoehe: "mittel",
          ausrichtung: "links",
          buttonLabel: "",
          buttonHref: "",
          puck: { isEditing: false },
        } as never) as never,
      );
      expect(out).toBe("");
    });

    it("ignores a leftover image when the background no longer uses it", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      // The board uploaded a photo, then switched back to the accent ground and
      // cleared the text. `FotoField` has no remove action, so the stale URL
      // stays on the block — it must not keep an otherwise empty Hero alive as
      // a tall coloured box on the public page.
      const props = {
        ueberschrift: "",
        untertext: "",
        hintergrund: "akzent",
        bild: "https://cdn.example/verwaist.webp",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "",
        buttonHref: "",
      };
      expect(
        renderToStaticMarkup(render({ ...props, puck: { isEditing: false } } as never) as never),
      ).toBe("");
      expect(
        renderToStaticMarkup(render({ ...props, puck: { isEditing: true } } as never) as never),
      ).toContain("data-block-platzhalter");
    });

    it("treats a usable button as content on its own", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const out = renderToStaticMarkup(
        render({
          ueberschrift: "",
          untertext: "",
          hintergrund: "akzent",
          bild: "",
          hoehe: "mittel",
          ausrichtung: "links",
          buttonLabel: "Jetzt Mitglied werden",
          buttonHref: "/mitglied-werden",
          puck: { isEditing: false },
        } as never) as never,
      );
      expect(out).toContain('href="/mitglied-werden"');
      expect(out).toContain("Jetzt Mitglied werden");
    });

    it("stays empty when the button's link is unusable", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      // `safeHref` rejects it, so the Hero would render a frame around a button
      // that never appears. Empty is the honest state.
      const props = {
        ueberschrift: "",
        untertext: "",
        hintergrund: "akzent",
        bild: "",
        hoehe: "mittel",
        ausrichtung: "links",
        buttonLabel: "Klick mich",
        buttonHref: "javascript:alert(1)",
      };
      expect(
        renderToStaticMarkup(render({ ...props, puck: { isEditing: false } } as never) as never),
      ).toBe("");
      expect(
        renderToStaticMarkup(render({ ...props, puck: { isEditing: true } } as never) as never),
      ).toContain("data-block-platzhalter");
    });

    it("renders the real hero, not the placeholder, as soon as one field is filled", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const out = renderToStaticMarkup(
        render({
          ueberschrift: "",
          untertext: "",
          hintergrund: "bild",
          bild: "https://cdn.example/foto.webp",
          hoehe: "kompakt",
          ausrichtung: "links",
          buttonLabel: "",
          buttonHref: "",
          puck: { isEditing: true },
        } as never) as never,
      );
      expect(out).not.toContain("data-block-platzhalter");
      expect(out).toContain("bg-bdas-hero-scrim");
    });

    it("a document saved before the Hero's props existed still renders", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const out = renderToStaticMarkup(
        render({ ueberschrift: "Alt", puck: { isEditing: false } } as never) as never,
      );
      expect(out).toContain("Alt");
      expect(out).toContain("min-h-[24rem]");
      expect(out).not.toContain("text-bdas-ink-on-brand");
    });
  });

  describe("Panel block", () => {
    it("wraps its DropZone in the design-system Card", () => {
      const render = puckConfig.components.Panel?.render;
      if (!render) throw new Error("Panel render missing");
      const puck = { renderDropZone: ({ zone }: { zone: string }) => `[${zone}]` };
      const out = renderToStaticMarkup(render({ titel: "", variante: "standard", puck } as never));
      expect(out).toContain("[inhalt]");
      expect(out).toMatch(/class="[^"]*rounded-bdas[^"]*"/);
    });

    it("shows the title when set", () => {
      const render = puckConfig.components.Panel?.render;
      if (!render) throw new Error("Panel render missing");
      const puck = { renderDropZone: () => null };
      const out = renderToStaticMarkup(
        render({ titel: "Kontakt", variante: "standard", puck } as never),
      );
      expect(out).toContain("Kontakt");
    });

    it("hervorgehoben adds the accent left-border", () => {
      const render = puckConfig.components.Panel?.render;
      if (!render) throw new Error("Panel render missing");
      const puck = { renderDropZone: () => null };
      const out = renderToStaticMarkup(
        render({ titel: "", variante: "hervorgehoben", puck } as never),
      );
      expect(out).toContain("border-l-4");
      expect(out).toContain("border-l-bdas-red");
    });

    it("standard variant has no accent border", () => {
      const render = puckConfig.components.Panel?.render;
      if (!render) throw new Error("Panel render missing");
      const puck = { renderDropZone: () => null };
      const out = renderToStaticMarkup(render({ titel: "", variante: "standard", puck } as never));
      expect(out).not.toContain("border-l-4");
    });
  });

  describe("Akkordeon block", () => {
    it("shows a placeholder in the editor when empty", () => {
      const render = puckConfig.components.Akkordeon?.render;
      if (!render) throw new Error("Akkordeon render missing");
      const out = renderToStaticMarkup(
        render({ eintraege: [], puck: { isEditing: true } } as never),
      );
      expect(out).toContain("Noch keine Einträge");
    });

    it("renders one details element per entry using the shared accordion class", () => {
      const render = puckConfig.components.Akkordeon?.render;
      if (!render) throw new Error("Akkordeon render missing");
      const out = renderToStaticMarkup(
        render({
          eintraege: [
            { frage: "Wie trete ich bei?", antwort: "Über das Anmeldeformular." },
            { frage: "Wo treffen wir uns?", antwort: "Immer donnerstags." },
          ],
          puck: { isEditing: false },
        } as never),
      );
      expect((out.match(/class="bdas-accordion"/g) ?? []).length).toBe(2);
      expect(out).toContain("Wie trete ich bei?");
      expect(out).toContain("Über das Anmeldeformular.");
    });

    it("keys an entry by its question, so a reorder moves the open state with it", () => {
      const eintraege = [{ frage: "Wie trete ich bei?" }, { frage: "Wo treffen wir uns?" }];
      const keys = akkordeonKeys(eintraege);
      expect(keys).toEqual(["Wie trete ich bei?", "Wo treffen wir uns?"]);
      expect(akkordeonKeys([...eintraege].reverse())).toEqual([...keys].reverse());
    });

    it("keeps keys distinct for duplicate and empty questions", () => {
      const keys = akkordeonKeys([
        { frage: "Beitrag?" },
        { frage: "Beitrag?" },
        { frage: "" },
        { frage: "" },
      ]);
      expect(new Set(keys).size).toBe(4);
    });

    it("summarises an entry by its question", () => {
      const eintraege = puckConfig.components.Akkordeon?.fields?.eintraege;
      if (eintraege?.type !== "array" || !eintraege.getItemSummary) {
        throw new Error("array field with getItemSummary expected");
      }
      expect(eintraege.getItemSummary({ frage: "Wie trete ich bei?", antwort: "" }, 0)).toBe(
        "Wie trete ich bei?",
      );
      expect(eintraege.getItemSummary({ frage: "", antwort: "" }, 0)).toBe("Neuer Eintrag");
    });
  });
  describe("KartenRaster block", () => {
    it("is registered with the German label and two fields", () => {
      const block = puckConfig.components.KartenRaster;
      expect(block?.label).toBe("Karten-Raster");
      expect(Object.keys(block?.fields ?? {}).sort()).toEqual(["karten", "spalten"]);
    });

    it("each card carries an image, a title and a text", () => {
      const karten = puckConfig.components.KartenRaster?.fields?.karten;
      if (karten?.type !== "array") throw new Error("karten must be an array field");
      expect(Object.keys(karten.arrayFields).sort()).toEqual(["bild", "text", "titel"]);
      expect(karten.arrayFields.bild?.type).toBe("custom");
    });

    it("summarises a card by its title with a German fallback", () => {
      const karten = puckConfig.components.KartenRaster?.fields?.karten;
      if (karten?.type !== "array" || !karten.getItemSummary) {
        throw new Error("array field with getItemSummary expected");
      }
      expect(karten.getItemSummary({ bild: "", titel: "Beratung", text: "" }, 0)).toBe("Beratung");
      expect(karten.getItemSummary({ bild: "", titel: "", text: "" }, 0)).toBe("Neue Karte");
    });

    it("offers 2, 3 and 4 columns and defaults to 3", () => {
      const spalten = puckConfig.components.KartenRaster?.fields?.spalten;
      if (spalten?.type !== "select") throw new Error("spalten must be a select field");
      expect(spalten.options.map((o) => o.value)).toEqual(["2", "3", "4"]);
      expect(puckConfig.components.KartenRaster?.defaultProps).toEqual({
        karten: [],
        spalten: "3",
      });
    });

    it("shows a placeholder in the editor when empty", () => {
      const render = puckConfig.components.KartenRaster?.render;
      if (!render) throw new Error("KartenRaster render missing");
      const out = renderToStaticMarkup(
        render({ karten: [], spalten: "3", puck: { isEditing: true } } as never) as never,
      );
      expect(out).toContain("Noch keine Karten");
    });

    it("renders the cards through the component", () => {
      const render = puckConfig.components.KartenRaster?.render;
      if (!render) throw new Error("KartenRaster render missing");
      const out = renderToStaticMarkup(
        render({
          karten: [{ bild: "", titel: "Beratung", text: "Wir beraten." }],
          spalten: "4",
          puck: { isEditing: false },
        } as never) as never,
      );
      expect(out).toContain("Beratung");
      expect(out).toContain("lg:grid-cols-4");
    });
  });
  describe("Kennzahlen block", () => {
    it("is registered with the German label and a single array field", () => {
      const block = puckConfig.components.Kennzahlen;
      expect(block?.label).toBe("Kennzahlen");
      expect(Object.keys(block?.fields ?? {})).toEqual(["werte"]);
      expect(block?.defaultProps).toEqual({ werte: [] });
    });

    it("each entry carries a free-text value and a caption", () => {
      const werte = puckConfig.components.Kennzahlen?.fields?.werte;
      if (werte?.type !== "array") throw new Error("werte must be an array field");
      expect(Object.keys(werte.arrayFields).sort()).toEqual(["beschriftung", "wert"]);
      expect(werte.arrayFields.wert?.type).toBe("text");
    });

    it("summarises an entry by its value with a German fallback", () => {
      const werte = puckConfig.components.Kennzahlen?.fields?.werte;
      if (werte?.type !== "array" || !werte.getItemSummary) {
        throw new Error("array field with getItemSummary expected");
      }
      expect(werte.getItemSummary({ wert: "500+", beschriftung: "Mitglieder" }, 0)).toBe("500+");
      expect(werte.getItemSummary({ wert: "", beschriftung: "" }, 0)).toBe("Neue Kennzahl");
    });

    it("shows a placeholder in the editor when empty", () => {
      const render = puckConfig.components.Kennzahlen?.render;
      if (!render) throw new Error("Kennzahlen render missing");
      const out = renderToStaticMarkup(
        render({ werte: [], puck: { isEditing: true } } as never) as never,
      );
      expect(out).toContain("Noch keine Kennzahlen");
    });

    it("renders the figures through the component", () => {
      const render = puckConfig.components.Kennzahlen?.render;
      if (!render) throw new Error("Kennzahlen render missing");
      const out = renderToStaticMarkup(
        render({
          werte: [
            { wert: "500+", beschriftung: "Mitglieder" },
            { wert: "12", beschriftung: "Hochschulgruppen" },
          ],
          puck: { isEditing: false },
        } as never) as never,
      );
      expect(out).toContain("500+");
      expect(out).toContain("Hochschulgruppen");
      expect(out).toContain("grid-cols-2");
    });
  });
  // The content routes stopped rendering a page <h1> of their own (ADR 0038):
  // the title is authored in the document, so the document has to be able to
  // carry one.
  describe("Seitentitel im Dokument", () => {
    it("Ueberschrift offers an h1 level and renders it at page-title size", () => {
      const feld = puckConfig.components.Ueberschrift?.fields?.ebene;
      const werte =
        feld && "options" in feld
          ? (feld.options as Array<{ value: unknown }>).map((o) => o.value)
          : [];
      expect(werte).toEqual(["h1", "h2", "h3"]);

      const render = puckConfig.components.Ueberschrift?.render;
      if (!render) throw new Error("Ueberschrift render missing");
      const out = renderToStaticMarkup(
        render({
          text: "Impressum",
          ebene: "h1",
          ausrichtung: "links",
          puck: {},
        } as never) as never,
      );
      expect(out).toContain("<h1");
      expect(out).toContain("text-3xl");
      expect(out).toContain("Impressum");
    });

    it("Ueberschrift still defaults to h2 for a new block", () => {
      expect(puckConfig.components.Ueberschrift?.defaultProps?.ebene).toBe("h2");
    });

    it("promotes only the first Hero — a second one stays an h2", () => {
      const data = {
        content: [
          { type: "Hero", props: { id: "a", ueberschrift: "Oben" } },
          { type: "Absatz", props: { id: "b", text: "Dazwischen" } },
          { type: "Hero", props: { id: "c", ueberschrift: "Weiter unten" } },
        ],
        root: {},
      } as unknown as Data;
      const ebenen = normalizeContent(data, "schmal")
        .content.filter((item) => item.type === "Hero")
        .map((item) => (item.props as { titelEbene?: string }).titelEbene);
      expect(ebenen).toEqual(["h1", "h2"]);
    });

    it("demotes an Überschrift h1 where the route owns the page title", () => {
      const data = {
        content: [{ type: "Ueberschrift", props: { id: "a", text: "Titel", ebene: "h1" } }],
        root: {},
      } as unknown as Data;
      const ohne = normalizeContent(data, "schmal").content[0]?.props as { ebene?: string };
      expect(ohne.ebene).toBe("h1");
      const mit = normalizeContent(data, "schmal", { eigenerSeitentitel: true }).content[0]
        ?.props as { ebene?: string };
      expect(mit.ebene).toBe("h2");
    });

    it("leaves h2 and h3 Überschriften alone on a page that owns its title", () => {
      const data = {
        content: [
          { type: "Ueberschrift", props: { id: "a", text: "Zwei", ebene: "h2" } },
          { type: "Ueberschrift", props: { id: "b", text: "Drei", ebene: "h3" } },
        ],
        root: {},
      } as unknown as Data;
      const ebenen = normalizeContent(data, "schmal", { eigenerSeitentitel: true }).content.map(
        (item) => (item.props as { ebene?: string }).ebene,
      );
      expect(ebenen).toEqual(["h2", "h3"]);
    });

    it("offers the h1 level everywhere but on a group page", () => {
      const resolve = puckConfig.components.Ueberschrift?.resolveFields;
      if (!resolve) throw new Error("Ueberschrift resolveFields missing");
      const ebenen = async (slug: string) => {
        const felder = await resolve({} as never, { metadata: { slug } } as never);
        const feld = felder.ebene;
        return feld && "options" in feld
          ? (feld.options as Array<{ value: unknown }>).map((o) => o.value)
          : [];
      };
      return Promise.all([ebenen("impressum"), ebenen("gruppen/berlin")]).then(
        ([inhalt, gruppe]) => {
          expect(inhalt).toEqual(["h1", "h2", "h3"]);
          expect(gruppe).toEqual(["h2", "h3"]);
        },
      );
    });

    it("the h1 wraps a long unbroken title instead of overflowing", () => {
      const render = puckConfig.components.Ueberschrift?.render;
      if (!render) throw new Error("Ueberschrift render missing");
      const out = renderToStaticMarkup(
        render({ text: "Titel", ebene: "h1", ausrichtung: "links", puck: {} } as never) as never,
      );
      expect(out).toContain("break-words");
    });

    it("a Hero inserted after load follows the route's slug from metadata", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const aufInhaltsseite = renderToStaticMarkup(
        render({
          ueberschrift: "Frisch eingefügt",
          puck: { isEditing: true, metadata: { slug: "ueber-uns" } },
        } as never) as never,
      );
      expect(aufInhaltsseite).toContain("<h1");
      const aufGruppenseite = renderToStaticMarkup(
        render({
          ueberschrift: "Frisch eingefügt",
          puck: { isEditing: true, metadata: { slug: "gruppen/berlin" } },
        } as never) as never,
      );
      expect(aufGruppenseite).toContain("<h2");
      expect(aufGruppenseite).not.toContain("<h1");
    });

    it("normalizeContent makes a Hero headline the page h1 by default", () => {
      const data = {
        content: [{ type: "Hero", props: { id: "a", ueberschrift: "Wer wir sind" } }],
        root: {},
      } as unknown as Data;
      const hero = normalizeContent(data, "schmal").content[0]?.props as { titelEbene?: string };
      expect(hero.titelEbene).toBe("h1");
    });

    it("normalizeContent demotes the Hero headline where the route owns the h1", () => {
      const data = {
        content: [{ type: "Hero", props: { id: "a", ueberschrift: "Wer wir sind" } }],
        root: {},
      } as unknown as Data;
      const hero = normalizeContent(data, "schmal", { eigenerSeitentitel: true }).content[0]
        ?.props as { titelEbene?: string };
      expect(hero.titelEbene).toBe("h2");
    });

    it("normalizeContent overrides a stale titelEbene stored in the document", () => {
      const data = {
        content: [{ type: "Hero", props: { id: "a", ueberschrift: "Titel", titelEbene: "h1" } }],
        root: {},
      } as unknown as Data;
      const hero = normalizeContent(data, "schmal", { eigenerSeitentitel: true }).content[0]
        ?.props as { titelEbene?: string };
      expect(hero.titelEbene).toBe("h2");
    });

    it("the Hero block passes the level through to the component", () => {
      const render = puckConfig.components.Hero?.render;
      if (!render) throw new Error("Hero render missing");
      const alsH1 = renderToStaticMarkup(
        render({ ueberschrift: "Titel", puck: { isEditing: false } } as never) as never,
      );
      expect(alsH1).toContain("<h1");
      const alsH2 = renderToStaticMarkup(
        render({
          ueberschrift: "Titel",
          titelEbene: "h2",
          puck: { isEditing: false },
        } as never) as never,
      );
      expect(alsH2).toContain("<h2");
      expect(alsH2).not.toContain("<h1");
    });
  });

  describe("Newsletter block", () => {
    const render = (metadata: unknown) => {
      const r = puckConfig.components.Newsletter?.render;
      if (!r) throw new Error("Newsletter render missing");
      return renderToStaticMarkup(
        r({ ueberschrift: "Bleib in Verbindung", puck: { metadata } } as never) as never,
      );
    };

    const chrome = (newsletter: string) => ({
      chrome: { navItems: [], events: false, groups: false, faq: false, newsletter },
      path: "/ueber-uns",
    });

    it("shows an inert stand-in in the editor, never a live form", () => {
      const out = render(chrome("editor"));
      expect(out).toContain("Newsletter-Anmeldung");
      expect(out).not.toContain("data-offer");
    });

    it("hands the visitor state and the page path to the offer", () => {
      const out = render(chrome("guest"));
      expect(out).toContain('data-offer="guest"');
      expect(out).toContain('data-source="puck_block"');
      expect(out).toContain('data-source-path="/ueber-uns"');
    });

    it("passes the block's heading through", () => {
      expect(render(chrome("member"))).toContain('data-heading="Bleib in Verbindung"');
    });

    it("falls back to off when metadata never arrives", () => {
      // A `<Render>` call site that forgot the metadata must show nothing at
      // all — showing the signed-out field to a subscriber would be worse.
      expect(render(undefined)).toContain('data-offer="off"');
      expect(render({})).toContain('data-offer="off"');
    });
  });
  describe("CtaBanner block", () => {
    const render = (props: Record<string, unknown>) => {
      const r = puckConfig.components.CtaBanner?.render;
      if (!r) throw new Error("CtaBanner render missing");
      return renderToStaticMarkup(r(props as never) as never);
    };

    it("renders the accent banner from its default props", () => {
      const defaults = puckConfig.components.CtaBanner?.defaultProps;
      expect(defaults?.flaeche).toBe("akzent");
      const out = render({ ...defaults, puck: { isEditing: false } });
      expect(out).toContain("bg-bdas-red");
      expect(out).toContain("Jetzt Mitglied werden");
    });

    it("renders a document saved without the surface prop", () => {
      const out = render({
        ueberschrift: "Mitmachen",
        text: "",
        buttonLabel: "",
        buttonHref: "",
        puck: { isEditing: false },
      });
      expect(out).toContain("bg-bdas-red");
      expect(out).toContain("Mitmachen");
    });

    it("offers the two token surfaces and nothing else", () => {
      const feld = puckConfig.components.CtaBanner?.fields?.flaeche;
      const werte =
        feld && "options" in feld
          ? (feld.options as Array<{ value: unknown }>).map((o) => o.value)
          : [];
      expect(werte).toEqual(["akzent", "neutral"]);
    });

    it("is a placeholder in the editor and nothing at all on the page when empty", () => {
      const leer = { ueberschrift: "", text: "", buttonLabel: "", buttonHref: "" };
      expect(render({ ...leer, puck: { isEditing: true } })).toContain("data-block-platzhalter");
      expect(render({ ...leer, puck: { isEditing: false } })).toBe("");
    });

    it("a button label without a usable link is not content", () => {
      const out = render({
        ueberschrift: "",
        text: "",
        buttonLabel: "Mitglied werden",
        buttonHref: "javascript:alert(1)",
        puck: { isEditing: false },
      });
      expect(out).toBe("");
    });
  });
});
