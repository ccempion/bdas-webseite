/**
 * The content signing route authorizes a group lead by the `slug` it finds in
 * the request body; without one it reads the request as a federal page and
 * answers a lead with "Keine Berechtigung." The Fließtext editor therefore has
 * to forward its content slug on drop and on paste, which is what these pin.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { imageFileHandler } from "./editor-file-handler";

type DropHandler = (editor: unknown, files: File[], pos: number | null) => void;
type PasteHandler = (editor: unknown, files: File[]) => void;

/** Tiptap stores the configured callbacks on the extension's options. */
function handlers(extra?: Record<string, unknown>) {
  const ext = imageFileHandler({
    endpoint: "/api/content/upload-url",
    onError: () => {},
    ...(extra ? { extra } : {}),
  });
  const options = (ext as unknown as { options: { onDrop: DropHandler; onPaste: PasteHandler } })
    .options;
  return options;
}

/** Enough of a Tiptap editor for the insert path to run. */
function editorStub() {
  const chain = {
    focus: () => chain,
    insertContent: () => chain,
    insertContentAt: () => chain,
    run: () => true,
  };
  return { chain: () => chain, state: { selection: { to: 1 } } };
}

function pngFile(): File {
  return new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
}

/** Resolves with the JSON body of the signing request. */
function captureSigningBody(): { calls: unknown[][]; restore: () => void } {
  const calls: unknown[][] = [];
  const mock = vi.fn(async (url: unknown, init: unknown) => {
    calls.push([url, init]);
    if (String(url).includes("/api/content/upload-url")) {
      return new Response(
        JSON.stringify({ uploadUrl: "https://cdn.test/put", publicUrl: "https://cdn.test/a.png" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", mock);
  return { calls, restore: () => vi.unstubAllGlobals() };
}

async function bodyOf(calls: unknown[][]): Promise<Record<string, unknown>> {
  const call = calls.find((c) => String(c[0]).includes("/api/content/upload-url"));
  if (!call) throw new Error("no signing request was made");
  return JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;
}

/** The upload runs detached from the handler, so let its microtasks settle. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe("imageFileHandler", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards extra fields on drop", async () => {
    const { calls } = captureSigningBody();
    handlers({ slug: "gruppen/berlin" }).onDrop(editorStub(), [pngFile()], 3);
    await settle();
    expect((await bodyOf(calls))["slug"]).toBe("gruppen/berlin");
  });

  it("forwards extra fields on paste", async () => {
    const { calls } = captureSigningBody();
    handlers({ slug: "gruppen/berlin" }).onPaste(editorStub(), [pngFile()]);
    await settle();
    expect((await bodyOf(calls))["slug"]).toBe("gruppen/berlin");
  });

  it("still sends the file metadata the route validates", async () => {
    const { calls } = captureSigningBody();
    handlers({ slug: "gruppen/berlin" }).onPaste(editorStub(), [pngFile()]);
    await settle();
    const body = await bodyOf(calls);
    expect(body["mimeType"]).toBe("image/png");
    expect(body["sizeBytes"]).toBe(3);
  });

  it("omits the field entirely when no extra is configured (blog)", async () => {
    const { calls } = captureSigningBody();
    handlers().onPaste(editorStub(), [pngFile()]);
    await settle();
    expect(await bodyOf(calls)).not.toHaveProperty("slug");
  });
});
