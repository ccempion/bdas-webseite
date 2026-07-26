/**
 * Signed-URL resolution for the private profile photo.
 *
 * Profile photos live in a private bucket (spec §7, personal data), so they are
 * readable only through a short-lived signed URL. A missing or unreadable
 * object must never break the page that renders it — the caller gets `null` and
 * falls back to "no image", which is exactly how the pending-members admin view
 * already treats it.
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
