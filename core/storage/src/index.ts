/**
 * Object storage interface used by the `files` module (Phase 2).
 *
 * The interface is defined in Sprint 0 so module schemas and service
 * contracts can reference it without waiting for the Supabase Storage
 * driver. The real implementation lands in Phase 2.
 *
 * `getStorage()` lazily self-initializes from the environment on first use:
 * with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY it returns the Supabase driver,
 * otherwise a stub that throws on call. This matters because Next.js can bundle
 * `instrumentation.ts` and route handlers as SEPARATE module instances, so a
 * `setStorage()` wired at boot in one is invisible to `getStorage()` in the
 * other. Self-wiring from env makes every copy configure itself identically;
 * `setStorage()` still wins when an explicit client (e.g. a test fake) is
 * injected.
 *
 * Hard rule (per spec §11): the app never proxies file bytes. All
 * uploads and downloads use signed URLs minted server-side here.
 */

import { SupabaseStorageClient } from "./supabase";

export type SignedUrl = {
  readonly url: string;
  readonly expiresAt: Date;
};

export interface StorageClient {
  signedUploadUrl(args: {
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    ttlSeconds?: number;
  }): Promise<SignedUrl>;

  signedDownloadUrl(args: { storageKey: string; ttlSeconds?: number }): Promise<SignedUrl>;

  /** Real size of an uploaded object, or null if it does not exist. */
  statObject(storageKey: string): Promise<{ sizeBytes: number } | null>;

  deleteObject(storageKey: string): Promise<void>;
}

class NotConfiguredStorageClient implements StorageClient {
  private fail(): never {
    throw new Error(
      "Storage is not configured. Phase 2 wires this to Supabase Storage. " +
        "Until then, the `files` feature flag must remain off.",
    );
  }
  async signedUploadUrl(): Promise<SignedUrl> {
    return this.fail();
  }
  async signedDownloadUrl(): Promise<SignedUrl> {
    return this.fail();
  }
  async statObject(): Promise<{ sizeBytes: number } | null> {
    return this.fail();
  }
  async deleteObject(): Promise<void> {
    return this.fail();
  }
}

/** Build the default client from the environment (Supabase driver or stub). */
function clientFromEnv(): StorageClient {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_STORAGE_BUCKET"] ?? "files";
  if (url && serviceRoleKey) {
    return new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  }
  return new NotConfiguredStorageClient();
}

let _client: StorageClient | null = null;

export function getStorage(): StorageClient {
  if (_client === null) _client = clientFromEnv();
  return _client;
}

/** Composition-time wiring (tests inject a fake; boot may pre-wire). */
export function setStorage(client: StorageClient): void {
  _client = client;
}

let _eventMedia: SupabaseStorageClient | null = null;

/** Storage client for the public `event-media` bucket (event covers + inline images). */
export function getEventMediaStorage(): SupabaseStorageClient {
  if (_eventMedia) return _eventMedia;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_EVENT_MEDIA_BUCKET"] ?? "event-media";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "event-media storage is not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  _eventMedia = new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  return _eventMedia;
}

/** Deterministic public URL for an event-media object. Needs only SUPABASE_URL
 *  (no service-role key) — safe to call on public read paths. */
export function eventMediaPublicUrl(storageKey: string): string {
  const url = process.env["SUPABASE_URL"];
  const bucket = process.env["SUPABASE_EVENT_MEDIA_BUCKET"] ?? "event-media";
  if (!url) {
    throw new Error("event-media public URL needs SUPABASE_URL.");
  }
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${storageKey}`;
}

let _blogMedia: SupabaseStorageClient | null = null;

/** Storage client for the public `blog-media` bucket (inline post images). */
export function getBlogMediaStorage(): SupabaseStorageClient {
  if (_blogMedia) return _blogMedia;
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const bucket = process.env["SUPABASE_BLOG_MEDIA_BUCKET"] ?? "blog-media";
  if (!url || !serviceRoleKey) {
    throw new Error(
      "blog-media storage is not configured (need SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).",
    );
  }
  _blogMedia = new SupabaseStorageClient({ url, serviceRoleKey, bucket });
  return _blogMedia;
}

/** Deterministic public URL for a blog-media object. Needs only SUPABASE_URL. */
export function blogMediaPublicUrl(storageKey: string): string {
  const url = process.env["SUPABASE_URL"];
  const bucket = process.env["SUPABASE_BLOG_MEDIA_BUCKET"] ?? "blog-media";
  if (!url) {
    throw new Error("blog-media public URL needs SUPABASE_URL.");
  }
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/${storageKey}`;
}

export { SupabaseStorageClient };
