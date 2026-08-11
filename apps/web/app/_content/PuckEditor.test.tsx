/**
 * @vitest-environment happy-dom
 *
 * `ContentSlugContext` existed, and `FotoField` consumed it, but nothing ever
 * provided it — so every upload from the editor sent `slug: ""`, the signing
 * route read no `gruppen/<slug>` scope, fell back to federal-board-only, and
 * answered a group lead with "Keine Berechtigung."
 *
 * Puck itself is stubbed: this is about the provider around it, and mounting
 * the real editor would test Puck rather than this wiring.
 */
import React, { act, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as PuckCore from "@puckeditor/core";

import { ContentSlugContext } from "./content-slug-context";

vi.mock("@puckeditor/core/puck.css", () => ({}));
// Only `Puck` is replaced; `puck-config` still needs the real `transformProps`.
vi.mock("@puckeditor/core", async (importActual) => ({
  ...(await importActual<typeof PuckCore>()),
  Puck: () => {
    const slug = useContext(ContentSlugContext);
    return React.createElement("div", { "data-slug": slug });
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { PuckEditor } from "./PuckEditor";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("PuckEditor", () => {
  it("provides the content slug to everything inside the editor", async () => {
    await act(async () => {
      root.render(
        <PuckEditor
          slug="gruppen/berlin"
          initialData={{ root: { props: {} }, content: [] } as never}
          chrome={{ navItems: [], events: false, groups: false }}
        />,
      );
    });
    expect(container.querySelector("[data-slug]")?.getAttribute("data-slug")).toBe(
      "gruppen/berlin",
    );
  });

  it("passes a federal page's slug through unchanged", async () => {
    await act(async () => {
      root.render(
        <PuckEditor
          slug="ueber-uns/bdaj"
          initialData={{ root: { props: {} }, content: [] } as never}
          chrome={{ navItems: [], events: false, groups: false }}
        />,
      );
    });
    expect(container.querySelector("[data-slug]")?.getAttribute("data-slug")).toBe(
      "ueber-uns/bdaj",
    );
  });
});
