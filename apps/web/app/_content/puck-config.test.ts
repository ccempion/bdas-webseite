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
});
