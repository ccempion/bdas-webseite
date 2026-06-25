"use server";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { isFlagOn } from "@bdas/feature-flags";
import { getDownloadUrl } from "@bdas/files";
import { getCurrentMember } from "@bdas/members";

import { readSessionCookie } from "../../lib/auth-cookie";

export type DownloadResult = { readonly url: string } | { readonly error: string };

/**
 * Resolve a signed, time-limited download URL for one file. The service
 * read-gates by the caller's permissions and logs a 'download' entry; the
 * browser then fetches the bytes straight from storage (the app never proxies).
 */
export async function getDownloadUrlAction(fileId: string): Promise<DownloadResult> {
  if (!isFlagOn("files")) return { error: "Nicht verfügbar." };

  const me = await getCurrentMember(getDb(), readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    const signed = await getDownloadUrl(getDb(), fileId, me);
    return { url: signed.url };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
