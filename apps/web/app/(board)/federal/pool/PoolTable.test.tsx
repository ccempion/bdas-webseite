/**
 * @vitest-environment happy-dom
 *
 * The "Ohne Profil" filter and the delete button of "Ohne Gruppe". Driven as a
 * browser would, because the filter state only exists once mounted.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AcceptResult, DeleteApplicantResult } from "./actions";
import { PoolTable, type PoolRow } from "./PoolTable";

let container: HTMLDivElement;
let root: Root;
let onDelete = vi.fn(async (_userId: string): Promise<DeleteApplicantResult> => ({ ok: true }));
let onAccept = vi.fn(async (_userId: string): Promise<AcceptResult> => ({ ok: true }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  onDelete = vi.fn(async (_userId: string): Promise<DeleteApplicantResult> => ({ ok: true }));
  onAccept = vi.fn(async (_userId: string): Promise<AcceptResult> => ({ ok: true }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

const row = (over: Partial<PoolRow> & { memberId: string; name: string }): PoolRow => ({
  userId: `usr_${over.memberId}`,
  uni: "—",
  days: 3,
  kind: "Bewerber:in",
  hasProfile: false,
  deletable: false,
  acceptable: false,
  ...over,
});

const ROWS: PoolRow[] = [
  row({
    memberId: "m1",
    name: "A. Profil",
    uni: "RWTH Aachen",
    hasProfile: true,
    acceptable: true,
  }),
  row({ memberId: "m2", name: "B. Bot", deletable: true }),
  row({ memberId: "m3", name: "C. Mitglied", kind: "Mitglied ohne Gruppe" }),
];

function render(rows: PoolRow[] = ROWS) {
  act(() =>
    root.render(
      <StrictMode>
        <PoolTable rows={rows} onDelete={onDelete} onAccept={onAccept} />
      </StrictMode>,
    ),
  );
}

const names = () =>
  Array.from(container.querySelectorAll("tbody tr"))
    .map((tr) => tr.querySelector("td")?.textContent ?? "")
    .filter((t) => t.includes("."));

function button(label: string, scope: ParentNode = container): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found as HTMLButtonElement;
}

const rowOf = (name: string) =>
  Array.from(container.querySelectorAll("tbody tr")).find((tr) =>
    tr.textContent?.includes(name),
  ) as HTMLTableRowElement;

async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

const status = () => container.querySelector('[role="status"]')?.textContent;

describe("PoolTable", () => {
  it("shows everyone until a filter is chosen", () => {
    render();
    expect(names()).toEqual(["A. Profil", "B. Bot", "C. Mitglied"]);
  });

  it("'Ohne Profil' hides whoever filled in the profile, 'Alle' brings them back", async () => {
    render();
    await click(button("Ohne Profil"));
    expect(names()).toEqual(["B. Bot", "C. Mitglied"]);
    await click(button("Alle"));
    expect(names()).toHaveLength(3);
  });

  it("offers deletion only on the rows the page marked deletable", () => {
    render();
    const labels = (name: string) =>
      Array.from(rowOf(name).querySelectorAll("button")).map((b) => b.textContent);
    expect(labels("B. Bot")).toEqual(["Löschen"]);
    expect(labels("A. Profil")).not.toContain("Löschen");
    expect(labels("C. Mitglied")).toEqual([]);
  });

  it("bietet die Alumnus-Aufnahme nur auf den dafür markierten Zeilen an", () => {
    render();
    expect(() => button("Ohne Gruppe aufnehmen", rowOf("A. Profil"))).not.toThrow();
    expect(() => button("Ohne Gruppe aufnehmen", rowOf("B. Bot"))).toThrow();
    expect(() => button("Ohne Gruppe aufnehmen", rowOf("C. Mitglied"))).toThrow();
  });

  it("nimmt nach Bestätigung per Account-ID auf und meldet es", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render();
    await click(button("Ohne Gruppe aufnehmen", rowOf("A. Profil")));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith("usr_m1");
    expect(status()).toBe("A. Profil ist aufgenommen.");
  });

  it("nimmt ohne Bestätigung niemanden auf", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render();
    await click(button("Ohne Gruppe aufnehmen", rowOf("A. Profil")));
    expect(onAccept).not.toHaveBeenCalled();
  });

  it("zeigt die Ablehnung des Servers statt einer Erfolgsmeldung", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    onAccept.mockResolvedValueOnce({ ok: false, error: "Keine Berechtigung." });
    render();
    await click(button("Ohne Gruppe aufnehmen", rowOf("A. Profil")));
    expect(status()).toBe("Keine Berechtigung.");
  });

  it("deletes by account id once confirmed, and says so", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render();
    await click(button("Löschen", rowOf("B. Bot")));
    expect(onDelete).toHaveBeenCalledWith("usr_m2");
    expect(status()).toBe("Konto von B. Bot gelöscht.");
  });

  it("does nothing when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render();
    await click(button("Löschen", rowOf("B. Bot")));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("shows the server's refusal instead of a success message", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    onDelete.mockResolvedValueOnce({ ok: false, error: "Keine Berechtigung." });
    render();
    await click(button("Löschen", rowOf("B. Bot")));
    expect(status()).toBe("Keine Berechtigung.");
  });

  it("says who is missing when a filter leaves nobody", async () => {
    render([ROWS[0]!]);
    await click(button("Ohne Profil"));
    expect(container.textContent).toContain("Niemand ohne Profil.");
  });
});
