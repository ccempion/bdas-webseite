// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BegriffText } from "./BegriffText";
import { GlossarProvider } from "./GlossarProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const WOERTER = { Bundesvorstand: "bundesvorstand", Vorstand: "vorstand", Alumni: "alumni" };

function mount(node: React.ReactNode) {
  act(() => root.render(<GlossarProvider enabled>{node}</GlossarProvider>));
}
const labels = () =>
  [...container.querySelectorAll("button")].map((b) => b.getAttribute("aria-label"));

describe("BegriffText", () => {
  it("keeps the text intact and marks each listed word once", () => {
    mount(
      <BegriffText
        text="Der Vorstand fragt den Bundesvorstand, dann wieder der Vorstand."
        begriffe={WOERTER}
      />,
    );
    expect(container.textContent?.replace(/\?/g, "")).toBe(
      "Der Vorstand fragt den Bundesvorstand, dann wieder der Vorstand.",
    );
    expect(labels()).toEqual(["Was bedeutet „Vorstand“?", "Was bedeutet „Bundesvorstand“?"]);
  });

  it("only matches whole words", () => {
    mount(<BegriffText text="Vorstandsleute und Alumnitreffen" begriffe={WOERTER} />);
    expect(labels()).toEqual([]);
  });

  it("marks a term once across texts sharing `seen`", () => {
    const seen = new Set<string>();
    mount(
      <>
        <BegriffText text="Frag den Vorstand." begriffe={WOERTER} seen={seen} />
        <BegriffText text="Der Vorstand entscheidet." begriffe={WOERTER} seen={seen} />
      </>,
    );
    expect(labels()).toEqual(["Was bedeutet „Vorstand“?"]);
  });
});
