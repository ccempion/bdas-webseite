/**
 * @vitest-environment happy-dom
 *
 * The board's list is filtered in the browser (no `searchParams`), so what
 * needs covering is exactly that: which rows survive a chip and a search term.
 * Driven as a browser would, because the filter state only exists once the
 * component is mounted.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SubscriberRow } from "@bdas/newsletter";

import { SubscriberTable } from "./SubscriberTable";

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const row = (over: Partial<SubscriberRow> & { id: string }): SubscriberRow => ({
  email: `${over.id}@example.org`,
  status: "subscribed",
  source: "footer",
  sourcePath: "/",
  groupId: null,
  userId: null,
  createdAt: new Date("2026-06-01T10:00:00.000Z"),
  confirmedAt: null,
  ...over,
});

const ROWS: SubscriberRow[] = [
  row({ id: "anna", status: "subscribed", userId: "u1" }),
  row({ id: "bernd", status: "pending" }),
  row({ id: "Carla", email: "CARLA@example.org", status: "unsubscribed" }),
  row({ id: "dora", status: "declined" }),
];

function render(rows: SubscriberRow[] = ROWS) {
  act(() =>
    root.render(
      <StrictMode>
        <SubscriberTable rows={rows} groupNames={{ u1: "HG Aachen" }} />
      </StrictMode>,
    ),
  );
}

const bodyRows = () => Array.from(container.querySelectorAll("tbody tr"));
const emails = () =>
  bodyRows()
    .map((tr) => tr.querySelector("td")?.textContent ?? "")
    .filter((t) => t.includes("@"));

function chip(label: string): HTMLButtonElement {
  const found = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!found) throw new Error(`no chip labelled ${label}`);
  return found as HTMLButtonElement;
}

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(value: string) {
  const input = container.querySelector("input") as HTMLInputElement;
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as (
      v: string,
    ) => void;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SubscriberTable", () => {
  it("shows every row until a filter is chosen", () => {
    render();
    expect(emails()).toHaveLength(4);
  });

  it("narrows to one status per chip, and 'Alle' brings the rest back", () => {
    render();
    for (const [label, expected] of [
      ["Abonniert", "anna@example.org"],
      ["Ausstehend", "bernd@example.org"],
      ["Abgemeldet", "CARLA@example.org"],
      ["Abgelehnt", "dora@example.org"],
    ] as const) {
      click(chip(label));
      expect(emails()).toEqual([expected]);
    }
    click(chip("Alle"));
    expect(emails()).toHaveLength(4);
  });

  it("searches substrings of the address, ignoring case on both sides", () => {
    render();
    type("carla");
    expect(emails()).toEqual(["CARLA@example.org"]);
    type("EXAMPLE");
    expect(emails()).toHaveLength(4);
  });

  it("combines the chip and the search rather than replacing one with the other", () => {
    render();
    click(chip("Abonniert"));
    type("bernd");
    expect(emails()).toEqual([]);
  });

  it("shows the account's current group, and a dash for a row without one", () => {
    render();
    const cells = (email: string) =>
      bodyRows()
        .find((tr) => tr.textContent?.includes(email))
        ?.querySelectorAll("td");
    expect(cells("anna@example.org")?.[3]?.textContent).toBe("HG Aachen");
    expect(cells("bernd@example.org")?.[3]?.textContent).toBe("—");
  });

  it("offers the export as a plain link to the download route", () => {
    render();
    const link = container.querySelector("a[href]") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/federal/newsletter/export.csv");
  });

  it("says so when nothing matches instead of showing an empty frame", () => {
    render([]);
    expect(container.textContent).toContain("Keine Einträge");
  });
});
