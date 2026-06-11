import { beforeEach, describe, expect, it, vi } from "vitest";

const { fromMock, createSignedUploadUrl, createSignedUrl, list, remove } = vi.hoisted(() => {
  const createSignedUploadUrl = vi.fn();
  const createSignedUrl = vi.fn();
  const list = vi.fn();
  const remove = vi.fn();
  const fromMock = vi.fn(() => ({ createSignedUploadUrl, createSignedUrl, list, remove }));
  return { fromMock, createSignedUploadUrl, createSignedUrl, list, remove };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: fromMock } }),
}));

import { SupabaseStorageClient } from "./supabase";

function makeClient(): SupabaseStorageClient {
  return new SupabaseStorageClient({
    url: "https://x.supabase.co",
    serviceRoleKey: "k",
    bucket: "files",
  });
}

describe("SupabaseStorageClient", () => {
  beforeEach(() => {
    createSignedUploadUrl.mockReset();
    createSignedUrl.mockReset();
    list.mockReset();
    remove.mockReset();
  });

  it("mints a signed upload URL", async () => {
    createSignedUploadUrl.mockResolvedValue({ data: { signedUrl: "https://up" }, error: null });
    const res = await makeClient().signedUploadUrl({
      storageKey: "a/b/f.pdf",
      mimeType: "application/pdf",
      sizeBytes: 10,
    });
    expect(res.url).toBe("https://up");
    expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(fromMock).toHaveBeenCalledWith("files");
    expect(createSignedUploadUrl).toHaveBeenCalledWith("a/b/f.pdf");
  });

  it("mints a signed download URL honoring ttl", async () => {
    createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://dl" }, error: null });
    const res = await makeClient().signedDownloadUrl({ storageKey: "a/b/f.pdf", ttlSeconds: 60 });
    expect(res.url).toBe("https://dl");
    expect(createSignedUrl).toHaveBeenCalledWith("a/b/f.pdf", 60);
  });

  it("statObject returns the matching object's size", async () => {
    list.mockResolvedValue({ data: [{ name: "f.pdf", metadata: { size: 1234 } }], error: null });
    const res = await makeClient().statObject("a/b/f.pdf");
    expect(res).toEqual({ sizeBytes: 1234 });
    expect(list).toHaveBeenCalledWith("a/b", { limit: 100, search: "f.pdf" });
  });

  it("statObject returns null when the object is absent", async () => {
    list.mockResolvedValue({ data: [], error: null });
    expect(await makeClient().statObject("a/b/f.pdf")).toBeNull();
  });

  it("throws on a Supabase error result", async () => {
    remove.mockResolvedValue({ data: null, error: { message: "nope" } });
    await expect(makeClient().deleteObject("a/b/f.pdf")).rejects.toThrow("nope");
  });
});
