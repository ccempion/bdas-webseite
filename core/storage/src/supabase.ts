import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SignedUrl, StorageClient } from "./index";

const DEFAULT_UPLOAD_TTL = 7200; // Supabase signed upload URLs default to ~2h
const DEFAULT_DOWNLOAD_TTL = 300;
const PREFIX_RE = /^(?:[A-Za-z0-9._-]+\/)+$/;
const PAGE = 100;
const MAX_ROUNDS = 10_000;

export type SupabaseStorageOptions = {
  readonly url: string;
  readonly serviceRoleKey: string;
  readonly bucket: string;
};

/** Splits "a/b/f.pdf" → { dir: "a/b", base: "f.pdf" }. dir is "" at the root. */
function splitKey(storageKey: string): { dir: string; base: string } {
  const i = storageKey.lastIndexOf("/");
  if (i === -1) return { dir: "", base: storageKey };
  return { dir: storageKey.slice(0, i), base: storageKey.slice(i + 1) };
}

export class SupabaseStorageClient implements StorageClient {
  private readonly client: SupabaseClient;
  private readonly bucket: string;

  constructor(opts: SupabaseStorageOptions) {
    this.client = createClient(opts.url, opts.serviceRoleKey, {
      auth: { persistSession: false },
    });
    this.bucket = opts.bucket;
  }

  async signedUploadUrl(args: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    ttlSeconds?: number;
  }): Promise<SignedUrl> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUploadUrl(args.storageKey);
    if (error) throw new Error(error.message);
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + (args.ttlSeconds ?? DEFAULT_UPLOAD_TTL) * 1000),
    };
  }

  async signedDownloadUrl(args: { storageKey: string; ttlSeconds?: number }): Promise<SignedUrl> {
    const ttl = args.ttlSeconds ?? DEFAULT_DOWNLOAD_TTL;
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(args.storageKey, ttl);
    if (error) throw new Error(error.message);
    return { url: data.signedUrl, expiresAt: new Date(Date.now() + ttl * 1000) };
  }

  async statObject(storageKey: string): Promise<{ sizeBytes: number } | null> {
    const { dir, base } = splitKey(storageKey);
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .list(dir, { limit: 100, search: base });
    if (error) throw new Error(error.message);
    const match = data?.find((o) => o.name === base);
    const size = match?.metadata?.["size"];
    return typeof size === "number" ? { sizeBytes: size } : null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    const { error } = await this.client.storage.from(this.bucket).remove([storageKey]);
    if (error) throw new Error(error.message);
  }

  async deleteByPrefix(prefix: string): Promise<{ deleted: number }> {
    if (!PREFIX_RE.test(prefix) || prefix.split("/").some((s) => s === "." || s === "..")) {
      throw new Error("deleteByPrefix: invalid prefix");
    }
    return { deleted: await this.purgeDir(prefix.slice(0, -1)) };
  }

  private async purgeDir(dir: string): Promise<number> {
    let deleted = 0;
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { data, error } = await this.client.storage
        .from(this.bucket)
        .list(dir, { limit: PAGE, offset: 0 });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) return deleted;
      const files = data.filter((o) => o.id !== null).map((o) => `${dir}/${o.name}`);
      for (const sub of data.filter((o) => o.id === null)) {
        deleted += await this.purgeDir(`${dir}/${sub.name}`);
      }
      if (files.length > 0) {
        const { error: rmErr } = await this.client.storage.from(this.bucket).remove(files);
        if (rmErr) throw new Error(rmErr.message);
        deleted += files.length;
      }
    }
    throw new Error("deleteByPrefix: exceeded round limit");
  }

  publicUrl(storageKey: string): string {
    return this.client.storage.from(this.bucket).getPublicUrl(storageKey).data.publicUrl;
  }
}
