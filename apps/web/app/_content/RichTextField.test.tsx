/**
 * @vitest-environment happy-dom
 *
 * Drives the Fließtext editor as a browser would. What the node-environment
 * tests cannot reach is the toolbar wiring: that the image controls appear
 * only when an image is selected, and that they write the attributes the
 * renderer reads (`rich-text.tsx`'s `case "image"`).
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { RichTextField } from "./RichTextField";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(value: unknown, onChange: (doc: unknown) => void = () => {}) {
  await act(async () => {
    root.render(<RichTextField value={value} onChange={onChange} />);
  });
}

// A top-level image, which is the shape an image on its own line takes. The
// editor's initial selection lands on it, which is what reveals the image
// controls — a synthetic click does not produce a node selection under
// happy-dom, and driving one would be testing ProseMirror, not this toolbar.
const docMitBild = {
  type: "doc",
  content: [{ type: "image", attrs: { src: "https://cdn.test/a.jpg", alt: "A", breite: 50 } }],
};

function button(name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) as
    | HTMLButtonElement
    | undefined;
}

describe("RichTextField", () => {
  it("offers a Bild button in the toolbar", async () => {
    await mount(undefined);
    expect(button("Bild")).toBeDefined();
  });

  it("hides the image controls while no image is selected", async () => {
    await mount(undefined);
    expect(container.textContent).not.toContain("Bildbreite");
    expect(container.textContent).not.toContain("Textumfluss");
  });

  it("shows width, wrap and alt controls once an image is selected", async () => {
    await mount(docMitBild);
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.textContent).toContain("Bildbreite");
    expect(container.textContent).toContain("Textumfluss");
    expect(
      container.querySelector('input[aria-label="Alt-Text (Barrierefreiheit)"]'),
    ).not.toBeNull();
    for (const stufe of ["25 %", "50 %", "75 %", "100 %"]) {
      expect(button(stufe), `Stufe ${stufe} fehlt`).toBeDefined();
    }
    for (const wahl of ["Kein Umfluss", "Text rechts", "Text links"]) {
      expect(button(wahl), `Umfluss ${wahl} fehlt`).toBeDefined();
    }
  });

  it("renders the existing formatting toolbar unchanged", async () => {
    await mount(undefined);
    for (const name of ["Fett", "Kursiv", "Liste", "Nummeriert", "Link"]) {
      expect(button(name), `${name} fehlt`).toBeDefined();
    }
  });
});
