/**
 * @vitest-environment happy-dom
 *
 * Der Container verbindet Reducer, Speicher und Bildschirme. Die Server-Aktionen
 * sind hier Attrappen: ihr Verhalten prüfen actions.test.ts und das E2E.
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
vi.mock("./actions", () => ({ createAccountAction: vi.fn() }));
vi.mock("../verifizierung-erneut-senden/actions", () => ({ resendAction: vi.fn() }));
vi.mock("./resume-action", () => ({ resumeJourneyAction: vi.fn() }));

import { OnboardingWizard } from "./OnboardingWizard";
import { STORAGE_KEY } from "./storage";
import type { WizardProps } from "./types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PROPS: WizardProps = {
  env: {
    groups: [{ id: "grp_ber", name: "BDAS Berlin", city: "Berlin" }],
    bdajGroupId: "grp_bdaj",
    netzwerkGroupId: "grp_netz",
  },
  entry: { source: "direkt", greeting: "Schön, dass du da bist!" },
  universities: [["TU Berlin", "Berlin"]],
  privacyUrl: "/datenschutz",
  passwordHint: "Mindestens 10 Zeichen.",
  newsletterOn: false,
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(props: Partial<WizardProps> = {}) {
  act(() => root.render(<OnboardingWizard {...PROPS} {...props} onClose={() => {}} />));
}
const heading = () => container.querySelector("h2")?.textContent ?? "";
function click(text: string) {
  const el = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(text));
  if (!el) throw new Error(`no button "${text}"`);
  act(() => el.click());
}
function type(id: string, value: string) {
  const el = container.querySelector<HTMLInputElement>(`#${id}`);
  if (!el) throw new Error(`no input #${id}`);
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function submit() {
  act(() => container.querySelector("form")?.requestSubmit());
}

describe("OnboardingWizard", () => {
  it("greets and offers four cards, three without the bdaj group", () => {
    render();
    expect(heading()).toBe("Schön, dass du da bist! Was beschreibt dich am besten?");
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(4);

    render({ env: { ...PROPS.env, bdajGroupId: null } });
    expect(container.querySelectorAll("button[aria-pressed]")).toHaveLength(3);
  });

  it("walks a supporter to the result, speaks by first name, and goes back without losing the name", () => {
    render();
    click("Ich möchte unterstützen");
    expect(heading()).toBe("Wie dürfen wir dich nennen?");

    type("onb-vorname", "Lea");
    type("onb-nachname", "Yıldız");
    submit();
    expect(heading()).toBe("Du passt zu uns als Förderer*in.");
    expect(container.textContent).toContain("Der Bundesvorstand");

    click("Zurück");
    expect(heading()).toBe("Wie dürfen wir dich nennen?");
    expect(container.querySelector<HTMLInputElement>("#onb-vorname")?.value).toBe("Lea");
  });

  it("finds a group by university and names it on the result", () => {
    render();
    click("Ich studiere gerade");
    type("onb-vorname", "Lea");
    type("onb-nachname", "Y");
    submit();
    expect(heading()).toBe("Wo studierst du, Lea?");

    type("onb-ort", "TU Ber");
    click("TU Berlin");
    expect(heading()).toBe("Du passt zu uns als Student*in in Berlin.");
    expect(container.textContent).toContain("Der Vorstand von BDAS Berlin");
  });

  it("marks the chosen card and keeps it after a reload", () => {
    render();
    click("Ich habe studiert");
    expect(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "{}").answers).toEqual({
      typ: "studiert",
    });

    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(heading()).toBe("Wie dürfen wir dich nennen?");
  });

  it("opens the account form from the result", () => {
    render();
    click("Ich möchte unterstützen");
    type("onb-vorname", "Lea");
    type("onb-nachname", "Y");
    submit();
    click("Passt — Konto anlegen");
    expect(heading()).toBe("Fast geschafft — dein Konto");
    expect(container.querySelector<HTMLInputElement>('input[name="answers"]')?.value).toContain(
      '"typ":"unterstuetzen"',
    );
  });

  it("prefills the name for a signed-in account and confirms without an account form", () => {
    act(() =>
      root.render(
        <OnboardingWizard
          {...PROPS}
          resume={{ firstName: "Lea", lastName: "Yıldız" }}
          onClose={() => {}}
        />,
      ),
    );
    click("Ich möchte unterstützen");
    expect(container.querySelector<HTMLInputElement>("#onb-vorname")?.value).toBe("Lea");
    submit();
    expect(heading()).toBe("Du passt zu uns als Förderer*in.");
    expect(container.textContent).not.toContain("Passt — Konto anlegen");
    expect(container.textContent).toContain("Passt — weiter");
  });
});
