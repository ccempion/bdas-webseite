import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

// Simulate an anonymous request: outside a real request scope next/headers'
// cookies() throws, so stub it to a cookieless jar.
vi.mock("next/headers", () => ({
  cookies: () => ({ get: () => undefined }),
}));

function request(body: unknown): Request {
  return new Request("http://x/api/content/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("content upload-url gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_CONTENT"];
  });

  it("404s while the content flag is off", async () => {
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(404);
  });

  it("401s for an anonymous request when the flag is on", async () => {
    process.env["BDAS_FLAG_CONTENT"] = "true";
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(401);
  });
});
