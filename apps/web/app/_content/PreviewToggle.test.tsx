import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it, vi } from "vitest";

const dispatch = vi.fn();
let previewMode: "interactive" | "edit" = "edit";

vi.mock("@puckeditor/core", () => ({
  usePuck: () => ({ appState: { ui: { previewMode } }, dispatch }),
}));

import { PreviewToggle } from "./PreviewToggle";

describe("PreviewToggle", () => {
  it("labels itself 'Vorschau' while editing", () => {
    previewMode = "edit";
    const out = renderToStaticMarkup(<PreviewToggle />);
    expect(out).toContain("Vorschau");
  });

  it("labels itself 'Bearbeiten' while in preview", () => {
    previewMode = "interactive";
    const out = renderToStaticMarkup(<PreviewToggle />);
    expect(out).toContain("Bearbeiten");
  });
});
