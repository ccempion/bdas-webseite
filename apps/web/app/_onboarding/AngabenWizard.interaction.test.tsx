/**
 * @vitest-environment happy-dom
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act } from "react";
import type * as ReactDOM from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDOM>();
  return {
    ...actual,
    useFormStatus: () => ({ pending: false }),
    useFormState: (_fn: unknown, init: unknown) => [init, () => {}],
  };
});
const saveDetailsMock = vi.fn();
vi.mock("./details-actions", () => ({
  saveDetailsAction: (...a: unknown[]) => saveDetailsMock(...a),
  submitApplicationAction: vi.fn(),
}));
vi.mock("../profil/PhotoField", () => ({ PhotoField: () => null }));

import { AngabenWizard } from "./AngabenWizard";
import { EMPTY_DETAILS } from "./details";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  saveDetailsMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const heading = () => container.querySelector("h2")?.textContent ?? "";
function click(text: string) {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!el) throw new Error(`no button "${text}"`);
  act(() => el.click());
}
function typeInto(selector: string, value: string) {
  const el = container.querySelector<HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (!el) throw new Error(`no ${selector}`);
  const proto = Object.getPrototypeOf(el) as object;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
    el.dispatchEvent(
      new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }),
    );
  });
}

describe("AngabenWizard", () => {
  it("greets by name and blocks an empty screen", () => {
    act(() =>
      root.render(
        <AngabenWizard
          userType="foerderer"
          firstName="Lea"
          initial={EMPTY_DETAILS}
          notice={null}
        />,
      ),
    );
    expect(container.textContent).toContain("Willkommen zurück, Lea — fast geschafft.");
    expect(heading()).toBe("Was interessiert dich an BDAS?");
    expect(container.textContent).toContain("Der Bundesvorstand liest mit.");

    click("Weiter");
    expect(container.textContent).toContain("Bitte erzähl uns kurz");
    expect(saveDetailsMock).not.toHaveBeenCalled();
  });

  it("walks a supporter to the summary, saves drafts, and lets them change a block", () => {
    act(() =>
      root.render(
        <AngabenWizard
          userType="foerderer"
          firstName="Lea"
          initial={EMPTY_DETAILS}
          notice={null}
        />,
      ),
    );
    typeInto("#interesse", "Kulturarbeit");
    click("Weiter");
    expect(saveDetailsMock).toHaveBeenCalledWith(
      expect.objectContaining({ interesse: "Kulturarbeit" }),
    );

    expect(heading()).toBe("Wie hast du uns gefunden?");
    typeInto("#gefundenDurch", "webseite");
    click("Weiter");

    expect(heading()).toBe("Passt alles?");
    expect(container.textContent).toContain("Kulturarbeit");
    expect(container.textContent).toContain("Webseite");

    click("Ändern");
    expect(heading()).toBe("Was interessiert dich an BDAS?");
    expect(container.querySelector<HTMLTextAreaElement>("#interesse")?.value).toBe("Kulturarbeit");
  });

  it("shows the notice when the chosen group is gone", () => {
    act(() =>
      root.render(
        <AngabenWizard
          userType="foerderer"
          firstName="Lea"
          initial={EMPTY_DETAILS}
          notice="Die Gruppe gibt es nicht mehr."
        />,
      ),
    );
    expect(container.textContent).toContain("Die Gruppe gibt es nicht mehr.");
  });

  it("offers the three bdaj functions as cards", () => {
    act(() =>
      root.render(
        <AngabenWizard userType="bdaj" firstName="Kim" initial={EMPTY_DETAILS} notice={null} />,
      ),
    );
    const cards = [...container.querySelectorAll("button[aria-pressed]")].map((b) => b.textContent);
    expect(cards).toEqual(["Vorstandsmitglied", "Mitglied", "Geschäftsstelle"]);
    click("Geschäftsstelle");
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe(
      "Geschäftsstelle",
    );
  });
});
