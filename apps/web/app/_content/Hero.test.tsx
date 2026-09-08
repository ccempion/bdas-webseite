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

  it("renders a photo background as an img behind the scrim, never as inline CSS", () => {
    const out = render({ hintergrund: "bild", bild: "https://cdn.example/foto.webp" });
    expect(out).toContain('src="https://cdn.example/foto.webp"');
    expect(out).toContain("bg-bdas-hero-scrim");
    expect(out).not.toContain("background-image");
    expect(out).toContain("text-bdas-ink-on-brand");
  });

  it("escapes a hostile image value instead of letting it reach CSS", () => {
    const out = render({ hintergrund: "bild", bild: "x'); background: url('evil" });
    // The payload must land inside an escaped attribute and nowhere near a
    // style string. Do not assert on the absence of "background:" — the
    // payload itself contains it, escaped and inert, in the src attribute.
    expect(out).not.toContain("style=");
    expect(out).toContain("&#x27;");
  });

  it("stays dark-on-light when the photo background has no image yet", () => {
    const out = render({ hintergrund: "bild", bild: "" });
    expect(out).not.toContain("text-bdas-ink-on-brand");
    expect(out).not.toContain("bg-bdas-hero-scrim");
  });

  it("rests on the hero-card shadow, not the hover one", () => {
    const out = render({});
    expect(out).toContain("shadow-bdas-card-low");
    expect(out).not.toContain("shadow-bdas-lift-lg");
  });

  it("maps each height preset to its own class", () => {
    expect(render({ hoehe: "kompakt" })).toContain("min-h-[16rem]");
    expect(render({ hoehe: "mittel" })).toContain("min-h-[24rem]");
    expect(render({ hoehe: "gross" })).toContain("min-h-[70vh]");
  });

  it("falls back to the mittel height and the light surface for unknown values", () => {
    const out = render({
      hoehe: undefined as never,
      hintergrund: undefined as never,
    });
    expect(out).toContain("min-h-[24rem]");
    expect(out).not.toContain("bg-bdas-red");
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

  it("renders nothing but the frame when every field is empty", () => {
    const out = render({ ueberschrift: "", untertext: "" });
    expect(out).not.toContain("<h2");
    expect(out).not.toContain("<p");
  });
});
