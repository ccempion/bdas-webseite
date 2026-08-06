/**
 * Storage access for the private profile photo.
 *
 * Profile photos live in a private bucket (spec §7, personal data), so they are
 * readable only through a short-lived signed URL. A missing or unreadable
 * object must never break the page that renders it — the caller gets `null` and
 * falls back to "no image", which is how the board's Bewerbungen queue treats it.
 *
 * The app layer owns this rather than `@bdas/profile`: the module owns the
 * `photo_storage_key` column, not the bytes it points at.
 */
import { getProfileMediaStorage } from "@bdas/storage";

/** Match the TTL the admin view uses; long enough to render, short enough to leak nothing. */
export const PHOTO_URL_TTL_SECONDS = 300;

export async function signedProfilePhotoUrl(
  storageKey: string | null | undefined,
): Promise<string | null> {
  if (!storageKey) return null;
  try {
    const signed = await getProfileMediaStorage().signedDownloadUrl({
      storageKey,
      ttlSeconds: PHOTO_URL_TTL_SECONDS,
    });
    return signed.url;
  } catch {
    return null;
  }
}

/**
 * Delete the stored photo object. Returns whether the object is gone.
 *
 * Callers clear `photo_storage_key` first and delete second: once the column is
 * null the photo is gone as far as the member and every reader is concerned,
 * and nothing can mint a signed URL for the key any more. A failure here leaves
 * an unreferenced object behind rather than a row pointing at nothing, which is
 * the better of the two failure modes — so this reports the failure instead of
 * throwing, and the caller decides what to say.
 */
export async function deleteProfilePhotoObject(
  storageKey: string | null | undefined,
): Promise<boolean> {
  if (!storageKey) return true;
  try {
    await getProfileMediaStorage().deleteObject(storageKey);
    return true;
  } catch {
    return false;
  }
}
