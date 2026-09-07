import { describe, expect, it } from "vitest";

import { shouldShowNavProgress, type NavClickIntent } from "./nav-progress";

const HIER = "https://bdas.de/gruppen";

function klick(overrides: Partial<NavClickIntent> = {}): NavClickIntent {
  return {
    href: "https://bdas.de/events",
    currentUrl: HIER,
    target: null,
    hasDownload: false,
    modifierKey: false,
    button: 0,
    ...overrides,
  };
}

describe("shouldShowNavProgress", () => {
  it("zeigt den Loader bei einer normalen internen Navigation", () => {
    expect(shouldShowNavProgress(klick())).toBe(true);
  });

  it("zeigt ihn auch, wenn nur die Query wechselt", () => {
    expect(shouldShowNavProgress(klick({ href: "https://bdas.de/gruppen?seite=2" }))).toBe(true);
  });

  it("schweigt bei einem Sprungziel auf derselben Seite", () => {
    expect(shouldShowNavProgress(klick({ href: "https://bdas.de/gruppen#inhalt" }))).toBe(false);
  });

  it("schweigt beim erneuten Klick auf den aktuellen Link", () => {
    expect(shouldShowNavProgress(klick({ href: HIER }))).toBe(false);
  });

  it("schweigt bei externen Zielen", () => {
    expect(shouldShowNavProgress(klick({ href: "https://example.org/seite" }))).toBe(false);
  });

  it("schweigt bei mailto: und tel:", () => {
    expect(shouldShowNavProgress(klick({ href: "mailto:info@bdas.de" }))).toBe(false);
    expect(shouldShowNavProgress(klick({ href: "tel:+4930123456" }))).toBe(false);
  });

  it("schweigt, wenn der Browser einen neuen Tab öffnet", () => {
    expect(shouldShowNavProgress(klick({ modifierKey: true }))).toBe(false);
    expect(shouldShowNavProgress(klick({ target: "_blank" }))).toBe(false);
  });

  it("wertet target=_self wie eine normale Navigation", () => {
    expect(shouldShowNavProgress(klick({ target: "_self" }))).toBe(true);
    expect(shouldShowNavProgress(klick({ target: "" }))).toBe(true);
  });

  it("schweigt bei Downloads — die Seite bleibt stehen", () => {
    expect(shouldShowNavProgress(klick({ hasDownload: true }))).toBe(false);
  });

  it("schweigt bei Mittel- und Rechtsklick", () => {
    expect(shouldShowNavProgress(klick({ button: 1 }))).toBe(false);
    expect(shouldShowNavProgress(klick({ button: 2 }))).toBe(false);
  });

  it("schweigt bei einem unlesbaren href statt zu werfen", () => {
    expect(shouldShowNavProgress(klick({ href: "::kein-url::" }))).toBe(false);
  });
});
