import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Kennzahlen, kennzahlenGrid } from "./Kennzahlen";

describe("kennzahlenGrid", () => {
  it("gives a single figure the full width", () => {
    expect(kennzahlenGrid(1)).not.toContain("grid-cols-2");
  });

  it("grows the column count with the number of figures", () => {
    expect(kennzahlenGrid(2)).toContain("grid-cols-2");
    expect(kennzahlenGrid(3)).toContain("sm:grid-cols-3");
    expect(kennzahlenGrid(4)).toContain("sm:grid-cols-4");
  });

  it("caps at four columns and wraps the rest", () => {
    expect(kennzahlenGrid(7)).toBe(kennzahlenGrid(4));
  });

  it("survives zero, negative and non-finite counts", () => {
    expect(kennzahlenGrid(0)).toBe(kennzahlenGrid(1));
    expect(kennzahlenGrid(-3)).toBe(kennzahlenGrid(1));
    expect(kennzahlenGrid(Number.NaN)).toBe(kennzahlenGrid(1));
  });
});

describe("Kennzahlen", () => {
  it("renders each figure with its caption", () => {
    const out = renderToStaticMarkup(
      <Kennzahlen
        werte={[
          { wert: "500+", beschriftung: "Mitglieder" },
          { wert: "seit 1994", beschriftung: "aktiv" },
        ]}
      />,
    );
    expect(out).toContain("500+");
    expect(out).toContain("Mitglieder");
    expect(out).toContain("seit 1994");
    expect(out).toContain("grid-cols-2");
  });

  it("renders the figure in ink, never in the brand accent", () => {
    const out = renderToStaticMarkup(
      <Kennzahlen werte={[{ wert: "500+", beschriftung: "Mitglieder" }]} />,
    );
    expect(out).toContain("text-bdas-ink");
    expect(out).not.toContain("text-bdas-red");
  });

  it("survives a document saved without the array", () => {
    const out = renderToStaticMarkup(<Kennzahlen werte={undefined as never} />);
    expect(out).toContain("grid");
    expect(out).not.toContain("<p");
  });
});
