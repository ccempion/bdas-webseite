// @vitest-environment jsdom
//
// The package's other tests are plain Node (see badge-count.test.ts,
// combobox-filter.test.ts) — the root vitest.config.ts default environment
// is "node", so a DOM-rendering test needs this per-file pragma.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Dialog } from "./Dialog";

// jsdom has implemented HTMLDialogElement.showModal()/close() since v24, but
// stub defensively in case the installed jsdom version doesn't support it —
// keeps this test from being a false negative on an unrelated jsdom bump.
HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
  this.open = true;
};
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
  this.open = false;
};

afterEach(cleanup);

describe("Dialog", () => {
  it("renders title and children when open, nothing when closed", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="Frage einreichen">
        <p>Inhalt</p>
      </Dialog>,
    );
    expect(screen.getByText("Frage einreichen")).toBeTruthy();
    rerender(
      <Dialog open={false} onClose={() => {}} title="Frage einreichen">
        <p>Inhalt</p>
      </Dialog>,
    );
    expect(screen.queryByText("Inhalt")).toBeNull();
  });
  it("close button fires onClose", () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="T">
        <p>x</p>
      </Dialog>,
    );
    screen.getByLabelText("Schließen").click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
