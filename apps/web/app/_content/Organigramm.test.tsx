import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { describe, expect, it } from "vitest";

import { Organigramm } from "./Organigramm";
import type { Kasten } from "./organigramm";

const k = (over: Partial<Kasten> = {}): Kasten => ({
  ebene: "1",
  titel: "BDAS",
  untertitel: "",
  link: "",
  logo: "",
  hervorheben: false,
  ...over,
});

const html = (kaesten: Kasten[]) => renderToStaticMarkup(<Organigramm kaesten={kaesten} />);

describe("Organigramm", () => {
  it("renders titles and subtitles", () => {
    const out = html([k({ titel: "BDAJ", untertitel: "Bund der Alevitischen Jugendlichen" })]);
    expect(out).toContain("BDAJ");
    expect(out).toContain("Bund der Alevitischen Jugendlichen");
  });

  it("nests children inside the parent list item", () => {
    const out = html([k({ titel: "BDAS" }), k({ ebene: "2", titel: "BSR" })]);
    expect(out).toMatch(/BDAS[\s\S]*<ul>[\s\S]*BSR/);
  });

  it("renders nothing at all for an empty list", () => {
    expect(html([])).toBe("");
  });

  it("gives an external link target and rel", () => {
    const out = html([k({ link: "https://bdaj.de" })]);
    expect(out).toContain('href="https://bdaj.de"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("gives an internal link neither target nor rel", () => {
    const out = html([k({ link: "/gruppen/koeln" })]);
    expect(out).toContain('href="/gruppen/koeln"');
    expect(out).not.toContain("target=");
    expect(out).not.toContain("rel=");
  });

  it("drops an unsafe href but keeps the box readable", () => {
    const out = html([k({ titel: "Klick", link: "javascript:alert(1)" })]);
    expect(out).not.toContain("<a");
    expect(out).toContain("Klick");
  });

  it("escapes authored text rather than emitting markup", () => {
    const out = html([k({ titel: "<script>alert(1)</script>" })]);
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });

  it("applies the accent styling when hervorheben is set", () => {
    const an = html([k({ hervorheben: true })]);
    expect(an).toContain("border-l-bdas-red");
    expect(an).toContain("shadow-bdas-red-glow");
    expect(html([k({ hervorheben: false })])).not.toContain("border-l-bdas-red");
  });

  it("renders a logo with an empty alt, since the title already names it", () => {
    const out = html([k({ logo: "https://cdn.example/logo.png" })]);
    expect(out).toContain('src="https://cdn.example/logo.png"');
    expect(out).toContain('alt=""');
  });

  it("omits the image element when no logo is set", () => {
    expect(html([k()])).not.toContain("<img");
  });
});
