/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_upload/upload-image", () => ({ uploadImage: vi.fn() }));

let cropDone: ((file: File) => void) | null = null;
vi.mock("../_profile/CropDialog", () => ({
  CropDialog: (props: { onDone: (file: File) => void }) => {
    cropDone = props.onDone;
    return null;
  },
}));

import { PhotoField } from "./PhotoField";
import { uploadImage } from "../_upload/upload-image";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  cropDone = null;
  vi.mocked(uploadImage).mockReset();
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

  it("zeigt Foto ändern/Entfernen statt Hinweistext, wenn schon ein Foto gespeichert ist", () => {
    act(() => root.render(<PhotoField storageKey="some-storage-key" onChange={vi.fn()} />));

    const buttons = [...container.querySelectorAll("button")];
    const change = buttons.find((b) => b.textContent === "Foto ändern");
    const remove = buttons.find((b) => b.textContent === "Entfernen");
    expect(change).toBeTruthy();
    expect(remove).toBeTruthy();
    expect(container.textContent).not.toContain("JPG oder PNG, bis");
  });

  it("deaktiviert den Kreis, Ändern und Entfernen während eines laufenden Uploads", async () => {
    let resolveUpload: (value: { ok: { uploadUrl: string; storageKey: string } }) => void =
      () => {};
    vi.mocked(uploadImage).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveUpload = resolve;
        }),
    );

    await act(async () => {
      root.render(<PhotoField storageKey={null} onChange={vi.fn()} />);
    });

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
    Object.defineProperty(input, "files", { value: [file] });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(cropDone).toBeTruthy();
    await act(async () => {
      cropDone?.(file);
    });

    const buttons = [...container.querySelectorAll("button")];
    const round = buttons.find((b) => b.getAttribute("aria-label") === "Foto auswählen");
    const change = buttons.find((b) => b.textContent === "Foto ändern");
    const remove = buttons.find((b) => b.textContent === "Entfernen");
    expect(round?.disabled).toBe(true);
    expect(change?.disabled).toBe(true);
    expect(remove?.disabled).toBe(true);

    await act(async () => {
      resolveUpload({ ok: { uploadUrl: "https://cdn.test/put", storageKey: "k" } });
      await Promise.resolve();
    });
  });
});
