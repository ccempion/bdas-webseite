import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("getContentMediaStorage", () => {
  it("throws a clear error when storage env is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { getContentMediaStorage } = await import("./index");
    expect(() => getContentMediaStorage()).toThrow(/content-media/i);
  });

  it("builds a public URL for a key when configured", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    const { getContentMediaStorage } = await import("./index");
    const url = getContentMediaStorage().publicUrl("seite/foto.jpg");
    expect(url).toContain("/storage/v1/object/public/content-media/seite/foto.jpg");
  });
});

describe("contentMediaPublicUrl", () => {
  it("returns a deterministic public URL without the service-role key", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { contentMediaPublicUrl } = await import("./index");
    const url = contentMediaPublicUrl("seite/foto.jpg");
    expect(url).toContain("/storage/v1/object/public/content-media/seite/foto.jpg");
  });

  it("throws when SUPABASE_URL is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { contentMediaPublicUrl } = await import("./index");
    expect(() => contentMediaPublicUrl("seite/foto.jpg")).toThrow(/SUPABASE_URL/i);
  });
});
