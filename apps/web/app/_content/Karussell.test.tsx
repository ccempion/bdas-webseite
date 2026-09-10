/**
 * @vitest-environment happy-dom
 *
 * The active-slide rule is pure and is tested in `karussell-darstellung.test.ts`.
 * What needs a DOM is the wiring around it: that the controls appear only once
 * the component is alive, and that a click on an arrow or a dot moves the rail
 * rather than the page.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Karussell, type Folie } from "./Karussell";

const folie = (titel: string, bild = ""): Folie => ({
  bild,
  titel,
  text: `${titel} in einem Satz.`,
});

describe("Karussell, server-rendered", () => {
  it("puts every slide on the page, in order", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität"), folie("Vielfalt")]} />,
    );
    expect(out.indexOf("Solidarität")).toBeLessThan(out.indexOf("Vielfalt"));
    expect((out.match(/<li/g) ?? []).length).toBe(2);
  });

  it("offers no controls before it is alive", () => {
    // Arrows and dots do nothing without JavaScript. A rail that can still be
    // swiped and scrolled by hand is the honest fallback; dead buttons are not.
    // Two slides, so an absent <button> is attributable to the mount gate
    // alone — one slide would suppress controls on its own either way.
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Eins"), folie("Zwei")]} />,
    );
    expect(out).not.toContain("<button");
    expect(out).toContain("snap-x");
  });

  it("keeps the section from growing to the width of all its slides", () => {
    // In a `Spalten` block the section is a grid item, and `min-width: auto`
    // there means "as wide as your content" — the whole rail laid out flat,
    // which pushed the track to 775px inside a 358px phone column and forced
    // the page to zoom out. Asserted as a class because jsdom has no layout;
    // the point is that a refactor cannot quietly drop it again.
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Eins"), folie("Zwei")]} />,
    );
    expect(out).toMatch(/<section[^>]*class="[^"]*\bmin-w-0\b/);
  });

  it("shows an image only when the slide has one, and marks it decorative", () => {
    const mit = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität", "https://cdn.example/a.webp")]} />,
    );
    expect(mit).toContain('src="https://cdn.example/a.webp"');
    expect(mit).toContain('alt=""');
    expect(mit).toContain("aria-hidden");

    const ohne = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität")]} />,
    );
    expect(ohne).not.toContain("<img");
  });

  it("names the region after its heading, and falls back to a generic name", () => {
    const mit = renderToStaticMarkup(
      <Karussell ueberschrift="Unsere Werte" folien={[folie("Solidarität")]} />,
    );
    expect(mit).toContain("aria-labelledby");
    expect(mit).toContain("Unsere Werte");
    expect(mit).not.toContain('aria-label="Karussell"');

    const ohne = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Solidarität")]} />,
    );
    expect(ohne).toContain('aria-label="Karussell"');
    expect(ohne).not.toContain("aria-labelledby");
  });

  it("numbers the slides for assistive tech", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("Eins"), folie("Zwei")]} />,
    );
    expect(out).toContain('aria-label="Folie 1 von 2"');
    expect(out).toContain('aria-label="Folie 2 von 2"');
  });

  it("renders nothing at all without slides", () => {
    expect(renderToStaticMarkup(<Karussell ueberschrift="" folien={[]} />)).toBe("");
  });

  it("survives a document saved without the array", () => {
    expect(
      renderToStaticMarkup(
        <Karussell ueberschrift={undefined as never} folien={undefined as never} />,
      ),
    ).toBe("");
  });

  it("stays flat unless the board asked for Coverflow", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" folien={[folie("A"), folie("B"), folie("C")]} />,
    );
    expect(out).not.toContain("perspective");
  });

  it("builds the 3-D scene once Coverflow is chosen", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        folien={[folie("A"), folie("B"), folie("C")]}
      />,
    );
    expect(out).toContain("perspective:1200px");
  });

  it("falls back to flat below three slides", () => {
    const out = renderToStaticMarkup(
      <Karussell ueberschrift="" darstellung="coverflow" folien={[folie("A"), folie("B")]} />,
    );
    expect(out).not.toContain("perspective");
  });

  it("falls back to flat inside the editor, to keep drag and drop honest", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        imEditor
        folien={[folie("A"), folie("B"), folie("C")]}
      />,
    );
    expect(out).not.toContain("perspective");
  });

  it("loads the first image eagerly and the rest only when approached", () => {
    // Coverflow shows several slides at once, so every image would otherwise
    // be fetched on load. Six 1080px photos on a phone is the case this
    // guards against.
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        folien={[
          folie("A", "https://cdn.example/a.webp"),
          folie("B", "https://cdn.example/b.webp"),
          folie("C", "https://cdn.example/c.webp"),
        ]}
      />,
    );
    expect((out.match(/loading="lazy"/g) ?? []).length).toBe(2);
    expect((out.match(/loading="eager"/g) ?? []).length).toBe(1);
  });

  it("puts the caption under the rail by default, for the centred slide only", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="unter"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect((out.match(/Erste in einem Satz\./g) ?? []).length).toBe(1);
    expect(out).not.toContain("Zweite in einem Satz.");
  });

  it("drops the caption entirely when the board asked for none", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="keine"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect(out).not.toContain("Erste");
  });

  it("lays the caption over every image when asked to", () => {
    const out = renderToStaticMarkup(
      <Karussell
        ueberschrift=""
        darstellung="coverflow"
        beschriftung="auf"
        folien={[folie("Erste"), folie("Zweite"), folie("Dritte")]}
      />,
    );
    expect(out).toContain("Erste");
    expect(out).toContain("Zweite");
  });
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("Karussell, alive in a DOM", () => {
  let host: HTMLDivElement;
  let root: Root;

  const mount = (folien: Folie[], ueberschrift = "") => {
    act(() => {
      root.render(<Karussell ueberschrift={ueberschrift} folien={folien} />);
    });
  };
  const rail = () => host.querySelector("ul") as HTMLUListElement;
  const buttons = (label: string) =>
    [...host.querySelectorAll("button")].filter((b) => b.getAttribute("aria-label") === label);

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("grows its controls once it is alive", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    expect(buttons("Vorherige Folie")).toHaveLength(1);
    expect(buttons("Nächste Folie")).toHaveLength(1);
    // One dot per slide.
    expect(host.querySelectorAll("[data-karussell-punkt]")).toHaveLength(3);
  });

  it("offers no controls for a single slide", () => {
    // One slide is not a carousel; arrows and a lone dot would be furniture.
    mount([folie("Allein")]);
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("disables the arrow that would leave the rail", () => {
    mount([folie("Eins"), folie("Zwei")]);
    expect(buttons("Vorherige Folie")[0]?.disabled).toBe(true);
    expect(buttons("Nächste Folie")[0]?.disabled).toBe(false);
  });

  it("moves the rail, not the page, when an arrow is pressed", () => {
    mount([folie("Eins"), folie("Zwei")]);
    const el = rail();
    // happy-dom has no layout: clientWidth is 0 and scrollBy is inert. Both
    // are stood in for, because what this asserts is the call, not the scroll.
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    const scrollBy = vi.fn();
    el.scrollBy = scrollBy as never;

    act(() => {
      buttons("Nächste Folie")[0]?.click();
    });
    expect(scrollBy).toHaveBeenCalledWith({ left: 400, behavior: "smooth" });
  });

  it("jumps to the slide a dot names", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    const el = rail();
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    const scrollTo = vi.fn();
    el.scrollTo = scrollTo as never;

    const punkte = [...host.querySelectorAll("[data-karussell-punkt]")] as HTMLButtonElement[];
    act(() => punkte[2]?.click());
    expect(scrollTo).toHaveBeenCalledWith({ left: 800, behavior: "smooth" });
  });

  it("marks the dot of the slide the rail is actually showing", () => {
    mount([folie("Eins"), folie("Zwei"), folie("Drei")]);
    const el = rail();
    Object.defineProperty(el, "clientWidth", { value: 400, configurable: true });
    Object.defineProperty(el, "scrollLeft", { value: 800, configurable: true, writable: true });

    act(() => el.dispatchEvent(new Event("scroll")));

    const punkte = [...host.querySelectorAll("[data-karussell-punkt]")];
    expect(punkte[2]?.getAttribute("aria-current")).toBe("true");
    expect(punkte[0]?.getAttribute("aria-current")).toBeNull();
    expect(buttons("Nächste Folie")[0]?.disabled).toBe(true);
  });

  it("grows an overlay button per off-centre slide once alive", () => {
    // The image itself is never re-parented — the button is a sibling laid
    // over it — so hydration does not restart an in-flight image load.
    // Three slides and its own render, because Coverflow needs a middle and
    // the shared `mount` helper only ever asks for the flat presentation.
    act(() => {
      root.render(
        <Karussell
          ueberschrift=""
          darstellung="coverflow"
          folien={[folie("Eins"), folie("Zwei"), folie("Drei")]}
        />,
      );
    });
    const knoepfe = () => Array.from(host.querySelectorAll("[data-karussell-sprung]")).length;
    expect(knoepfe()).toBeGreaterThan(0);
  });
});
