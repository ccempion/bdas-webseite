import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { KartenRaster, type Karte, kartenGrid } from "./KartenRaster";

const karte = (titel: string): Karte => ({ bild: "", titel, text: "Beschreibung." });

describe("kartenGrid", () => {
  it("is one column below sm on every preset", () => {
    for (const spalten of ["2", "3", "4"] as const) {
      // No *unprefixed* grid-cols class — every column class must carry a
      // breakpoint prefix. A plain `not.toContain("grid-cols-2")` would be
      // wrong: `sm:grid-cols-2` contains it and is exactly what we want.
      expect(kartenGrid(spalten)).not.toMatch(/(^|\s)grid-cols-/);
      expect(kartenGrid(spalten)).toContain("sm:grid-cols-2");
    }
  });

  it("maps each preset to its own widest breakpoint", () => {
    expect(kartenGrid("2")).not.toContain("lg:grid-cols");
    expect(kartenGrid("3")).toContain("lg:grid-cols-3");
    expect(kartenGrid("4")).toContain("lg:grid-cols-4");
  });

  it("falls back to three columns for a missing or unknown value", () => {
    expect(kartenGrid(undefined)).toBe(kartenGrid("3"));
    expect(kartenGrid("6" as never)).toBe(kartenGrid("3"));
  });
});

describe("KartenRaster", () => {
  it("renders one design-system card per entry", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[karte("Beratung"), karte("Vernetzung")]} spalten="3" />,
    );
    expect(out).toContain("Beratung");
    expect(out).toContain("Vernetzung");
    expect((out.match(/rounded-bdas /g) ?? []).length).toBe(2);
  });

  it("renders an image only when the entry has one, and marks it decorative", () => {
    const mit = renderToStaticMarkup(
      <KartenRaster
        karten={[{ bild: "https://cdn.example/a.webp", titel: "Beratung", text: "" }]}
        spalten="2"
      />,
    );
    expect(mit).toContain('src="https://cdn.example/a.webp"');
    expect(mit).toContain('alt=""');
    expect(mit).toContain("aria-hidden");
    expect(mit).toContain("aspect-video");

    const ohne = renderToStaticMarkup(<KartenRaster karten={[karte("Beratung")]} spalten="2" />);
    expect(ohne).not.toContain("<img");
  });

  it("omits an empty title or text rather than rendering an empty element", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[{ bild: "", titel: "Nur Titel", text: "" }]} spalten="2" />,
    );
    expect(out).toContain("Nur Titel");
    expect((out.match(/<p/g) ?? []).length).toBe(1);
  });

  it("keeps line breaks in the card text", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={[{ bild: "", titel: "T", text: "Eins\nZwei" }]} spalten="2" />,
    );
    expect(out).toContain("whitespace-pre-line");
  });

  it("survives a document saved without the array", () => {
    const out = renderToStaticMarkup(
      <KartenRaster karten={undefined as never} spalten={undefined as never} />,
    );
    expect(out).toContain("sm:grid-cols-2");
    expect(out).not.toContain("<img");
  });
});
