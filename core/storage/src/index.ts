/**
 * Object storage interface used by the `files` module (Phase 2).
 *
 * The interface is defined in Sprint 0 so module schemas and service
 * contracts can reference it without waiting for the Supabase Storage
 * driver. The real implementation lands in Phase 2 — until then,
 * `getStorage()` returns a stub that throws on call.
 *
 * Hard rule (per spec §11): the app never proxies file bytes. All
 * uploads and downloads use signed URLs minted server-side here.
 */

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

let _client: StorageClient = new NotConfiguredStorageClient();

export function getStorage(): StorageClient {
  return _client;
}

/** Composition-time wiring (called by app bootstrap, not by modules). */
export function setStorage(client: StorageClient): void {
  _client = client;
}

export { SupabaseStorageClient } from "./supabase";
