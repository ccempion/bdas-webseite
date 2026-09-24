"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { clearProfilePhoto, setProfilePhoto } from "@bdas/profile";

import { purgeUnreferencedPhoto } from "../_profile/photo-url";
import { readSessionCookie } from "../../lib/auth-cookie";

export type SavePhotoState = {
  readonly notice?: string;
  readonly error?: string;
};

/**
 * Persist a freshly uploaded profile photo on its own, so the avatar control at
 * the top of /account saves immediately instead of waiting on the extended
 * profile form far below it. Works for every user type. A member without a
 * profile row yet is pointed at the extended profile instead of a silent no-op.
 */
export async function savePhotoAction(storageKey: string): Promise<SavePhotoState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const key = storageKey.trim();
  if (key === "") return { error: "Kein Bild ausgewählt." };

  try {
    const { updated, supersededPhotoStorageKey } = await setProfilePhoto(db, {
      userId: me.user.id,
      actor: { userId: me.user.id, grants: me.grants },
      photoStorageKey: key,
    });
    if (!updated) {
      return {
        error: "Bitte fülle zuerst deine Angaben aus, dann kannst du ein Bild setzen.",
      };
    }
    // The photo it just replaced is now unreachable — personal data (spec §7)
    // should not outlive the profile that referenced it.
    await purgeUnreferencedPhoto(supersededPhotoStorageKey, me.user.id);

    revalidatePath("/account");
    return { notice: "Profilbild aktualisiert." };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}

/**
 * Drop the profile photo, leaving the rest of the profile alone.
 *
 * Clearing has its own module service because a null photo key inside
 * `saveProfile` means "unchanged", not "delete".
 */
export async function removePhotoAction(): Promise<SavePhotoState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  try {
    const { cleared, previousStorageKey } = await clearProfilePhoto(db, {
      userId: me.user.id,
      actor: { userId: me.user.id, grants: me.grants },
    });
    if (!cleared) return { error: "Es ist kein Profilbild gespeichert." };

    // Personal data (spec §7): "entfernt" has to mean the bytes are gone, not
    // just unreferenced.
    await purgeUnreferencedPhoto(previousStorageKey, me.user.id);

    revalidatePath("/account");
    return { notice: "Profilbild entfernt." };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
