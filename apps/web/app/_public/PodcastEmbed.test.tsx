import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PodcastEmbed } from "./PodcastEmbed";

describe("PodcastEmbed", () => {
  const out = renderToStaticMarkup(<PodcastEmbed />);

  it("embeds the BDAS Spotify show", () => {
    expect(out).toContain(
      "https://open.spotify.com/embed/show/58ch4A571IGfllcdIvv9Tb?utm_source=generator",
    );
  });

  it("is lazy-loaded", () => {
    expect(out).toContain('loading="lazy"');
  });

  it("spans the full available width", () => {
    expect(out).toContain('width="100%"');
  });

  it("uses the design system's card radius, not a hardcoded value", () => {
    expect(out).toContain("rounded-bdas");
    expect(out).not.toContain("border-radius");
  });

  it("has an accessible title", () => {
    expect(out).toMatch(/<iframe[^>]*title="[^"]+"/);
  });
});
