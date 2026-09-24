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

function fakeBucket(keys: string[]): Set<string> {
  const bucket = new Set(keys);
  list.mockImplementation(async (dir: string, opts: { limit: number; offset: number }) => {
    const prefix = dir === "" ? "" : `${dir}/`;
    const entries = new Map<string, boolean>();
    for (const key of [...bucket].sort()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) entries.set(rest, true);
      else if (!entries.has(rest.slice(0, slash))) entries.set(rest.slice(0, slash), false);
    }
    const page = [...entries]
      .slice(opts.offset, opts.offset + opts.limit)
      .map(([name, isFile]) => ({ name, id: isFile ? `id-${name}` : null }));
    return { data: page, error: null };
  });
  remove.mockImplementation(async (paths: string[]) => {
    for (const p of paths) bucket.delete(p);
    return { data: null, error: null };
  });
  return bucket;
}

describe("SupabaseStorageClient.deleteByPrefix", () => {
  beforeEach(() => {
    fromMock.mockClear();
    list.mockReset();
    remove.mockReset();
  });

  it.each(["", "/", "//", "a", "a//", "../x/", "a/../", " /", "a/b", "./", "a/./"])(
    "rejects invalid prefix %j without touching the network",
    async (prefix) => {
      await expect(makeClient().deleteByPrefix(prefix)).rejects.toThrow(/invalid prefix/);
      expect(list).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
    },
  );

  it("lists and removes in pages until the prefix is empty, returns the count", async () => {
    const keys = [
      ...Array.from({ length: 250 }, (_, i) => `u1/f${String(i).padStart(3, "0")}.png`),
      ...Array.from({ length: 5 }, (_, i) => `u2/g${i}.png`),
    ];
    const bucket = fakeBucket(keys);
    await expect(makeClient().deleteByPrefix("u1/")).resolves.toEqual({ deleted: 250 });
    expect([...bucket].filter((k) => k.startsWith("u1/"))).toEqual([]);
    expect([...bucket].filter((k) => k.startsWith("u2/"))).toHaveLength(5);
    for (const [dir] of list.mock.calls) expect(dir).toBe("u1");
    for (const [paths] of remove.mock.calls) {
      for (const p of paths as string[]) expect(p.startsWith("u1/")).toBe(true);
    }
  });

  it("recurses into sub-folders", async () => {
    const bucket = fakeBucket(["u1/a.png", "u1/sub/x.png", "u1/sub/deep/y.png", "u10/keep.png"]);
    await expect(makeClient().deleteByPrefix("u1/")).resolves.toEqual({ deleted: 3 });
    expect([...bucket]).toEqual(["u10/keep.png"]);
  });

  it("returns zero for an empty prefix", async () => {
    fakeBucket(["u2/a.png"]);
    await expect(makeClient().deleteByPrefix("u1/")).resolves.toEqual({ deleted: 0 });
    expect(remove).not.toHaveBeenCalled();
  });

  it("throws when list reports an error", async () => {
    list.mockResolvedValue({ data: null, error: { message: "list boom" } });
    await expect(makeClient().deleteByPrefix("u1/")).rejects.toThrow("list boom");
  });

  it("throws when remove reports an error", async () => {
    list.mockResolvedValue({ data: [{ name: "a.png", id: "x" }], error: null });
    remove.mockResolvedValue({ data: null, error: { message: "remove boom" } });
    await expect(makeClient().deleteByPrefix("u1/")).rejects.toThrow("remove boom");
  });
});
