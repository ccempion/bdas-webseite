/**
 * @vitest-environment happy-dom
 *
 * Covers the group-change warnings (issue #152): they must reflect the real
 * transfer process in modules/members/src/services/group-change.ts — a
 * transfer needs the destination board's approval and only then revokes the
 * old group's rights, while leaving (picking "— keine Gruppe —") revokes them
 * immediately with no approval step and cannot be undone. Two different
 * warnings, shown only when the current selection actually implies that
 * consequence, and the irreversible exit additionally gates the submit
 * button behind an explicit confirmation checkbox.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act, StrictMode } from "react";
import type * as ReactDOM from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProfileForm, type ProfileFormProps } from "./ProfileForm";

// The installed react-dom is the stable channel, which doesn't ship
// useFormStatus (Next bundles a canary build for that at runtime). Stub it so
// SubmitButton — which only reads `pending` from it, irrelevant to what this
// file tests — can mount outside Next. vitest hoists vi.mock calls above the
// imports above regardless of where they appear in the file.
vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDOM>();
  return { ...actual, useFormStatus: () => ({ pending: false }) };
});

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

function render(ui: React.ReactElement) {
  act(() => root.render(<StrictMode>{ui}</StrictMode>));
}

const groups = [
  { id: "g1", slug: "berlin", name: "Berlin", city: "Berlin" },
  { id: "g2", slug: "muenchen", name: "München", city: "München" },
];

function baseProps(overrides: Partial<ProfileFormProps> = {}): ProfileFormProps {
  return {
    initial: { firstName: "Ada", lastName: "Lovelace", primaryGroupId: "g1" },
    groups,
    isNew: false,
    openChangeGroupName: null,
    state: {},
    action: () => {},
    ...overrides,
  };
}

const trigger = () => container.querySelector("button[aria-haspopup]") as HTMLButtonElement;
const items = () => Array.from(container.querySelectorAll('[role="option"]'));
const submitButton = () => container.querySelector('button[type="submit"]') as HTMLButtonElement;
const exitCheckbox = () => container.querySelector<HTMLInputElement>('input[type="checkbox"]');

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function pickByLabel(label: string) {
  click(trigger());
  const option = items().find((li) => li.textContent?.includes(label));
  if (!option) throw new Error(`no option labeled "${label}"`);
  click(option);
}

describe("ProfileForm group-change warnings", () => {
  it("shows no warning while the current group stays selected", () => {
    render(<ProfileForm {...baseProps()} />);
    expect(container.textContent).not.toContain("Achtung");
  });

  it("warns about the approval process when a different group is picked, naming it", () => {
    render(<ProfileForm {...baseProps()} />);
    pickByLabel("München");
    expect(container.textContent).toContain("Der Wechsel zu München");
    expect(container.textContent).toContain("dortigen Vorstand freigegeben werden");
    expect(container.textContent).not.toContain("Der Austritt");
    // A transfer is reversible while pending — no confirmation gate.
    expect(submitButton().disabled).toBe(false);
  });

  it("clears the transfer warning when the current group is re-selected", () => {
    render(<ProfileForm {...baseProps()} />);
    pickByLabel("München");
    expect(container.textContent).toContain("Achtung");
    pickByLabel("Berlin");
    expect(container.textContent).not.toContain("Achtung");
  });

  it("offers a leave option and warns about the immediate, unapprovable loss", () => {
    render(<ProfileForm {...baseProps()} />);
    pickByLabel("keine Gruppe");
    expect(container.textContent).toContain("Der Austritt");
    expect(container.textContent).toContain("sofort, ohne Freigabe");
    expect(container.textContent).toContain("nicht rückgängig machen");
    expect(container.textContent).not.toContain("Der Wechsel zu");
  });

  it("blocks submit on exit until the confirmation checkbox is checked", () => {
    render(<ProfileForm {...baseProps()} />);
    pickByLabel("keine Gruppe");
    expect(submitButton().disabled).toBe(true);

    click(exitCheckbox() as HTMLInputElement);
    expect(submitButton().disabled).toBe(false);
  });

  it("resets the confirmation when the selection changes away from exit", () => {
    render(<ProfileForm {...baseProps()} />);
    pickByLabel("keine Gruppe");
    click(exitCheckbox() as HTMLInputElement);
    expect(submitButton().disabled).toBe(false);

    pickByLabel("Berlin"); // back to the current group: no warning, no gate
    expect(submitButton().disabled).toBe(false);

    pickByLabel("keine Gruppe"); // exit again: confirmation must not have carried over
    expect(submitButton().disabled).toBe(true);
  });

  it("offers no leave option and no warning for a brand-new profile's first pick", () => {
    render(
      <ProfileForm
        {...baseProps({
          isNew: true,
          initial: { firstName: "", lastName: "", primaryGroupId: null },
        })}
      />,
    );
    click(trigger());
    expect(items().some((li) => li.textContent?.includes("keine Gruppe"))).toBe(false);
    click(trigger()); // close before pickByLabel opens it again
    pickByLabel("Berlin");
    expect(container.textContent).not.toContain("Achtung");
    expect(submitButton().disabled).toBe(false);
  });
});
