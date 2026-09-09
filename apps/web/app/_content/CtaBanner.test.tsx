import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { CtaBanner, type CtaBannerProps } from "./CtaBanner";

const basis: CtaBannerProps = {
  ueberschrift: "Jetzt Mitglied werden",
  text: "Werde Teil des BDAS.",
  buttonLabel: "Mitglied werden",
  buttonHref: "/mitglied-werden",
  flaeche: "akzent",
};

const render = (props: Partial<CtaBannerProps>) =>
  renderToStaticMarkup(<CtaBanner {...basis} {...props} />);

describe("CtaBanner", () => {
  it("renders headline, text and button on the accent surface", () => {
    const out = render({});
    expect(out).toContain("bg-bdas-red");
    expect(out).toContain("text-bdas-ink-on-brand");
    expect(out).toContain("Jetzt Mitglied werden");
    expect(out).toContain("Werde Teil des BDAS.");
    expect(out).toContain("Mitglied werden");
  });

  // A call to action is never the title of the page (ADR 0038): the <h1> is a
  // Hero or an Überschrift block.
  it("renders the headline as an h2", () => {
    const out = render({});
    expect(out).toContain("<h2");
    expect(out).not.toContain("<h1");
  });

  it("uses ink on the neutral surface", () => {
    const out = render({ flaeche: "neutral" });
    expect(out).toContain("bg-bdas-overlay-soft");
    expect(out).toContain("text-bdas-ink");
    expect(out).not.toContain("text-bdas-ink-on-brand");
  });

  it("falls back to the accent surface for an absent or unknown value", () => {
    expect(render({ flaeche: undefined as never })).toContain("bg-bdas-red");
    expect(render({ flaeche: "quatsch" as never })).toContain("bg-bdas-red");
    for (const boese of ["constructor", "toString", "__proto__"]) {
      expect(render({ flaeche: boese as never })).toContain("bg-bdas-red");
    }
  });

  it("drops the button when the link is missing or unsafe", () => {
    expect(render({ buttonHref: "" })).not.toContain("<a");
    expect(render({ buttonLabel: "" })).not.toContain("<a");
    expect(render({ buttonHref: "javascript:alert(1)" })).not.toContain("<a");
    expect(render({ buttonHref: "data:text/html,<script>" })).not.toContain("<a");
  });

  it("opens an external link in a new tab and keeps an internal one in place", () => {
    const extern = render({ buttonHref: "https://bdaj.de" });
    expect(extern).toContain('target="_blank"');
    expect(extern).toContain("noopener");

    const intern = render({ buttonHref: "/mitglied-werden" });
    expect(intern).not.toContain('target="_blank"');
    expect(intern).not.toContain("noopener");
  });

  it("never emits a style attribute", () => {
    expect(render({ ueberschrift: "x\"); background: url('evil" })).not.toContain("style=");
  });
});
