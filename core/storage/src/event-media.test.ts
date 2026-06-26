import { afterEach, describe, expect, it, vi } from "vitest";

import { getEventMediaStorage } from "./index";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
  vi.resetModules();
});

describe("getEventMediaStorage", () => {
  it("throws a clear error when storage env is missing", () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    expect(() => getEventMediaStorage()).toThrow(/event-media/i);
  });

  it("builds a public URL for a key when configured", () => {
    process.env["SUPABASE_URL"] = "https://proj.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    const url = getEventMediaStorage().publicUrl("evt_1/cover.jpg");
    expect(url).toContain("/storage/v1/object/public/event-media/evt_1/cover.jpg");
  });
});
