import { afterEach, describe, expect, it, vi } from "vitest";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("getEventMediaStorage", () => {
  it("throws a clear error when storage env is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { getEventMediaStorage } = await import("./index");
    expect(() => getEventMediaStorage()).toThrow(/event-media/i);
  });

  it("builds a public URL for a key when configured", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    const { getEventMediaStorage } = await import("./index");
    const url = getEventMediaStorage().publicUrl("evt_1/cover.jpg");
    expect(url).toContain("/storage/v1/object/public/event-media/evt_1/cover.jpg");
  });
});

describe("eventMediaPublicUrl", () => {
  it("returns a deterministic public URL without the service-role key", async () => {
    vi.resetModules();
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { eventMediaPublicUrl } = await import("./index");
    const url = eventMediaPublicUrl("evt_1/cover.jpg");
    expect(url).toContain("/storage/v1/object/public/event-media/evt_1/cover.jpg");
  });

  it("throws when SUPABASE_URL is missing", async () => {
    vi.resetModules();
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { eventMediaPublicUrl } = await import("./index");
    expect(() => eventMediaPublicUrl("evt_1/cover.jpg")).toThrow(/SUPABASE_URL/i);
  });
});
