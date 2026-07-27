import { describe, expect, it } from "vitest";

import { uploadImage } from "./upload-image";

const png = { name: "foto.png", type: "image/png", size: 2048 } as unknown as File;

/** Minimal stand-in for the two fetch calls; records what was asked for. */
function fakeFetch(responses: Record<string, { ok: boolean; body?: unknown }>) {
  const calls: string[] = [];
  const impl = async (input: unknown, init?: { method?: string; body?: unknown }) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    const r = responses[url] ?? { ok: false, body: {} };
    return { ok: r.ok, json: async () => r.body ?? {} };
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

describe("uploadImage", () => {
  it("signs, puts, and returns the route's own payload", async () => {
    const { impl, calls } = fakeFetch({
      "/api/blog/upload-url": {
        ok: true,
        body: { uploadUrl: "https://signed.example/put", publicUrl: "https://cdn/x.png" },
      },
      "https://signed.example/put": { ok: true },
    });
    const out = await uploadImage<{ uploadUrl: string; publicUrl: string }>(
      "/api/blog/upload-url",
      png,
      undefined,
      impl,
    );
    expect(out).toEqual({
      ok: { uploadUrl: "https://signed.example/put", publicUrl: "https://cdn/x.png" },
    });
    expect(calls).toEqual(["POST /api/blog/upload-url", "PUT https://signed.example/put"]);
  });

  it("sends the file's own metadata to the signing route", async () => {
    let sent: unknown = null;
    const impl = (async (input: unknown, init?: { body?: string }) => {
      if (String(input).startsWith("/api")) {
        sent = JSON.parse(init?.body ?? "{}");
        return { ok: true, json: async () => ({ uploadUrl: "https://s/put" }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as unknown as typeof fetch;

    await uploadImage("/api/content/upload-url", png, { slug: "ueber-uns" }, impl);
    expect(sent).toEqual({
      filename: "foto.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      slug: "ueber-uns",
    });
  });

  it("surfaces the server's German error when signing is refused", async () => {
    const { impl } = fakeFetch({
      "/api/blog/upload-url": { ok: false, body: { error: "Nicht berechtigt." } },
    });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Nicht berechtigt.",
    });
  });

  it("falls back to a generic message when the route gives no reason", async () => {
    const { impl } = fakeFetch({ "/api/blog/upload-url": { ok: false, body: {} } });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Upload fehlgeschlagen.",
    });
  });

  it("reports a failed PUT rather than a false success", async () => {
    const { impl } = fakeFetch({
      "/api/blog/upload-url": { ok: true, body: { uploadUrl: "https://signed.example/put" } },
      "https://signed.example/put": { ok: false },
    });
    expect(await uploadImage("/api/blog/upload-url", png, undefined, impl)).toEqual({
      error: "Upload fehlgeschlagen.",
    });
  });
});
