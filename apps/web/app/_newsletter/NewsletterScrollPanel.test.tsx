/**
 * @vitest-environment happy-dom
 *
 * The trigger rule is a pure function and is tested as one. What needs a DOM
 * is the wiring around it: that the panel is absent until the rule says
 * otherwise, and that clicking it away keeps it away for the session.
 */
// vitest compiles JSX with the classic runtime, so React has to be in scope.
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/ueber-uns" }));

// Server actions cannot run here, and neither can the offer's `useFormState`.
// Both are covered next to themselves; this file is about the panel.
const dismissPromptAction = vi.fn(async () => ({ ok: true }));
vi.mock("./actions", () => ({ dismissPromptAction: () => dismissPromptAction() }));
vi.mock("./NewsletterOffer", () => ({
  NewsletterOffer: (p: { state: string }) => <div data-offer={p.state}>Angebot</div>,
}));

import {
  MIN_PAGE_HEIGHT_FACTOR,
  NewsletterScrollPanel,
  panelIsDue,
  SCROLL_DEPTH,
} from "./NewsletterScrollPanel";

describe("panelIsDue", () => {
  const VIEWPORT = 800;

  it("never fires on a page shorter than three windows, however far it is scrolled", () => {
    const pageHeight = VIEWPORT * MIN_PAGE_HEIGHT_FACTOR - 1;
    for (const scrollY of [0, 100, pageHeight - VIEWPORT]) {
      expect(panelIsDue({ pageHeight, viewportHeight: VIEWPORT, scrollY })).toBe(false);
    }
  });

  it("waits until half the long page has been seen", () => {
    const pageHeight = VIEWPORT * 4;
    // Half of four windows is two; one window is already on screen, so the
    // scroll position that gets there is one window down.
    expect(panelIsDue({ pageHeight, viewportHeight: VIEWPORT, scrollY: VIEWPORT - 1 })).toBe(false);
    expect(panelIsDue({ pageHeight, viewportHeight: VIEWPORT, scrollY: VIEWPORT })).toBe(true);
  });

  it("leaves room below the trigger so the footer card is out of sight", () => {
    // At the shortest qualifying page the trigger must still sit far enough up
    // that the footer is not already on screen — the rule the whole PR hangs
    // on: inline surfaces are for the middle of a page.
    const pageHeight = VIEWPORT * MIN_PAGE_HEIGHT_FACTOR;
    const trigger = pageHeight * SCROLL_DEPTH - VIEWPORT;
    expect(pageHeight - (trigger + VIEWPORT)).toBeGreaterThanOrEqual(VIEWPORT);
  });

  it("says no rather than dividing by a zero-height page", () => {
    expect(panelIsDue({ pageHeight: 0, viewportHeight: 0, scrollY: 0 })).toBe(false);
  });
});

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function setPage(pageHeight: number, scrollY: number) {
  Object.defineProperty(document.documentElement, "scrollHeight", {
    configurable: true,
    value: pageHeight,
  });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
}

function scroll(to: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: to });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

const panel = () => container.querySelector("[data-newsletter-panel]");

beforeEach(() => {
  window.sessionStorage.clear();
  dismissPromptAction.mockClear();
  setPage(4000, 0);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(state: "guest" | "member" | null) {
  act(() => root.render(<NewsletterScrollPanel state={state} />));
}

describe("NewsletterScrollPanel", () => {
  it("stays away entirely when the server says no", () => {
    render(null);
    scroll(3000);
    expect(panel()).toBeNull();
  });

  it("never appears on a page that is barely taller than the window", () => {
    setPage(1600, 0);
    render("guest");
    scroll(800);
    expect(panel()).toBeNull();
  });

  it("appears once half a long page has been seen, not before", () => {
    render("guest");
    expect(panel()).toBeNull();
    scroll(1199);
    expect(panel()).toBeNull();
    scroll(1200);
    expect(panel()).not.toBeNull();
  });

  it("shows a guest the public offer and an account the one-click one", () => {
    render("member");
    scroll(1200);
    expect(panel()?.querySelector("[data-offer]")?.getAttribute("data-offer")).toBe("member");
  });

  it("is gone for the session once a guest clicks it away", () => {
    render("guest");
    scroll(1200);
    act(() => {
      panel()?.querySelector<HTMLButtonElement>("[data-newsletter-panel-dismiss]")?.click();
    });
    expect(panel()).toBeNull();

    // A fresh page load in the same session must not bring it back.
    act(() => root.render(<NewsletterScrollPanel state="guest" />));
    scroll(2000);
    expect(panel()).toBeNull();
    expect(dismissPromptAction).not.toHaveBeenCalled();
  });

  it("records an account's dismissal on the server, where the fortnight lives", () => {
    render("member");
    scroll(1200);
    act(() => {
      panel()?.querySelector<HTMLButtonElement>("[data-newsletter-panel-dismiss]")?.click();
    });
    expect(panel()).toBeNull();
    expect(dismissPromptAction).toHaveBeenCalledTimes(1);
  });
});
