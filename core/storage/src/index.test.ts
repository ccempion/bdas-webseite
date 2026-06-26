import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Avoid touching the real Supabase SDK; we only assert which driver is chosen.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: vi.fn() } }),
}));

const OLD_ENV = { ...process.env };

describe("getStorage lazy env init", () => {
  beforeEach(() => {
    vi.resetModules(); // fresh module-level _client per test
  });
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("returns the Supabase driver when env is configured", async () => {
    process.env["SUPABASE_URL"] = "https://x.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "k";
    const { getStorage, SupabaseStorageClient } = await import("./index");
    expect(getStorage()).toBeInstanceOf(SupabaseStorageClient);
  });

  it("falls back to a stub that throws on use when env is absent", async () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    const { getStorage } = await import("./index");
    await expect(getStorage().signedDownloadUrl({ storageKey: "x" })).rejects.toThrow(
      /not configured/i,
    );
  });

  it("prefers an explicitly injected client over the env default", async () => {
    process.env["SUPABASE_URL"] = "https://x.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "k";
    const { getStorage, setStorage } = await import("./index");
    const fake = {
      signedUploadUrl: vi.fn(),
      signedDownloadUrl: vi.fn(),
      statObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    setStorage(fake);
    expect(getStorage()).toBe(fake);
  });
});
