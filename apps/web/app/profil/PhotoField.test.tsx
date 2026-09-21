/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_upload/upload-image", () => ({ uploadImage: vi.fn() }));

import { PhotoField } from "./PhotoField";

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

describe("PhotoField", () => {
  it("zeigt einen runden Platzhalter zum Auswählen", () => {
    act(() => root.render(<PhotoField storageKey={null} onChange={vi.fn()} />));

    const button = [...container.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Foto auswählen",
    );
    expect(button).toBeTruthy();
    expect(button?.className).toContain("rounded-full");
  });
});
