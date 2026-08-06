"use server";

import { revalidatePath } from "next/cache";

import { getDb } from "@bdas/db";
import { isAppError } from "@bdas/errors";
import { requireFlag } from "@bdas/feature-flags";
import { getCurrentMember } from "@bdas/members";
import { clearProfilePhoto, getProfile, saveProfile } from "@bdas/profile";

import { deleteProfilePhotoObject } from "../_profile/photo-url";
import { readSessionCookie } from "../../lib/auth-cookie";

export type SavePhotoState = {
  readonly notice?: string;
  readonly error?: string;
};

/**
 * Persist a freshly uploaded profile photo on its own, so the avatar control at
 * the top of /account saves immediately instead of waiting on the extended
 * profile form far below it.
 *
 * `member_profiles` carries NOT NULL study fields and `saveProfile` validates
 * the whole record, so there is no photo-only write at the module level. This
 * re-submits the stored values unchanged with the new key — which also means a
 * member without a profile row yet cannot set a photo here; they get pointed at
 * the extended profile instead of a silent no-op.
 */
export async function savePhotoAction(storageKey: string): Promise<SavePhotoState> {
  requireFlag("profile");

  const db = getDb();
  const me = await getCurrentMember(db, readSessionCookie());
  if (!me?.member) return { error: "Anmeldung erforderlich." };

  const key = storageKey.trim();
  if (key === "") return { error: "Kein Bild ausgewählt." };

  const existing = await getProfile(db, me.user.id);
  if (!existing) {
    return {
      error: "Bitte fülle zuerst das erweiterte Profil aus, dann kannst du ein Bild setzen.",
    };
  }

  try {
    await saveProfile(db, {
      userId: me.user.id,
      fields: {
        studiengang: existing.studiengang,
        abschlussart: existing.abschlussart,
        uni: existing.uni,
        geburtsdatum: existing.geburtsdatum,
        gefundenDurch: existing.gefundenDurch,
        empfehlerName: existing.empfehlerName,
        photoStorageKey: key,
      },
      actor: { userId: me.user.id, grants: me.grants },
      groupId: me.member.primaryGroupId ?? null,
    });
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
 * Unlike `savePhotoAction` this does not re-submit the whole record: clearing
 * has a dedicated module service precisely because a null photo key inside
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
    // just unreferenced. The row is already clear, so a failure here leaves an
    // orphaned object rather than a broken profile — the member's photo is gone
    // from their side either way, so this is an operator problem, not theirs.
    if (!(await deleteProfilePhotoObject(previousStorageKey))) {
      console.error(`[profile] photo object not deleted for user ${me.user.id}`);
    }

    revalidatePath("/account");
    return { notice: "Profilbild entfernt." };
  } catch (err) {
    if (isAppError(err)) return { error: err.message };
    throw err;
  }
}
