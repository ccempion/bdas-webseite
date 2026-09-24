// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Begriff } from "./Begriff";
import { GlossarProvider } from "./GlossarProvider";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function mount(node: React.ReactNode) {
  act(() => root.render(node));
}

describe("Begriff", () => {
  it("renders only the word while the flag is off", () => {
    mount(<Begriff k="verteiler">Verteiler</Begriff>);
    expect(container.textContent).toBe("Verteiler");
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders only the word for an unknown key", () => {
    mount(
      <GlossarProvider enabled>
        <Begriff k="gibt-es-nicht">Irgendwas</Begriff>
      </GlossarProvider>,
    );
    expect(container.textContent).toBe("Irgendwas");
    expect(container.querySelector("button")).toBeNull();
  });

  it("explains the term and links the FAQ entry the route returns", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ href: "/faq#e1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    mount(
      <GlossarProvider enabled>
        <Begriff k="warteliste">Warteliste</Begriff>
      </GlossarProvider>,
    );
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-label")).toBe("Was bedeutet „Warteliste“?");

    await act(async () => button.click());

    expect(container.querySelector('[role="note"]')?.textContent).toContain(
      "rückst du automatisch nach",
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/glossar/warteliste");
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/faq#e1");
  });
});
