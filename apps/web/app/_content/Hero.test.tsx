import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Hero, type HeroProps } from "./Hero";

const basis: HeroProps = {
  ueberschrift: "Wer wir sind",
  untertext: "Der Bund der alevitischen Studierenden.",
  hintergrund: "hell",
  bild: "",
  hoehe: "mittel",
  ausrichtung: "links",
  buttonLabel: "",
  buttonHref: "",
};

const render = (props: Partial<HeroProps>) => renderToStaticMarkup(<Hero {...basis} {...props} />);

describe("Hero", () => {
  it("renders headline and sub-text with ink colours on the light surface", () => {
    const out = render({});
    expect(out).toContain("Wer wir sind");
    expect(out).toContain("Der Bund der alevitischen Studierenden.");
    expect(out).toContain("text-bdas-ink");
    expect(out).not.toContain("text-bdas-ink-on-brand");
  });

  it("uses the brand-red surface and on-brand text for the accent background", () => {
    const out = render({ hintergrund: "akzent" });
    expect(out).toContain("bg-bdas-red");
    expect(out).toContain("text-bdas-ink-on-brand");
  });

  it("renders a photo background as an escaped img attribute, never as inline CSS", () => {
    const out = render({ hintergrund: "bild", bild: "https://cdn.example/foto.webp" });
    expect(out).toContain('src="https://cdn.example/foto.webp"');
    expect(out).toContain("bg-bdas-hero-scrim");
    expect(out).toContain("text-bdas-ink-on-brand");

    // The image URL is editor-supplied. React escapes an attribute but not a
    // style string, so a payload crafted to break out of a `url()` must land
    // inertly in `src` and no `style` attribute may exist to break out of.
    // (Do not assert the absence of "background:" — the payload contains it.)
    const boese = render({ hintergrund: "bild", bild: "x'); background: url('evil" });
    expect(boese).not.toContain("style=");
    expect(boese).toContain("&#x27;");
  });

  it("stays dark-on-light when the photo background has no image yet", () => {
    const out = render({ hintergrund: "bild", bild: "" });
    expect(out).not.toContain("text-bdas-ink-on-brand");
    expect(out).not.toContain("bg-bdas-hero-scrim");
  });

  it("maps each height preset to its own class and falls back to mittel", () => {
    expect(render({ hoehe: "kompakt" })).toContain("min-h-[16rem]");
    expect(render({ hoehe: "mittel" })).toContain("min-h-[24rem]");
    expect(render({ hoehe: "gross" })).toContain("min-h-[70vh]");

    // A document saved before either field existed carries neither.
    const alt = render({ hoehe: undefined as never, hintergrund: undefined as never });
    expect(alt).toContain("min-h-[24rem]");
    expect(alt).not.toContain("bg-bdas-red");
  });

  it("renders the optional button only when label and href are both usable", () => {
    expect(render({ buttonLabel: "Mehr erfahren", buttonHref: "/ueber-uns" })).toContain(
      'href="/ueber-uns"',
    );
    expect(render({ buttonLabel: "", buttonHref: "/ueber-uns" })).not.toContain("<a");
    expect(render({ buttonLabel: "Mehr erfahren", buttonHref: "" })).not.toContain("<a");
    expect(
      render({ buttonLabel: "Mehr erfahren", buttonHref: "javascript:alert(1)" }),
    ).not.toContain("<a");
  });

  it("gives the button a light variant on a dark ground and the primary one on light", () => {
    const dunkel = render({
      hintergrund: "akzent",
      buttonLabel: "Mitglied werden",
      buttonHref: "/mitglied-werden",
    });
    expect(dunkel).toContain("bg-bdas-surface px-4");
    const hellGrund = render({
      buttonLabel: "Mitglied werden",
      buttonHref: "/mitglied-werden",
    });
    expect(hellGrund).toContain("bg-bdas-red px-4");
  });

  it("opens an external button link in a new tab with a safe rel", () => {
    const out = render({ buttonLabel: "Zum BDAJ", buttonHref: "https://bdaj.de" });
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("carries the alignment through to text and button row", () => {
    const out = render({
      ausrichtung: "mittig",
      buttonLabel: "Los",
      buttonHref: "/los",
    });
    expect(out).toContain("text-center");
    expect(out).toContain("justify-center");
  });
});
