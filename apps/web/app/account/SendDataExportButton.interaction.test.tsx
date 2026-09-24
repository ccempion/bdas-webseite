/**
 * @vitest-environment happy-dom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendDataExportAction = vi.fn();
vi.mock("./data-export-actions", () => ({
  sendDataExportAction: () => sendDataExportAction(),
}));

import { SendDataExportButton } from "./SendDataExportButton";

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  sendDataExportAction.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<SendDataExportButton />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function clickButton() {
  const button = container.querySelector("button") as HTMLButtonElement;
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("SendDataExportButton", () => {
  it("shows the confirmation when the action succeeds", async () => {
    sendDataExportAction.mockResolvedValue({ ok: true });
    await clickButton();
    expect(container.textContent).toContain("Die Auskunft ist unterwegs — schau in dein Postfach.");
  });

  it("shows the returned error when the action fails", async () => {
    sendDataExportAction.mockResolvedValue({ error: "Anmeldung erforderlich." });
    await clickButton();
    expect(container.textContent).toContain("Anmeldung erforderlich.");
    expect(container.textContent).not.toContain("unterwegs");
  });
});
