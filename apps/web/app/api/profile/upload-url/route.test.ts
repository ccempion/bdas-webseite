import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: () => ({ get: () => undefined }) }));

import { POST } from "./route";

function request(body: unknown): Request {
  return new Request("http://x/api/profile/upload-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("profile upload-url gate", () => {
  beforeEach(() => {
    delete process.env["BDAS_FLAG_PROFILE"];
  });
  afterEach(() => {
    delete process.env["BDAS_FLAG_PROFILE"];
  });

  it("404s while the profile flag is off", async () => {
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(404);
  });

  it("401s for an anonymous request when the flag is on", async () => {
    process.env["BDAS_FLAG_PROFILE"] = "true";
    const res = await POST(request({ mimeType: "image/png", sizeBytes: 1 }));
    expect(res.status).toBe(401);
  });
});
