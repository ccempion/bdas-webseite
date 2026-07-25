import { afterEach, describe, expect, it } from "vitest";

import { getProfileMediaStorage } from "./index";
import { SupabaseStorageClient } from "./supabase";

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe("getProfileMediaStorage", () => {
  it("throws without SUPABASE_URL + service role key", () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SERVICE_ROLE_KEY"];
    expect(() => getProfileMediaStorage()).toThrow(/profile-media/);
  });

  it("builds a Supabase client when configured", () => {
    process.env["SUPABASE_URL"] = "https://x.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "svc";
    expect(getProfileMediaStorage()).toBeInstanceOf(SupabaseStorageClient);
  });
});
