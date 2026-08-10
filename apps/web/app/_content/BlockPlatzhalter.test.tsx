import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { BlockPlatzhalter } from "./BlockPlatzhalter";

const html = (titel: string, hinweis: string) =>
  renderToStaticMarkup(<BlockPlatzhalter titel={titel} hinweis={hinweis} />);

describe("BlockPlatzhalter", () => {
  it("names the block and explains what is missing", () => {
    const out = html("Bild", "Noch kein Bild ausgewählt.");
    expect(out).toContain("Bild");
    expect(out).toContain("Noch kein Bild ausgewählt.");
  });

  it("carries a stable hook for tests and E2E", () => {
    expect(html("Button", "x")).toContain("data-block-platzhalter");
  });

  it("uses the repo's dashed empty-state idiom, not ad-hoc styling", () => {
    const out = html("Bild", "x");
    expect(out).toContain("border-dashed");
    expect(out).toContain("border-bdas-soft");
    expect(out).toContain("rounded-bdas");
  });
});
