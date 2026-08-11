/**
 * @vitest-environment happy-dom
 *
 * The upload route authorizes a group lead only when the request carries the
 * content slug (`gruppen/<slug>`); without it the request is treated as a
 * federal page and a lead is rejected with 403. That slug travels through
 * `ContentSlugContext`, so this pins that the field actually sends it.
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentSlugContext } from "./content-slug-context";
import { FotoField } from "./FotoField";

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
  vi.restoreAllMocks();
});

/** The JSON body of the first (signing) request. */
async function uploadPayload(slug: string): Promise<Record<string, unknown>> {
  const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
    if (String(url).includes("/api/content/upload-url")) {
      return new Response(
        JSON.stringify({ uploadUrl: "https://cdn.test/put", publicUrl: "https://cdn.test/a.png" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    root.render(
      <ContentSlugContext.Provider value={slug}>
        <FotoField value="" onChange={() => {}} />
      </ContentSlugContext.Provider>,
    );
  });

  const input = container.querySelector('input[type="file"]');
  if (!input) throw new Error("file input missing");
  const file = new File([new Uint8Array([1, 2, 3])], "foto.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file] });

  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("/api/content/upload-url"));
  if (!call) throw new Error("no signing request was made");
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

describe("FotoField", () => {
  it("sends the content slug so the route can authorize a group lead", async () => {
    const body = await uploadPayload("gruppen/berlin");
    expect(body["slug"]).toBe("gruppen/berlin");
  });

  it("still sends the file metadata the route validates", async () => {
    const body = await uploadPayload("gruppen/berlin");
    expect(body["mimeType"]).toBe("image/png");
    expect(body["sizeBytes"]).toBe(3);
  });
});
