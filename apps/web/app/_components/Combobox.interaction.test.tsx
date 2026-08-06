/**
 * @vitest-environment happy-dom
 *
 * Drives the design-system Combobox as a browser would. The filtering and
 * navigation rules are unit-tested next to the component
 * (core/design-system/src/components/combobox-filter.test.ts); what this covers
 * is the wiring those rules hang off — that the search field appears only past
 * the threshold, that a pick reaches `onChange`, and that the value reaches a
 * surrounding form.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Combobox } from "@bdas/design-system";

let container: HTMLDivElement;
let root: Root;

/** Tells React these renders are wrapped in act(), which silences the warning
 *  and makes state flush synchronously. */
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

function render(ui: React.ReactElement) {
  act(() => root.render(<StrictMode>{ui}</StrictMode>));
}

function options(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    value: `v${i}`,
    label: `Hochschule ${i}`,
  }));
}

const trigger = () => container.querySelector("button") as HTMLButtonElement;
const search = () => container.querySelector<HTMLInputElement>('input[type="text"]');
const items = () => Array.from(container.querySelectorAll('[role="option"]'));
const labels = () => items().map((li) => li.textContent);

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as (
      v: string,
    ) => void;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

function Harness({ count, name }: { count: number; name?: string }) {
  const [value, setValue] = useState("");
  return (
    <form>
      <Combobox
        label="Hochschule"
        options={options(count)}
        value={value}
        onChange={setValue}
        {...(name ? { name } : {})}
      />
    </form>
  );
}

describe("Combobox", () => {
  it("shows the placeholder until something is picked", () => {
    render(<Harness count={5} />);
    expect(trigger().textContent).toContain("— bitte wählen —");
  });

  it("opens on click and lists every option", () => {
    render(<Harness count={5} />);
    expect(items()).toHaveLength(0);
    click(trigger());
    expect(items()).toHaveLength(5);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
  });

  it("leaves out the search field for a list that is still scannable", () => {
    render(<Harness count={30} />);
    click(trigger());
    expect(search()).toBeNull();
  });

  it("grows a search field once the list passes the threshold", () => {
    render(<Harness count={31} />);
    click(trigger());
    expect(search()).not.toBeNull();
  });

  it("narrows the list as you type", () => {
    render(<Harness count={40} />);
    click(trigger());
    type(search() as HTMLInputElement, "Hochschule 12");
    expect(labels()).toEqual(["Hochschule 12"]);
  });

  it("says so when nothing matches", () => {
    render(<Harness count={40} />);
    click(trigger());
    type(search() as HTMLInputElement, "Nicht vorhanden");
    expect(items()).toHaveLength(0);
    expect(container.textContent).toContain("Kein Treffer");
  });

  it("picks an option, closes, and shows it on the trigger", () => {
    render(<Harness count={5} />);
    click(trigger());
    click(items()[2] as Element);
    expect(items()).toHaveLength(0);
    expect(trigger().textContent).toContain("Hochschule 2");
  });

  it("submits the picked value through a hidden input", () => {
    render(<Harness count={5} name="uni" />);
    click(trigger());
    click(items()[3] as Element);
    const hidden = container.querySelector<HTMLInputElement>('input[name="uni"]');
    expect(hidden?.value).toBe("v3");
  });

  it("carries no hidden input when the form collects its own values", () => {
    render(<Harness count={5} />);
    expect(container.querySelector('input[type="hidden"]')).toBeNull();
  });

  it("opens and picks by keyboard alone", () => {
    render(<Harness count={5} />);
    // Opening highlights the first option, so one more Down lands on the second.
    press(trigger(), "ArrowDown");
    expect(items()).toHaveLength(5);
    press(trigger(), "ArrowDown");
    press(trigger(), "Enter");
    expect(trigger().textContent).toContain("Hochschule 1");
  });

  it("wraps the highlight around both ends of the list", () => {
    render(<Harness count={5} />);
    press(trigger(), "ArrowUp"); // opens, highlighting the first option
    press(trigger(), "ArrowUp"); // wraps to the last
    press(trigger(), "Enter");
    expect(trigger().textContent).toContain("Hochschule 4");
  });

  it("closes on Escape without picking anything", () => {
    render(<Harness count={5} />);
    click(trigger());
    press(trigger(), "Escape");
    expect(items()).toHaveLength(0);
    expect(trigger().textContent).toContain("— bitte wählen —");
  });

  it("marks the picked option as selected for screen readers", () => {
    render(<Harness count={5} />);
    click(trigger());
    click(items()[1] as Element);
    click(trigger());
    const selected = items().filter((li) => li.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toBe("Hochschule 1");
  });

  it("exposes each option's value the way <option value> used to", () => {
    render(<Harness count={5} />);
    click(trigger());
    expect(items().map((li) => li.getAttribute("data-value"))).toEqual([
      "v0",
      "v1",
      "v2",
      "v3",
      "v4",
    ]);
  });
});
